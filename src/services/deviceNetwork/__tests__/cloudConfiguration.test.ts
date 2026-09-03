import type {
  CloudDeviceClient,
  CloudDeviceRecord,
  DeviceCloudCommitFence,
  DeviceCloudConnectionSnapshot,
  DeviceConnectionGrant,
  DeviceRelayReservationToken,
  LocalDeviceIdentity,
  TrustedDeviceRecord,
} from 'memeloop/device-network';
import { CloudDeviceFetchClient, CloudDeviceFetchError, DeviceCloudConnectionCoordinator, StandardDeviceCloudConnectionAdapter } from 'memeloop/device-network';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IDatabaseService } from '@services/database/interface';

import {
  classifyCloudConnectionError,
  CLOUD_DEVICE_FRESHNESS_MS,
  cloudDeviceReachability,
  DeviceNetworkService,
  DeviceNetworkSettingsStore,
  hasValidDirectDeviceAddress,
  locallyPairedRecord,
  pairingInviteMultiaddrs,
  validateCloudConfiguration,
} from '../index';
import type { DeviceNetworkPersistedSettings } from '../interface';
import { createInitialDeviceCloudConnectionStatus } from '../interface';

vi.mock('@memeloop/libp2p', async (importOriginal) => ({
  ...await importOriginal<typeof import('@memeloop/libp2p')>(),
  signDeviceBinding: vi.fn(async () => 'binding-signature'),
  signDeviceIdentityPayload: vi.fn(async () => 'heartbeat-signature'),
}));

