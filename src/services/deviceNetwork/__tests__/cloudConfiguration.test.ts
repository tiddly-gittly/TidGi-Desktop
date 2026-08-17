import type { DeviceConnectionGrant, DeviceRelayReservationToken, LocalDeviceIdentity, TrustedDeviceRecord } from 'memeloop';
import { describe, expect, it, vi } from 'vitest';

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
  shouldRenewRelayReservation,
  validateCloudConfiguration,
} from '../index';
import type { DeviceNetworkPersistedSettings } from '../interface';

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

describe('DeviceNetwork Cloud configuration', () => {
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

  it('renews a missing or nearly expired relay reservation', () => {
    const now = 10_000;
    expect(shouldRenewRelayReservation(undefined, now)).toBe(true);
    expect(shouldRenewRelayReservation(reservation(now + 119_999), now)).toBe(true);
    expect(shouldRenewRelayReservation(reservation(now + 120_001), now)).toBe(false);
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
    const syncWrite = store.update(settings => {
      settings.syncVersionVectorV2 = { 'peer-1': 7 };
    });

    await Promise.all([identityWrite, syncWrite]);

    expect(readPersisted()).toMatchObject({
      identityV1: { peerId: 'peer-1' },
      syncVersionVectorV2: { 'peer-1': 7 },
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
    expect(sendRpc).toHaveBeenCalledWith('local-pair', 'test.method', {}, undefined);
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