function currentFence(generation = 1): DeviceCloudCommitFence {
  const controller = new AbortController();
  return {
    generation,
    signal: controller.signal,
    isCurrent: () => !controller.signal.aborted,
    throwIfStale: () => {
      controller.signal.throwIfAborted();
    },
    commitSynchronous: (operation) => {
      if (controller.signal.aborted) return false;
      operation();
      return true;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function cloudResponse(url: string): Response {
  const body = url.endsWith('/api/devices/connection-grant/public-key')
    ? { issuer: 'memeloop-cloud', publicKeyMultibase: 'zCloudPublicKey' }
    : { devices: [] };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function reservation(expiresAt: number): DeviceRelayReservationToken {
  return {
    issuer: 'memeloop-cloud',
    accountId: 'account-1',
    peerId: 'peer-1',
    relayMultiaddrs: [],
    bootstrapMultiaddrs: [],
    issuedAt: 1,
    expiresAt,
    signature: 'signature',
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T) => void;
} {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });
  return { promise, reject, resolve };
}

function createCloudHostHarness(options: {
  cloudUrl?: string;
  createRelayReservation?: CloudDeviceClient['createRelayReservation'];
  heartbeat?: CloudDeviceClient['heartbeat'];
  multiaddrs?: string[];
} = {}) {
  let persisted: DeviceNetworkPersistedSettings | undefined;
  const database = {
    getSetting: vi.fn(() => persisted),
    setSetting: vi.fn((_key: 'deviceNetwork', value: DeviceNetworkPersistedSettings) => {
      persisted = value;
    }),
    immediatelyStoreSettingsToFile: vi.fn(async () => undefined),
  } as unknown as IDatabaseService;
  const identity: LocalDeviceIdentity = {
    peerId: 'local-peer',
    publicKeyMultibase: 'zLocalKey',
    privateKeyRef: 'test',
    deviceName: 'Desktop',
    platform: 'desktop',
    createdAt: 1,
  };
  const client = {
    createBindingNonce: vi.fn(async () => ({
      accountId: 'account-1',
      expiresAt: 'later',
      nonce: 'binding-nonce',
    })),
    createConnectionGrant: vi.fn(),
    createRelayReservation: vi.fn(options.createRelayReservation ?? (async () => reservation(Date.now() + 600_000))),
    getConnectionGrantPublicKey: vi.fn(async () => ({
      issuer: 'memeloop-cloud' as const,
      publicKeyMultibase: 'zCloudSigningKey',
    })),
    heartbeat: vi.fn(options.heartbeat ?? (async () => ({ ok: true }))),
    listDevices: vi.fn(async () => []),
    registerDevice: vi.fn(async () => ({ ok: true, peerId: identity.peerId })),
  } as unknown as CloudDeviceClient;
  const core = {
    clearRelayReservation: vi.fn(async () => undefined),
    configureRelayReservation: vi.fn(async () => undefined),
    getMultiaddrs: vi.fn(() => options.multiaddrs ?? []),
    getTrustedDevice: vi.fn(() => undefined),
    listCloudDeviceAddressPeerIds: vi.fn(() => []),
    removeCloudDeviceAddresses: vi.fn(),
    removeCloudDiscoveredDevice: vi.fn(),
    removeCloudTrustedDevice: vi.fn(async () => undefined),
    setCloudDeviceAddresses: vi.fn(),
    upsertCloudDiscoveredDevice: vi.fn(),
    upsertCloudTrustedDevice: vi.fn(),
  };
  const service = new DeviceNetworkService({} as never, database);
  const cloudUrl = options.cloudUrl ?? 'https://cloud.example.test';
  Object.assign(service as unknown as Record<string, unknown>, {
    cloudClient: client,
    cloudConfig: { accessToken: 'token', client, cloudUrl },
    core,
    identity,
    mutableAuthorizer: {
      resetDelegate: vi.fn(),
      setDelegate: vi.fn(() => true),
    },
    runtimeOptions: {
      buildCapabilities: async () => ({
        tools: [],
        mcpServers: [],
        hasWiki: false,
        agentLoop: true,
        imChannels: [],
        wikis: [],
      }),
    },
  });
  const adapter = (service as unknown as {
    createStandardCloudAdapter(): StandardDeviceCloudConnectionAdapter;
  }).createStandardCloudAdapter();
  Object.assign(service as unknown as Record<string, unknown>, { standardCloudAdapter: adapter });
  (service as unknown as { ensureCloudCoordinator(): void }).ensureCloudCoordinator();
  const coordinator = (service as unknown as {
    cloudCoordinator: DeviceCloudConnectionCoordinator<CloudDeviceClient>;
  }).cloudCoordinator;

  return { adapter, client, coordinator, core, readPersisted: () => persisted, service };
}

const registrationInvalidError = new CloudDeviceFetchError('cloud_http_error', {
  responseBody: '{"error":"device_not_found"}',
  status: 404,
});
// memeloop@0.2.8 exposes the coordinator classification but its standard
// adapter still collapses this Cloud response to `error`. This capability
// probe turns the host regression on automatically when the Core adapter fix
// is consumed, without copying Cloud response classification into Desktop.
const coreSupportsRegistrationInvalid = (
  StandardDeviceCloudConnectionAdapter.prototype as unknown as {
    classifyError(error: unknown): string;
  }
).classifyError(registrationInvalidError) === 'registration-invalid';

describe('DeviceNetwork Cloud configuration', () => {
  it('keeps the Desktop Cloud status assignable to Core snapshots', () => {
    const snapshot: DeviceCloudConnectionSnapshot = createInitialDeviceCloudConnectionStatus();
    expect(snapshot).toMatchObject({
      status: 'not-configured',
      generation: 0,
      components: {
        authorizer: 'not-run',
        registration: 'not-run',
        relay: 'not-run',
        heartbeat: 'not-run',
        directory: 'not-run',
      },
    });
  });

  it('accepts HTTPS and normalizes the service origin', () => {
    expect(validateCloudConfiguration({
      cloudUrl: ' https://cloud.example.test/ ',
      accessToken: ' token-value ',
    })).toEqual({
      cloudUrl: 'https://cloud.example.test',
      accessToken: 'token-value',
    });
  });

  it('allows HTTP only for loopback development endpoints', () => {
    expect(
      validateCloudConfiguration({
        cloudUrl: 'http://127.0.0.1:4000',
        accessToken: 'token',
      }).cloudUrl,
    ).toBe('http://127.0.0.1:4000');
    expect(() =>
      validateCloudConfiguration({
        cloudUrl: 'http://cloud.example.test',
        accessToken: 'token',
      })
    ).toThrow('cloud_url_requires_https');
  });

  it('rejects embedded credentials, paths, query strings, and empty tokens', () => {
    for (
      const cloudUrl of [
        'https://user:password@cloud.example.test',
        'https://cloud.example.test/api',
        'https://cloud.example.test?token=secret',
        'https://cloud.example.test#fragment',
      ]
    ) {
      expect(() => validateCloudConfiguration({ cloudUrl, accessToken: 'token' })).toThrow('invalid_cloud_url');
    }
    expect(() =>
      validateCloudConfiguration({
        cloudUrl: 'https://cloud.example.test',
        accessToken: '   ',
      })
    ).toThrow('invalid_cloud_access_token');
  });

  it('allows only explicit local pairing to bypass a Cloud grant', () => {
    const baseRecord = {
      peerId: 'peer-1',
      publicKeyMultibase: 'zPublicKey',
      deviceName: 'Peer',
      platform: 'desktop' as const,
      createdAt: 1,
    };
    const localRecord = { ...baseRecord, trustMode: 'local-pairing' as const };
    const cloudRecord = { ...baseRecord, trustMode: 'cloud-account' as const, accountId: 'account-1' };

    expect(locallyPairedRecord(localRecord)).toBe(localRecord);
    expect(locallyPairedRecord(cloudRecord)).toBeUndefined();
    expect(locallyPairedRecord(undefined)).toBeUndefined();
  });

  it('marks Cloud directory entries online only while their advertised paths are fresh', () => {
    const now = 1_000_000;
    expect(cloudDeviceReachability({
      lastSeen: now - CLOUD_DEVICE_FRESHNESS_MS,
      multiaddrs: ['/ip4/192.168.1.20/tcp/4001/ws/p2p/peer-1'],
      relayReservations: [],
    }, now)).toEqual({ state: 'online', paths: ['direct'] });
    expect(cloudDeviceReachability({
      lastSeen: now - CLOUD_DEVICE_FRESHNESS_MS - 1,
      multiaddrs: ['/ip4/192.168.1.20/tcp/4001/ws/p2p/peer-1'],
      relayReservations: ['/dns4/relay.example.test/tcp/443/wss/p2p/relay/p2p-circuit/p2p/peer-1'],
    }, now)).toEqual({ state: 'offline', paths: [] });
    expect(cloudDeviceReachability({
      lastSeen: now,
      multiaddrs: [],
      relayReservations: [],
    }, now)).toEqual({ state: 'offline', paths: [] });
  });

  it('requires relay only when no externally dialable direct address exists', () => {
    expect(hasValidDirectDeviceAddress([
      '/ip4/0.0.0.0/tcp/4001/ws',
      '/ip4/127.0.0.1/tcp/4001/ws',
      '/ip4/10.0.0.8/tcp/4001/ws/p2p/peer-1/p2p-circuit',
    ])).toBe(false);
    expect(hasValidDirectDeviceAddress(['/ip4/192.168.1.20/tcp/4001/ws/p2p/peer-1'])).toBe(true);
    expect(hasValidDirectDeviceAddress(['/dns4/device.example.test/tcp/443/wss/p2p/peer-1'])).toBe(true);
  });

  it('builds only PeerId-bound dialable WebSocket invitation addresses', () => {
    expect(pairingInviteMultiaddrs([
      '/ip4/0.0.0.0/tcp/4001/ws',
      '/ip4/192.168.1.20/tcp/4001',
      '/ip4/192.168.1.20/tcp/4001/ws',
      '/ip4/192.168.1.20/tcp/4001/ws',
    ], 'peer-1')).toEqual(['/ip4/192.168.1.20/tcp/4001/ws/p2p/peer-1']);
    expect(() => pairingInviteMultiaddrs(['/ip4/127.0.0.1/tcp/4001/ws'], 'peer-1'))
      .toThrow('no_dialable_websocket_address');
  });

  it('classifies account errors separately from offline transport failures', () => {
    expect(classifyCloudConnectionError(new Error('401 unauthorized'))).toBe('error');
    expect(classifyCloudConnectionError(new TypeError('fetch failed'))).toBe('offline');
  });

  it('validates a replacement before stopping or overwriting the working configuration', async () => {
    let persisted: DeviceNetworkPersistedSettings | undefined;
    const stop = vi.fn(async () => undefined);
    const database = {
      getSetting: vi.fn(() => persisted),
      setSetting: vi.fn((_key: 'deviceNetwork', value: DeviceNetworkPersistedSettings) => {
        persisted = value;
      }),
      immediatelyStoreSettingsToFile: vi.fn(async () => undefined),
    } as unknown as IDatabaseService;
    const service = new DeviceNetworkService({} as never, database);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input);
        if (url.startsWith('https://rejected.example.test')) {
          return new Response('{"error":"unauthorized"}', { status: 401 });
        }
        return cloudResponse(url);
      }),
    );

    await service.configureCloud({ cloudUrl: 'https://working.example.test', accessToken: 'working-token' });
    Object.assign(service as unknown as Record<string, unknown>, {
      started: true,
      cloudCoordinator: { stop },
    });
    await expect(service.configureCloud({
      cloudUrl: 'https://rejected.example.test',
      accessToken: 'bad-token',
    })).rejects.toThrow('cloud_http_error');

    expect(stop).not.toHaveBeenCalled();
    expect(persisted?.cloudConfigurationV1?.cloudUrl).toBe('https://working.example.test');
  });

  it('lets only the latest concurrently validated configuration reach durable state', async () => {
    let persisted: DeviceNetworkPersistedSettings | undefined;
    const database = {
      getSetting: vi.fn(() => persisted),
      setSetting: vi.fn((_key: 'deviceNetwork', value: DeviceNetworkPersistedSettings) => {
        persisted = value;
      }),
      immediatelyStoreSettingsToFile: vi.fn(async () => undefined),
    } as unknown as IDatabaseService;
    const service = new DeviceNetworkService({} as never, database);
    let releaseOlder!: () => void;
    const olderBlocked = new Promise<void>((resolve) => {
      releaseOlder = resolve;
    });
    let olderFetchStarted!: () => void;
    const olderStarted = new Promise<void>((resolve) => {
      olderFetchStarted = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input);
        if (url.startsWith('https://older.example.test')) {
          olderFetchStarted();
          await olderBlocked;
        }
        return cloudResponse(url);
      }),
    );

    const older = service.configureCloud({ cloudUrl: 'https://older.example.test', accessToken: 'older-token' });
    const olderRejection = expect(older).rejects.toThrow();
    await olderStarted;
    await service.configureCloud({ cloudUrl: 'https://latest.example.test', accessToken: 'latest-token' });
    releaseOlder();

    await olderRejection;
    expect(persisted?.cloudConfigurationV1).toEqual({
      cloudUrl: 'https://latest.example.test',
      encryptedAccessToken: Buffer.from('encrypted:latest-token', 'utf8').toString('base64'),
    });
    expect(service.cloudStatus$.value).toMatchObject({
      cloudUrl: 'https://latest.example.test',
      status: 'offline',
    });
  });

  it('lets clearing configuration fence a validation that is still in flight', async () => {
    let persisted: DeviceNetworkPersistedSettings | undefined;
    const database = {
      getSetting: vi.fn(() => persisted),
      setSetting: vi.fn((_key: 'deviceNetwork', value: DeviceNetworkPersistedSettings) => {
        persisted = value;
      }),
      immediatelyStoreSettingsToFile: vi.fn(async () => undefined),
    } as unknown as IDatabaseService;
    const service = new DeviceNetworkService({} as never, database);
    const listStarted = deferred<undefined>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        if (url.endsWith('/api/devices')) {
          listStarted.resolve(undefined);
          return await new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            const rejectAbort = () => {
              reject(signal?.reason instanceof Error ? signal.reason : new Error('aborted'));
            };
            signal?.addEventListener('abort', rejectAbort, { once: true });
            if (signal?.aborted) rejectAbort();
          });
        }
        return cloudResponse(url);
      }),
    );

    const staleConfiguration = service.configureCloud({
      cloudUrl: 'https://stale.example.test',
      accessToken: 'stale-token',
    });
    const staleRejection = expect(staleConfiguration).rejects.toThrow('configuration cleared');
    await listStarted.promise;
    await service.clearCloudConfiguration();
    await staleRejection;

    expect(persisted?.cloudConfigurationV1).toBeUndefined();
    expect(service.cloudStatus$.value).toEqual(createInitialDeviceCloudConnectionStatus());
  });

  it('merges a large Cloud directory from one consistent trust-store snapshot', async () => {
    const loadTrustedDevices = vi.fn(async () => []);
    const commitCloudAccountSnapshot = vi.fn(async (records: TrustedDeviceRecord[]) => records);
    const service = new DeviceNetworkService(
      {} as never,
      { getSetting: vi.fn(() => undefined) } as unknown as IDatabaseService,
    );
    const devices = Array.from({ length: 250 }, (_, index) => ({
      peerId: `peer-${index}`,
      publicKeyMultibase: `zPublicKey-${index}`,
      deviceName: `Device ${index}`,
      platform: 'desktop' as const,
      accountId: 'account-1',
      lastSeen: Date.now(),
      multiaddrs: [],
      relayReservations: [],
      capabilities: {
        tools: [],
        mcpServers: [],
        hasWiki: false,
        agentLoop: true,
        imChannels: [],
        wikis: [],
      },
    }));
    Object.assign(service as unknown as Record<string, unknown>, {
      identity: { peerId: 'local-peer' },
      cloudConfig: { client: { listDevices: vi.fn(async () => devices) } },
      trustStore: {
        commitCloudAccountSnapshot,
        loadTrustedDevices,
      },
      core: {
        getTrustedDevice: vi.fn(() => undefined),
        listCloudDeviceAddressPeerIds: vi.fn(() => []),
        removeCloudDeviceAddresses: vi.fn(),
        removeCloudDiscoveredDevice: vi.fn(),
        removeCloudTrustedDevice: vi.fn(async () => undefined),
        setCloudDeviceAddresses: vi.fn(),
        upsertCloudDiscoveredDevice: vi.fn(),
        upsertCloudTrustedDevice: vi.fn(),
      },
    });

    await expect((service as unknown as {
      applyCloudDirectory(devices: CloudDeviceRecord[], fence: DeviceCloudCommitFence): Promise<void>;
    }).applyCloudDirectory(devices, currentFence())).resolves.toBeUndefined();
    expect(loadTrustedDevices).toHaveBeenCalledTimes(1);
    expect(commitCloudAccountSnapshot).toHaveBeenCalledTimes(1);
    expect(commitCloudAccountSnapshot.mock.calls[0]?.[0]).toHaveLength(250);
  });

  it('does not publish live directory effects after an async durable commit loses its fence', async () => {
    const controller = new AbortController();
    const fence: DeviceCloudCommitFence = {
      generation: 7,
      signal: controller.signal,
      isCurrent: () => !controller.signal.aborted,
      throwIfStale: () => {
        controller.signal.throwIfAborted();
      },
      commitSynchronous: (operation) => {
        if (controller.signal.aborted) return false;
        operation();
        return true;
      },
    };
    const coreWrites = {
      removeCloudDeviceAddresses: vi.fn(),
      removeCloudDiscoveredDevice: vi.fn(),
      removeCloudTrustedDevice: vi.fn(async () => undefined),
      setCloudDeviceAddresses: vi.fn(),
      upsertCloudDiscoveredDevice: vi.fn(),
      upsertCloudTrustedDevice: vi.fn(),
    };
    const service = new DeviceNetworkService(
      {} as never,
      { getSetting: vi.fn(() => undefined) } as unknown as IDatabaseService,
    );
    Object.assign(service as unknown as Record<string, unknown>, {
      identity: { peerId: 'local-peer' },
      trustStore: {
        loadTrustedDevices: vi.fn(async () => []),
        commitCloudAccountSnapshot: vi.fn(async (records: TrustedDeviceRecord[]) => {
          controller.abort(new Error('generation replaced'));
          return records;
        }),
      },
      core: {
        ...coreWrites,
        getTrustedDevice: vi.fn(() => undefined),
        listCloudDeviceAddressPeerIds: vi.fn(() => []),
      },
    });
    const device: CloudDeviceRecord = {
      peerId: 'remote-peer',
      publicKeyMultibase: 'zRemoteKey',
      deviceName: 'Remote',
      platform: 'desktop',
      accountId: 'account-1',
      lastSeen: Date.now(),
      multiaddrs: [],
      relayReservations: [],
      capabilities: { tools: [], mcpServers: [], hasWiki: false, agentLoop: true, imChannels: [], wikis: [] },
    };

    await expect((service as unknown as {
      applyCloudDirectory(devices: CloudDeviceRecord[], targetFence: DeviceCloudCommitFence): Promise<void>;
    }).applyCloudDirectory([device], fence)).rejects.toThrow('generation replaced');
    for (const write of Object.values(coreWrites)) expect(write).not.toHaveBeenCalled();
  });

  it('wires signed heartbeat, fenced authorizer/relay commits, and generation disposal through the shared adapter', async () => {
    const localIdentity: LocalDeviceIdentity = {
      peerId: 'local-peer',
      publicKeyMultibase: 'zLocalKey',
      privateKeyRef: 'test',
      deviceName: 'Desktop',
      platform: 'desktop',
      createdAt: 1,
    };
    const setDelegate = vi.fn((_delegate: unknown, fence: DeviceCloudCommitFence) => fence.commitSynchronous(() => undefined));
    const resetDelegate = vi.fn();
    const configureRelayReservation = vi.fn(async () => undefined);
    const clearRelayReservation = vi.fn(async () => undefined);
    const removeCloudTrustedDevice = vi.fn(async () => undefined);
    const removeCloudDeviceAddresses = vi.fn();
    const removeCloudDiscoveredDevice = vi.fn();
    const removeTrustedDevice = vi.fn(async () => undefined);
    const cloudRecord: TrustedDeviceRecord = {
      peerId: 'cloud-peer',
      publicKeyMultibase: 'zCloudKey',
      deviceName: 'Cloud peer',
      platform: 'desktop',
      trustMode: 'cloud-account',
      accountId: 'account-1',
      createdAt: 1,
    };
    const service = new DeviceNetworkService(
      {} as never,
      { getSetting: vi.fn(() => undefined) } as unknown as IDatabaseService,
    );
    Object.assign(service as unknown as Record<string, unknown>, {
      identity: localIdentity,
      mutableAuthorizer: { resetDelegate, setDelegate },
      runtimeOptions: {
        buildCapabilities: async () => ({
          tools: ['wiki.search'],
          mcpServers: [],
          hasWiki: true,
          agentLoop: true,
          imChannels: [],
          wikis: [],
        }),
      },
      trustStore: {
        loadTrustedDevices: vi.fn(async () => [cloudRecord]),
        removeTrustedDevice,
        saveTrustedDevice: vi.fn(async () => undefined),
      },
      core: {
        clearRelayReservation,
        configureRelayReservation,
        getMultiaddrs: vi.fn(() => []),
        getTrustedDevice: vi.fn(() => undefined),
        listCloudDeviceAddressPeerIds: vi.fn(() => ['cloud-peer']),
        removeCloudDeviceAddresses,
        removeCloudDiscoveredDevice,
        removeCloudTrustedDevice,
        setCloudDeviceAddresses: vi.fn(),
      },
    });
    const adapter = (service as unknown as {
      createStandardCloudAdapter(): StandardDeviceCloudConnectionAdapter;
    }).createStandardCloudAdapter();
    const heartbeat = vi.fn(async () => ({ ok: true }));
    const client = {
      createRelayReservation: vi.fn(async () => reservation(Date.now() + 600_000)),
      getConnectionGrantPublicKey: vi.fn(async () => ({
        issuer: 'memeloop-cloud' as const,
        publicKeyMultibase: 'zCloudSigningKey',
      })),
      heartbeat,
    } as unknown as CloudDeviceClient;
    const fence = currentFence(9);

    await (await adapter.ensureAuthorizer(client, fence.signal)).commit?.(fence);
    await (await adapter.ensureRelay(client, fence.signal))?.commit?.(fence);
    await adapter.heartbeat(client, fence.signal);

    expect(setDelegate).toHaveBeenCalledWith(expect.anything(), fence);
    expect(configureRelayReservation).toHaveBeenCalledWith(expect.anything(), fence.signal, fence);
    expect(heartbeat).toHaveBeenCalledWith(
      expect.objectContaining({
        nonce: expect.any(String),
        signature: 'heartbeat-signature',
        capabilities: expect.objectContaining({ hasWiki: true }),
      }),
      fence.signal,
    );

    const fetchClient = new CloudDeviceFetchClient({
      baseUrl: 'https://cloud.example.test',
      accessToken: 'token',
      fetch: vi.fn(),
    });
    const clearCachedTokens = vi.spyOn(fetchClient, 'clearCachedTokens');
    await adapter.dispose(fetchClient, new AbortController().signal);

    expect(resetDelegate).toHaveBeenCalledOnce();
    expect(clearRelayReservation).toHaveBeenCalledOnce();
    expect(removeTrustedDevice).toHaveBeenCalledWith('cloud-peer');
    expect(removeCloudTrustedDevice).toHaveBeenCalledWith('cloud-peer');
    expect(removeCloudDeviceAddresses).toHaveBeenCalledWith('cloud-peer');
    expect(removeCloudDiscoveredDevice).toHaveBeenCalledWith('cloud-peer');
    expect(clearCachedTokens).toHaveBeenCalledOnce();
  });

  it('renews the Desktop relay token at the host safety-margin boundary', async () => {
    vi.useFakeTimers();
    try {
      const baseTime = Date.UTC(2026, 7, 27, 0, 0, 0);
      vi.setSystemTime(baseTime);
      const createRelayReservation = vi.fn()
        .mockResolvedValueOnce(reservation(baseTime + 180_000))
        .mockImplementationOnce(async () => reservation(baseTime + 660_000));
      const { client, coordinator, core, service } = createCloudHostHarness({ createRelayReservation });

      await coordinator.setConfiguration(client);
      await coordinator.start();
      expect(createRelayReservation).toHaveBeenCalledOnce();
      expect(core.configureRelayReservation).toHaveBeenCalledOnce();
      expect(coordinator.snapshot.status).toBe('online');

      await vi.advanceTimersByTimeAsync(59_999);
      expect(createRelayReservation).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);

      expect(createRelayReservation).toHaveBeenCalledTimes(2);
      expect(core.configureRelayReservation).toHaveBeenLastCalledWith(
        expect.objectContaining({ expiresAt: baseTime + 660_000 }),
        expect.any(AbortSignal),
        expect.objectContaining({ generation: 1 }),
      );
      expect(coordinator.snapshot.status).toBe('online');
      await vi.advanceTimersByTimeAsync(0);
      expect(service.cloudStatus$.value).toMatchObject({ status: 'online' });
      await coordinator.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('publishes offline and recovers without re-registering a valid Desktop generation', async () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      const baseTime = Date.UTC(2026, 7, 27, 1, 0, 0);
      vi.setSystemTime(baseTime);
      const heartbeat = vi.fn()
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValue({ ok: true });
      const { client, coordinator, service } = createCloudHostHarness({ heartbeat });

      await coordinator.setConfiguration(client);
      await expect(coordinator.start()).rejects.toThrow('fetch failed');
      expect(coordinator.snapshot).toMatchObject({
        generation: 1,
        status: 'offline',
        lastError: { classification: 'offline', component: 'heartbeat' },
        nextRetryAt: baseTime + 1_000,
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(service.cloudStatus$.value).toMatchObject({ status: 'offline' });

      await vi.advanceTimersByTimeAsync(1_000);
      expect(coordinator.snapshot.status).toBe('online');
      expect(client.registerDevice).toHaveBeenCalledOnce();
      expect(heartbeat).toHaveBeenCalledTimes(2);
      expect(service.cloudStatus$.value).toMatchObject({ status: 'online' });
      await coordinator.stop();
    } finally {
      random.mockRestore();
      vi.useRealTimers();
    }
  });

  it.skipIf(!coreSupportsRegistrationInvalid)(
    'invalidates a missing Cloud registration and re-registers on the next Desktop maintenance pass',
    async () => {
      const heartbeat = vi.fn()
        .mockRejectedValueOnce(registrationInvalidError)
        .mockResolvedValue({ ok: true });
      const { client, coordinator, service } = createCloudHostHarness({ heartbeat });

      await coordinator.setConfiguration(client);
      await expect(coordinator.start()).rejects.toThrow('cloud_http_error');
      expect(coordinator.snapshot).toMatchObject({
        status: 'offline',
        components: { registration: 'not-run' },
        lastError: { classification: 'registration-invalid', component: 'heartbeat' },
      });

      await coordinator.runNow();
      expect(client.registerDevice).toHaveBeenCalledTimes(2);
      expect(coordinator.snapshot.status).toBe('online');
      await vi.waitFor(() => {
        expect(service.cloudStatus$.value.status).toBe('online');
      });
      await coordinator.stop();
    },
  );
});

describe('DeviceNetwork settings persistence', () => {
  function createSettingsStore(initial?: DeviceNetworkPersistedSettings) {
    let persisted = initial;
    const immediatelyStoreSettingsToFile = vi.fn(async () => undefined);
    const databaseService = {
      getSetting: vi.fn(() => persisted),
      setSetting: vi.fn((_key: 'deviceNetwork', value: DeviceNetworkPersistedSettings | undefined) => {
        persisted = value;
      }),
      immediatelyStoreSettingsToFile,
    } as unknown as IDatabaseService;
    return {
      immediatelyStoreSettingsToFile,
      readPersisted: () => persisted,
      store: new DeviceNetworkSettingsStore(databaseService),
    };
  }

  it('serializes independent updates without losing fields', async () => {
    const { readPersisted, store } = createSettingsStore();

    const identityWrite = store.update(settings => {
      settings.identityV1 = {
        peerId: 'peer-1',
        publicKeyMultibase: 'zPublicKey',
        encryptedPrivateKey: 'encrypted',
        deviceName: 'Desktop',
        platform: 'desktop',
        createdAt: 1,
      };
    });
    const trustWrite = store.update(settings => {
      settings.trustedDevicesV1 = [{
        peerId: 'peer-2',
        publicKeyMultibase: 'zPeerPublicKey',
        deviceName: 'Peer',
        platform: 'desktop',
        trustMode: 'local-pairing',
        createdAt: 1,
      }];
    });

    await Promise.all([identityWrite, trustWrite]);

    expect(readPersisted()).toMatchObject({
      identityV1: { peerId: 'peer-1' },
      trustedDevicesV1: [{ peerId: 'peer-2' }],
    });
  });

  it('flushes durable identity and Cloud changes on request', async () => {
    const { immediatelyStoreSettingsToFile, store } = createSettingsStore();

    await store.update(settings => {
      settings.identityV1 = {
        peerId: 'peer-1',
        publicKeyMultibase: 'zPublicKey',
        encryptedPrivateKey: 'encrypted',
        deviceName: 'Desktop',
        platform: 'desktop',
        createdAt: 1,
      };
      settings.cloudConfigurationV1 = {
        cloudUrl: 'https://cloud.example.test',
        encryptedAccessToken: 'encrypted-token',
      };
    }, true);

    expect(immediatelyStoreSettingsToFile).toHaveBeenCalledOnce();
    await expect(store.read()).resolves.toMatchObject({
      cloudConfigurationV1: { cloudUrl: 'https://cloud.example.test' },
      identityV1: { peerId: 'peer-1' },
    });
  });
});

describe('DeviceNetwork outbound Cloud grants', () => {
  const identity: LocalDeviceIdentity = {
    peerId: 'local-peer',
    publicKeyMultibase: 'zLocalPublicKey',
    privateKeyRef: 'test',
    deviceName: 'Desktop',
    platform: 'desktop',
    createdAt: 1,
  };
  const cloudGrant: DeviceConnectionGrant = {
    issuer: 'memeloop-cloud',
    accountId: 'account-1',
    subjectPeerId: 'local-peer',
    allowedPeerIds: ['cloud-peer'],
    protocols: ['/memeloop/rpc/2.0.0'],
    rpcMethodScope: { mode: 'all' },
    conversationScope: { mode: 'all' },
    definitionScope: { mode: 'all' },
    issuedAt: 1,
    expiresAt: Date.now() + 60_000,
    signature: 'signature',
  };

  function record(peerId: string, trustMode: TrustedDeviceRecord['trustMode']): TrustedDeviceRecord {
    return {
      peerId,
      publicKeyMultibase: 'zPeerPublicKey',
      deviceName: 'Peer',
      platform: 'desktop',
      trustMode,
      accountId: trustMode === 'cloud-account' ? 'account-1' : undefined,
      createdAt: 1,
    };
  }

  function createService(trustedDevice: TrustedDeviceRecord, createConnectionGrant: () => Promise<DeviceConnectionGrant>) {
    const sendRpc = vi.fn(async () => ({ ok: true }));
    const service = new DeviceNetworkService(
      {} as never,
      { getSetting: vi.fn(() => undefined) } as unknown as IDatabaseService,
    );
    Object.assign(service as unknown as Record<string, unknown>, {
      started: true,
      identity,
      cloudClient: { createConnectionGrant },
      core: {
        getTrustedDevice: vi.fn(() => trustedDevice),
        sendRpc,
      },
    });
    return { sendRpc, service };
  }

  it('keeps an explicit local pairing usable without requesting a Cloud grant', async () => {
    const createConnectionGrant = vi.fn(async () => cloudGrant);
    const { sendRpc, service } = createService(record('local-pair', 'local-pairing'), createConnectionGrant);

    await expect(service.sendRpc('local-pair', 'test.method', {})).resolves.toEqual({ ok: true });
    expect(createConnectionGrant).not.toHaveBeenCalled();
    expect(sendRpc).toHaveBeenCalledWith('local-pair', 'test.method', {}, {
      presentedGrant: undefined,
      signal: undefined,
    });
  });

  it('requests a least-privilege grant for the exact RPC method and resource identifiers', async () => {
    const createConnectionGrant = vi.fn(async () => cloudGrant);
    const { service } = createService(record('cloud-peer', 'cloud-account'), createConnectionGrant);

    await expect(service.sendRpc('cloud-peer', 'agent.preview', {
      conversationId: 'conversation-1',
      definitionId: 'definition-1',
    })).resolves.toEqual({ ok: true });

    expect(createConnectionGrant).toHaveBeenCalledWith({
      subjectPeerId: 'local-peer',
      allowedPeerIds: ['cloud-peer'],
      protocols: ['/memeloop/rpc/2.0.0'],
      rpcMethodScope: { mode: 'ids', ids: ['agent.preview'] },
      conversationScope: { mode: 'ids', ids: ['conversation-1'] },
      definitionScope: { mode: 'ids', ids: ['definition-1'] },
    });
  });

  it('fails a Cloud-account request locally with an explicit error when grant acquisition fails', async () => {
    const createConnectionGrant = vi.fn(async () => {
      throw new Error('503 unavailable');
    });
    const { sendRpc, service } = createService(record('cloud-peer', 'cloud-account'), createConnectionGrant);

    await expect(service.sendRpc('cloud-peer', 'test.method', {})).rejects.toThrow(
      'device_cloud_grant_unavailable:cloud-peer',
    );
    expect(sendRpc).not.toHaveBeenCalled();
  });
});
