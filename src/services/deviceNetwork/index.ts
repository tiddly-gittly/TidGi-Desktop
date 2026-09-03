import { app, safeStorage } from 'electron';
import { inject, injectable } from 'inversify';
import { randomUUID } from 'node:crypto';
import { BehaviorSubject } from 'rxjs';

import {
  CloudDeviceAuthorizer,
  createDeviceIdentity,
  createSignedDevicePairingInvite,
  Libp2pDeviceNetworkService,
  parseVerifiedDevicePairingInvite,
  type RawSeedDeviceIdentity,
  signDeviceBinding,
  signDeviceIdentityPayload,
} from '@memeloop/libp2p';
import {
  buildDeviceHeartbeatMessage,
  type CloudDeviceClient,
  CloudDeviceFetchClient,
  type CloudDeviceRecord,
  cloudRecordToDevice,
  type Device,
  type DeviceCapabilities,
  type DeviceCloudCommitFence,
  DeviceCloudConnectionCoordinator,
  type DeviceCloudConnectionSnapshot,
  type DeviceConnectionGrant,
  type DeviceConnectionGrantStringScope,
  type DeviceTrustStore,
  encodeDevicePairingInvite,
  type LocalDeviceIdentity,
  type LocalPairingRequestOptions,
  LocalTrustDeviceAuthorizer,
  type MemeLoopDuplexStream,
  type MemeLoopProtocol,
  MutableDeviceAuthorizer,
  type PairingSession,
  StandardDeviceCloudConnectionAdapter,
  type SyncResult,
  type TrustedDeviceRecord,
} from 'memeloop/device-network';

import type { IAuthenticationService } from '@services/auth/interface';
import type { IDatabaseService } from '@services/database/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';

import type {
  DesktopDeviceConnectionOptions,
  DesktopDeviceSyncOptions,
  DeviceCloudConnectionStatus,
  DeviceNetworkPersistedIdentity,
  DeviceNetworkPersistedSettings,
  HostDeviceNetworkPersistedCloudConfiguration,
  HostDeviceNetworkRuntimeOptions,
  IDeviceNetworkService,
} from './interface';
import { createInitialDeviceCloudConnectionStatus } from './interface';
import { TrustedRpcGate } from './trustedRpcGate';

const CLOUD_HEARTBEAT_INTERVAL_MS = 60_000;
export const CLOUD_DEVICE_FRESHNESS_MS = 3 * 60_000;
const RELAY_RENEWAL_WINDOW_MS = 2 * 60_000;

interface DesktopCloudConfiguration {
  cloudUrl: string;
  accessToken: string;
  client: CloudDeviceFetchClient;
}

function isTrustedDeviceRecord(value: unknown): value is TrustedDeviceRecord {
  const record = value as Record<string, unknown> | undefined;
  return Boolean(
    record &&
      typeof record.peerId === 'string' &&
      typeof record.publicKeyMultibase === 'string' &&
      typeof record.deviceName === 'string' &&
      typeof record.platform === 'string' &&
      typeof record.trustMode === 'string' &&
      typeof record.createdAt === 'number',
  );
}

function clonePersistedSettings(settings: DeviceNetworkPersistedSettings | undefined): DeviceNetworkPersistedSettings {
  return {
    ...settings,
    cloudConfigurationV1: settings?.cloudConfigurationV1 && { ...settings.cloudConfigurationV1 },
    cloudTrustSnapshotV1: settings?.cloudTrustSnapshotV1 && { ...settings.cloudTrustSnapshotV1 },
    identityV1: settings?.identityV1 && { ...settings.identityV1 },
    trustedDevicesV1: settings?.trustedDevicesV1?.map(record => ({ ...record })),
  };
}

/** Serializes changes to the shared settings snapshot so independent sync/trust/cloud writes cannot clobber each other. */
export class DeviceNetworkSettingsStore {
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly databaseService: IDatabaseService) {}

  public async read(): Promise<DeviceNetworkPersistedSettings> {
    await this.pending;
    return clonePersistedSettings(this.databaseService.getSetting('deviceNetwork'));
  }

  public async update(
    mutate: (settings: DeviceNetworkPersistedSettings) => void,
    flushImmediately = false,
  ): Promise<void> {
    const operation = this.pending.then(async () => {
      const next = clonePersistedSettings(this.databaseService.getSetting('deviceNetwork'));
      mutate(next);
      this.databaseService.setSetting('deviceNetwork', next);
      if (flushImmediately) await this.databaseService.immediatelyStoreSettingsToFile();
    });
    this.pending = operation.catch(() => undefined);
    await operation;
  }
}

class DatabaseSettingsDeviceTrustStore implements DeviceTrustStore {
  private readonly epoch = randomUUID();

  constructor(private readonly settingsStore: DeviceNetworkSettingsStore) {}

  public async loadTrustedDevices(): Promise<TrustedDeviceRecord[]> {
    const stored: unknown = (await this.settingsStore.read()).trustedDevicesV1;
    return Array.isArray(stored) ? stored.filter(isTrustedDeviceRecord) : [];
  }

  public async saveTrustedDevice(record: TrustedDeviceRecord): Promise<void> {
    await this.settingsStore.update(settings => {
      const records = (settings.trustedDevicesV1 ?? []).filter(isTrustedDeviceRecord);
      const next = records.filter((current) => current.peerId !== record.peerId);
      next.push(record);
      settings.trustedDevicesV1 = next;
    });
  }

  public async removeTrustedDevice(peerId: string): Promise<void> {
    await this.settingsStore.update(settings => {
      settings.trustedDevicesV1 = (settings.trustedDevicesV1 ?? [])
        .filter(isTrustedDeviceRecord)
        .filter(record => record.peerId !== peerId);
    });
  }

  /** Replace every Cloud-account trust row in one serialized durable write. */
  public async commitCloudAccountSnapshot(
    records: readonly TrustedDeviceRecord[],
    fence: DeviceCloudCommitFence,
  ): Promise<readonly TrustedDeviceRecord[] | undefined> {
    const peerIds = new Set<string>();
    for (const record of records) {
      if (record.trustMode !== 'cloud-account' || peerIds.has(record.peerId)) {
        throw new TypeError('invalid_cloud_account_trust_snapshot');
      }
      peerIds.add(record.peerId);
    }
    let committed: TrustedDeviceRecord[] | undefined;
    await this.settingsStore.update(settings => {
      fence.throwIfStale();
      const metadata = settings.cloudTrustSnapshotV1;
      if (metadata?.epoch === this.epoch && metadata.generation > fence.generation) return;
      const nextByPeerId = new Map(
        (settings.trustedDevicesV1 ?? [])
          .filter(isTrustedDeviceRecord)
          .filter(record => record.trustMode !== 'cloud-account')
          .map(record => [record.peerId, { ...record }]),
      );
      for (const record of records) {
        if (nextByPeerId.get(record.peerId)?.trustMode === 'local-pairing') continue;
        nextByPeerId.set(record.peerId, { ...record });
      }
      committed = [...nextByPeerId.values()].sort((left, right) => left.peerId.localeCompare(right.peerId));
      settings.trustedDevicesV1 = committed;
      settings.cloudTrustSnapshotV1 = { epoch: this.epoch, generation: fence.generation };
    }, true);
    fence.throwIfStale();
    return committed?.map(record => ({ ...record }));
  }

  /** Coordinator disposal is serialized after the old generation has drained. */
  public async clearCloudAccountSnapshot(signal: AbortSignal): Promise<void> {
    await this.settingsStore.update(settings => {
      signal.throwIfAborted();
      settings.trustedDevicesV1 = (settings.trustedDevicesV1 ?? [])
        .filter(isTrustedDeviceRecord)
        .filter(record => record.trustMode !== 'cloud-account');
      delete settings.cloudTrustSnapshotV1;
    }, true);
    signal.throwIfAborted();
  }
}

const emptyCapabilities: DeviceCapabilities = {
  tools: [],
  mcpServers: [],
  hasWiki: false,
  agentLoop: false,
  imChannels: [],
  wikis: [],
};

function createDesktopCloudClient(
  config: Pick<DesktopCloudConfiguration, 'cloudUrl' | 'accessToken'>,
): CloudDeviceFetchClient {
  return new CloudDeviceFetchClient({
    baseUrl: config.cloudUrl,
    accessToken: config.accessToken,
  });
}

function stringScope(value: unknown): DeviceConnectionGrantStringScope {
  return typeof value === 'string' && value.length > 0
    ? { mode: 'ids', ids: [value] }
    : { mode: 'none' };
}

@injectable()
export class DeviceNetworkService implements IDeviceNetworkService {
  private core?: Libp2pDeviceNetworkService;
  private identity?: RawSeedDeviceIdentity;
  private started = false;
  private readonly settingsStore: DeviceNetworkSettingsStore;
  private readonly trustStore: DatabaseSettingsDeviceTrustStore;
  private cloudConfig?: DesktopCloudConfiguration;
  private cloudClient?: CloudDeviceFetchClient;
  private cloudCoordinator?: DeviceCloudConnectionCoordinator<CloudDeviceClient>;
  private standardCloudAdapter?: StandardDeviceCloudConnectionAdapter;
  private mutableAuthorizer?: MutableDeviceAuthorizer;
  private lastCloudDevices: CloudDeviceRecord[] = [];
  private cloudConfigurationRequest = 0;
  private cloudConfigurationCommit: Promise<void> = Promise.resolve();
  private cloudValidationController = new AbortController();
  private readonly activeOperations = new Map<string, AbortController>();
  private cloudStatus: DeviceCloudConnectionStatus = createInitialDeviceCloudConnectionStatus();
  public cloudStatus$ = new BehaviorSubject<DeviceCloudConnectionStatus>(this.cloudStatus);
  private runtimeOptions: HostDeviceNetworkRuntimeOptions = {};
  public devices$ = new BehaviorSubject<Device[]>([]);
  public pairingSessions$ = new BehaviorSubject<PairingSession[]>([]);
  private deviceNetworkUnsubscribers: Array<() => void> = [];
  private readonly trustedRpcGate = new TrustedRpcGate();

  constructor(
    @inject(serviceIdentifier.Authentication) private readonly authService: IAuthenticationService,
    @inject(serviceIdentifier.Database) databaseService: IDatabaseService,
  ) {
    this.settingsStore = new DeviceNetworkSettingsStore(databaseService);
    this.trustStore = new DatabaseSettingsDeviceTrustStore(this.settingsStore);
  }

  public configureRuntime(options: HostDeviceNetworkRuntimeOptions): void {
    this.runtimeOptions = options;
  }

  public async getLocalIdentity(): Promise<LocalDeviceIdentity> {
    await this.ensureIdentity();
    return this.identity!;
  }

  public async start(): Promise<void> {
    if (this.started) return;
    await this.loadPersistedCloudConfiguration();
    await this.ensureIdentity();

    this.mutableAuthorizer = new MutableDeviceAuthorizer(this.createLocalPairingAuthorizer());

    const capabilities = await this.buildCapabilities();
    this.core = new Libp2pDeviceNetworkService({
      identity: this.identity!,
      capabilities,
      trustStore: this.trustStore,
      authorizer: this.mutableAuthorizer,
      enableMdns: true,
      syncStorage: this.runtimeOptions.syncStorage,
      rpcHandler: this.runtimeOptions.rpcHandler,
    });
    await this.core.start();
    this.standardCloudAdapter = this.createStandardCloudAdapter();

    this.started = true;
    const initialDevices = await this.core.listDevices();
    this.trustedRpcGate.updateDevices(initialDevices);
    this.devices$.next(initialDevices);
    // Wire core observables to IPC-serializable BehaviorSubjects.
    // The core's observe methods return unsubscribe functions that cannot cross IPC,
    // so we mirror their values into Value$ observables exposed to the renderer.
    this.deviceNetworkUnsubscribers.push(
      this.core.observeDevices((devices) => {
        this.trustedRpcGate.updateDevices(devices);
        this.devices$.next(devices);
      }),
      this.core.observePairingSessions((sessions) => {
        this.pairingSessions$.next(sessions);
      }),
    );
    this.ensureCloudCoordinator();
    await this.cloudCoordinator!.setConfiguration(this.cloudClient).catch((error: unknown) => {
      logger.warn('DeviceNetworkService initial Cloud connection failed; recovery remains scheduled', { error });
    });
    await this.cloudCoordinator!.start().catch((error: unknown) => {
      logger.warn('DeviceNetworkService initial Cloud maintenance failed; recovery remains scheduled', { error });
    });
    logger.info('DeviceNetworkService started', { peerId: this.identity!.peerId, cloud: !!this.cloudClient });
  }

  public async stop(): Promise<void> {
    if (!this.started) return;
    await this.cloudCoordinator?.stop();
    for (const unsubscribe of this.deviceNetworkUnsubscribers) {
      unsubscribe();
    }
    this.deviceNetworkUnsubscribers = [];
    await this.core?.stop();
    this.trustedRpcGate.updateDevices([]);
    this.devices$.next([]);
    this.core = undefined;
    this.started = false;
    this.lastCloudDevices = [];
    this.standardCloudAdapter = undefined;
    this.cloudCoordinator = undefined;
    this.mutableAuthorizer = undefined;
    logger.info('DeviceNetworkService stopped');
  }

  public async configureCloud(config: { cloudUrl: string; accessToken: string }): Promise<void> {
    const normalized = validateCloudConfiguration(config);
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('secure_storage_unavailable');
    }
    const request = ++this.cloudConfigurationRequest;
    this.cloudValidationController.abort(new Error('device cloud validation superseded'));
    this.cloudValidationController = new AbortController();
    const validationSignal = this.cloudValidationController.signal;
    const client = createDesktopCloudClient(normalized);
    await Promise.all([
      client.getConnectionGrantPublicKey(validationSignal),
      // The key endpoint may be public. Listing proves the supplied account
      // token before the currently working generation is disturbed.
      client.listDevices(validationSignal),
    ]);
    if (request !== this.cloudConfigurationRequest) throw new Error('stale device cloud configuration');
    await this.enqueueCloudConfigurationCommit(async () => {
      if (request !== this.cloudConfigurationRequest) throw new Error('stale device cloud configuration');
      const shouldResumeCoordinator = this.started && this.cloudCoordinator !== undefined;
      if (shouldResumeCoordinator) await this.cloudCoordinator!.stop();
      const record: HostDeviceNetworkPersistedCloudConfiguration = {
        cloudUrl: normalized.cloudUrl,
        encryptedAccessToken: safeStorage.encryptString(normalized.accessToken).toString('base64'),
      };
      await this.settingsStore.update(settings => {
        settings.cloudConfigurationV1 = record;
      }, true);
      await this.applyCloudConfiguration({ ...normalized, client }, shouldResumeCoordinator);
    });
  }

  public async clearCloudConfiguration(): Promise<void> {
    ++this.cloudConfigurationRequest;
    this.cloudValidationController.abort(new Error('device cloud configuration cleared'));
    await this.enqueueCloudConfigurationCommit(async () => {
      const shouldResumeCoordinator = this.started && this.cloudCoordinator !== undefined;
      if (shouldResumeCoordinator) await this.cloudCoordinator!.stop();
      await this.settingsStore.update(settings => {
        delete settings.cloudConfigurationV1;
      }, true);
      this.cloudConfig = undefined;
      this.cloudClient = undefined;
      this.lastCloudDevices = [];
      const cleanupController = new AbortController();
      await this.trustStore.clearCloudAccountSnapshot(cleanupController.signal);
      await this.cloudCoordinator?.setConfiguration(undefined);
      if (shouldResumeCoordinator) await this.cloudCoordinator!.start();
      this.updateCloudStatus(createInitialDeviceCloudConnectionStatus());
    });
  }

  public async getCloudConnectionStatus(): Promise<DeviceCloudConnectionStatus> {
    await this.loadPersistedCloudConfiguration();
    return { ...this.cloudStatus };
  }

  public async syncCloudDevices(): Promise<CloudDeviceRecord[]> {
    if (!this.cloudClient || !this.cloudCoordinator) throw new Error('cloud_not_configured');
    await this.cloudCoordinator.runNow();
    return this.lastCloudDevices.map(device => ({ ...device }));
  }

  private async applyCloudDirectory(
    devices: readonly CloudDeviceRecord[],
    fence: DeviceCloudCommitFence,
  ): Promise<void> {
    fence.throwIfStale();
    if (!this.core || !this.identity) throw new Error('device_network_not_started');
    const remoteDevices = devices.filter(device => device.peerId !== this.identity!.peerId);
    const records = await this.trustStore.loadTrustedDevices();
    fence.throwIfStale();
    const existingByPeerId = new Map(records.map(record => [record.peerId, record]));
    const seenPeerIds = new Set<string>();
    const cloudSnapshot: TrustedDeviceRecord[] = [];
    const now = Date.now();
    for (const device of remoteDevices) {
      if (seenPeerIds.has(device.peerId)) throw new Error('cloud_directory_duplicate_peer');
      seenPeerIds.add(device.peerId);
      if (device.revokedAt || existingByPeerId.get(device.peerId)?.trustMode === 'local-pairing') continue;
      cloudSnapshot.push({
        peerId: device.peerId,
        publicKeyMultibase: device.publicKeyMultibase,
        deviceName: device.deviceName,
        platform: device.platform,
        trustMode: 'cloud-account',
        accountId: device.accountId,
        createdAt: existingByPeerId.get(device.peerId)?.createdAt ?? now,
        lastSeen: device.lastSeen,
      });
    }
    const committed = await this.trustStore.commitCloudAccountSnapshot(cloudSnapshot, fence);
    if (!committed) {
      fence.throwIfStale();
      throw new Error('cloud_directory_commit_rejected');
    }
    fence.throwIfStale();
    const committedByPeerId = new Map(committed.map(record => [record.peerId, record]));
    const activePeerIds = new Set(remoteDevices.filter(device => !device.revokedAt).map(device => device.peerId));
    const previousCloudPeerIds = new Set([
      ...records.filter(record => record.trustMode === 'cloud-account').map(record => record.peerId),
      ...this.core.listCloudDeviceAddressPeerIds(),
    ]);
    for (const peerId of previousCloudPeerIds) {
      if (activePeerIds.has(peerId)) continue;
      fence.throwIfStale();
      await this.core.removeCloudTrustedDevice(peerId);
      fence.throwIfStale();
      if (
        !fence.commitSynchronous(() => {
          this.core?.removeCloudDeviceAddresses(peerId);
          this.core?.removeCloudDiscoveredDevice(peerId);
        })
      ) fence.throwIfStale();
    }
    for (const device of remoteDevices) {
      fence.throwIfStale();
      const existing = this.core.getTrustedDevice(device.peerId);
      if (device.revokedAt) {
        if (
          !fence.commitSynchronous(() => {
            this.core?.removeCloudDeviceAddresses(device.peerId);
            this.core?.removeCloudDiscoveredDevice(device.peerId);
          })
        ) fence.throwIfStale();
        continue;
      }
      const trustMode = existing?.trustMode === 'local-pairing' ? 'local-pairing' as const : 'cloud-account' as const;
      const trustedDevice = trustMode === 'cloud-account' ? committedByPeerId.get(device.peerId) : existing;
      if (!trustedDevice) throw new Error('cloud_directory_trust_snapshot_missing');
      const discovered = cloudRecordToDevice(device, trustMode, now, CLOUD_DEVICE_FRESHNESS_MS);
      if (
        !fence.commitSynchronous(() => {
          if (trustMode === 'cloud-account') this.core?.upsertCloudTrustedDevice(trustedDevice);
          this.core?.setCloudDeviceAddresses(device.peerId, discovered.multiaddrs ?? []);
          this.core?.upsertCloudDiscoveredDevice(discovered);
        })
      ) fence.throwIfStale();
    }
    fence.throwIfStale();
    if (
      !fence.commitSynchronous(() => {
        this.lastCloudDevices = remoteDevices.filter(device => !device.revokedAt).map(device => ({ ...device }));
      })
    ) fence.throwIfStale();
  }

  public async getLocalDevice(): Promise<Device> {
    return this.core!.getLocalDevice();
  }

  public async listDevices(): Promise<Device[]> {
    return this.core!.listDevices();
  }

  public observeDevices(listener: (devices: Device[]) => void): () => void {
    return this.core!.observeDevices(listener);
  }

  public async listPairingSessions(): Promise<PairingSession[]> {
    return this.core!.listPairingSessions();
  }

  public observePairingSessions(listener: (sessions: PairingSession[]) => void): () => void {
    return this.core!.observePairingSessions(listener);
  }

  public async requestLocalPairing(peerId: string, options?: LocalPairingRequestOptions): Promise<PairingSession> {
    return this.core!.requestLocalPairing(peerId, options);
  }

  public async createPairingInvite(): Promise<string> {
    await this.ensureIdentity();
    if (!this.core) throw new Error('device_network_not_started');
    return createDesktopSignedPairingInvitePayload(this.identity!, this.core.getMultiaddrs());
  }

  public async requestPairingFromInvite(serialized: string): Promise<PairingSession> {
    if (!this.core) throw new Error('device_network_not_started');
    const invite = await parseVerifiedDevicePairingInvite(serialized);
    return this.core.requestLocalPairing(invite.peerId, { multiaddrs: invite.multiaddrs });
  }

  public async acceptPairing(sessionId: string): Promise<void> {
    return this.core!.acceptPairing(sessionId);
  }

  public async rejectPairing(sessionId: string): Promise<void> {
    return this.core!.rejectPairing(sessionId);
  }

  public async removeTrustedDevice(peerId: string): Promise<void> {
    return this.core!.removeTrustedDevice(peerId);
  }

  public async openStream(
    peerId: string,
    protocol: MemeLoopProtocol,
    options: DesktopDeviceConnectionOptions = {},
  ): Promise<MemeLoopDuplexStream> {
    const grant = options.presentedGrant ?? await this.resolveOutboundGrant(peerId, {
      conversationScope: { mode: 'none' },
      definitionScope: { mode: 'none' },
      protocols: [protocol],
      rpcMethodScope: { mode: 'none' },
    });
    return this.core!.openStream(peerId, protocol, { presentedGrant: grant, signal: options.signal });
  }

  public async sendRpc<T>(
    peerId: string,
    method: string,
    parameters: unknown,
    options: DesktopDeviceConnectionOptions = {},
  ): Promise<T> {
    const core = this.core;
    if (!core || !this.started) throw new Error('device_network_not_started');
    const operationController = options.operationId ? this.getOperationController(options.operationId) : undefined;
    const signal = options.signal && operationController
      ? AbortSignal.any([options.signal, operationController.signal])
      : options.signal ?? operationController?.signal;
    const isTrusted = () => {
      const record = core.getTrustedDevice(peerId);
      return record !== undefined && record.revokedAt === undefined;
    };
    return await this.trustedRpcGate.run(peerId, isTrusted, async () => {
      signal?.throwIfAborted();
      const parameterRecord = parameters !== null && typeof parameters === 'object' && !Array.isArray(parameters)
        ? parameters as Record<string, unknown>
        : undefined;
      const grant = options.presentedGrant ?? await this.resolveOutboundGrant(peerId, {
        conversationScope: stringScope(parameterRecord?.conversationId),
        definitionScope: stringScope(parameterRecord?.definitionId),
        protocols: ['/memeloop/rpc/2.0.0'],
        rpcMethodScope: { mode: 'ids', ids: [method] },
      });
      signal?.throwIfAborted();
      if (!isTrusted()) throw new Error(`device_rpc_trust_changed:${peerId}`);
      return core.sendRpc<T>(peerId, method, parameters, { presentedGrant: grant, signal });
    });
  }

  public async syncWithDevice(peerId: string, options: DesktopDeviceSyncOptions = {}): Promise<SyncResult> {
    const operationController = options.operationId ? this.getOperationController(options.operationId) : undefined;
    const signal = options.signal && operationController
      ? AbortSignal.any([options.signal, operationController.signal])
      : options.signal ?? operationController?.signal;
    signal?.throwIfAborted();
    const grant = options.presentedGrant ?? await this.resolveOutboundGrant(peerId, {
      conversationScope: options.conversationIds === undefined
        ? { mode: 'all' }
        : { mode: 'ids', ids: [...new Set(options.conversationIds)].sort() },
      definitionScope: { mode: 'none' },
      protocols: ['/memeloop/sync/2.0.0'],
      rpcMethodScope: { mode: 'none' },
    });
    signal?.throwIfAborted();
    const { operationId: _operationId, ...syncOptions } = options;
    return this.core!.syncWithDevice(peerId, { ...syncOptions, presentedGrant: grant, signal });
  }

  public async abortOperation(operationId: string): Promise<void> {
    this.activeOperations.get(operationId)?.abort(new Error('device_operation_cancelled'));
  }

  public async finishOperation(operationId: string): Promise<void> {
    this.activeOperations.delete(operationId);
  }

  private getOperationController(operationId: string): AbortController {
    const existing = this.activeOperations.get(operationId);
    if (existing) return existing;
    const controller = new AbortController();
    this.activeOperations.set(operationId, controller);
    return controller;
  }

  private ensureCloudCoordinator(): void {
    if (this.cloudCoordinator) return;
    if (!this.standardCloudAdapter) this.standardCloudAdapter = this.createStandardCloudAdapter();
    this.cloudCoordinator = new DeviceCloudConnectionCoordinator<CloudDeviceClient>({
      adapter: this.standardCloudAdapter,
      heartbeatIntervalMs: CLOUD_HEARTBEAT_INTERVAL_MS,
      logWarning: (message, error) => {
        logger.warn(`DeviceNetworkService ${message}`, { error });
      },
      onStatus: (snapshot, fence) => {
        fence.commitSynchronous(() => {
          this.applyCloudConnectionSnapshot(snapshot);
        });
      },
    });
  }

  private createStandardCloudAdapter(): StandardDeviceCloudConnectionAdapter {
    if (!this.identity || !this.core) throw new Error('device_network_not_started');
    return new StandardDeviceCloudConnectionAdapter({
      capabilities: () => this.buildCapabilities(),
      configureConnectionGrantPublicKey: (publicKey, signal, fence) => {
        signal.throwIfAborted();
        fence.throwIfStale();
        const authorizer = new CloudDeviceAuthorizer({
          localPeerId: this.identity!.peerId,
          grantVerificationPublicKeyMultibase: publicKey.publicKeyMultibase,
          getTrustedDevice: peerId => locallyPairedRecord(this.core?.getTrustedDevice(peerId)),
        });
        if (!this.mutableAuthorizer?.setDelegate(authorizer, fence)) fence.throwIfStale();
        return Promise.resolve();
      },
      clearConnectionGrantPublicKey: (signal) => {
        this.mutableAuthorizer?.resetDelegate(signal);
        return Promise.resolve();
      },
      clearTokenCache: async (client, signal) => {
        signal.throwIfAborted();
        if (client instanceof CloudDeviceFetchClient) await client.clearCachedTokens(signal);
        signal.throwIfAborted();
        this.lastCloudDevices = [];
      },
      commitCloudDirectorySnapshot: async (input, fence) => {
        await this.applyCloudDirectory(input.cloudDevices, fence);
      },
      identity: this.identity,
      liveDirectory: this.core,
      network: {
        getMultiaddrs: () => this.core?.getMultiaddrs() ?? [],
        configureRelayReservation: async (token, signal, fence) => {
          if (signal !== fence.signal) throw new TypeError('relay_generation_signal_mismatch');
          await this.core?.configureRelayReservation(token, signal, fence);
          fence.throwIfStale();
        },
        clearRelayReservation: async (signal) => {
          signal.throwIfAborted();
          await this.core?.clearRelayReservation(signal);
          signal.throwIfAborted();
        },
      },
      relayRequiredForOnline: addresses => !hasValidDirectDeviceAddress(addresses),
      relayTokenSafetyMarginMs: RELAY_RENEWAL_WINDOW_MS,
      signDeviceBinding: async ({ accountId, identity, nonce, signal }) => {
        signal.throwIfAborted();
        const signature = await signDeviceBinding({
          accountId,
          identity: identity,
          nonce,
        });
        signal.throwIfAborted();
        return signature;
      },
      signHeartbeat: async ({ signal, ...unsigned }) => {
        signal.throwIfAborted();
        const nonce = randomUUID();
        const signature = await signDeviceIdentityPayload({
          identity: this.identity!,
          payload: buildDeviceHeartbeatMessage({ ...unsigned, nonce }),
        });
        signal.throwIfAborted();
        return { nonce, signature };
      },
      syncDevice: async (_client, peerId, signal) => this.syncWithDevice(peerId, { signal }),
      trustStore: this.trustStore,
    });
  }

  private applyCloudConnectionSnapshot(snapshot: DeviceCloudConnectionSnapshot): void {
    const connected = snapshot.status === 'online' || snapshot.status === 'degraded';
    this.updateCloudStatus({
      ...snapshot,
      cloudUrl: this.cloudConfig?.cloudUrl,
      lastConnectedAt: connected ? Date.now() : this.cloudStatus.lastConnectedAt,
    });
  }

  private async resolveOutboundGrant(
    peerId: string,
    scopes: {
      conversationScope: DeviceConnectionGrantStringScope;
      definitionScope: DeviceConnectionGrantStringScope;
      protocols: MemeLoopProtocol[];
      rpcMethodScope: DeviceConnectionGrantStringScope;
    },
  ): Promise<DeviceConnectionGrant | undefined> {
    const trustedDevice = this.core?.getTrustedDevice(peerId);
    // A local pairing is its own explicit authorization boundary and must keep
    // working while Cloud is unavailable. Cloud-account trust, on the other
    // hand, is valid only together with a current signed connection grant.
    if (trustedDevice?.trustMode !== 'cloud-account') return undefined;
    if (!this.cloudClient || !this.identity) {
      throw new Error(`device_cloud_grant_unavailable:${peerId}`);
    }
    try {
      return await this.cloudClient.createConnectionGrant({
        subjectPeerId: this.identity.peerId,
        allowedPeerIds: [peerId],
        ...scopes,
      });
    } catch (error) {
      logger.warn('Failed to obtain outbound Cloud connection grant', { error, peerId });
      throw new Error(`device_cloud_grant_unavailable:${peerId}`, { cause: error });
    }
  }

  private async ensureIdentity(): Promise<void> {
    if (this.identity) return;
    const stored = (await this.settingsStore.read()).identityV1;
    if (stored?.peerId && stored?.publicKeyMultibase && stored?.encryptedPrivateKey) {
      const identity = this.tryLoadStoredIdentity(stored);
      if (identity) {
        this.identity = identity;
        return;
      }
    }
    const identity = await this.createIdentity();
    await this.saveIdentity(identity);
    this.identity = identity;
  }

  private async loadPersistedCloudConfiguration(): Promise<void> {
    if (this.cloudClient || this.cloudConfig) return;
    const stored = (await this.settingsStore.read()).cloudConfigurationV1;
    if (
      !stored ||
      typeof stored.cloudUrl !== 'string' ||
      typeof stored.encryptedAccessToken !== 'string'
    ) return;
    if (!safeStorage.isEncryptionAvailable()) {
      logger.warn('DeviceNetworkService cannot load Cloud credentials because safeStorage is unavailable');
      return;
    }
    try {
      const normalized = validateCloudConfiguration({
        cloudUrl: stored.cloudUrl,
        accessToken: safeStorage.decryptString(Buffer.from(stored.encryptedAccessToken, 'base64')),
      });
      const client = createDesktopCloudClient(normalized);
      this.cloudConfig = { ...normalized, client };
      this.cloudClient = client;
      this.updateCloudStatus({
        ...createInitialDeviceCloudConnectionStatus(),
        status: 'offline',
        cloudUrl: normalized.cloudUrl,
      });
    } catch (error) {
      logger.warn('DeviceNetworkService ignored invalid encrypted Cloud configuration', { error });
    }
  }

  private async applyCloudConfiguration(
    config: DesktopCloudConfiguration,
    shouldResumeCoordinator: boolean,
  ): Promise<void> {
    this.cloudConfig = config;
    this.cloudClient = config.client;
    this.lastCloudDevices = [];
    this.updateCloudStatus({
      ...createInitialDeviceCloudConnectionStatus(),
      status: 'offline',
      cloudUrl: config.cloudUrl,
    });
    if (!this.started) return;
    this.ensureCloudCoordinator();
    await this.cloudCoordinator!.setConfiguration(config.client);
    if (shouldResumeCoordinator) {
      await this.cloudCoordinator!.start().catch((error: unknown) => {
        logger.warn('DeviceNetworkService Cloud reconfiguration failed; recovery remains scheduled', { error });
      });
    }
  }

  private async enqueueCloudConfigurationCommit(operation: () => Promise<void>): Promise<void> {
    const commit = this.cloudConfigurationCommit.then(operation);
    this.cloudConfigurationCommit = commit.catch(() => undefined);
    await commit;
  }

  private updateCloudStatus(status: DeviceCloudConnectionStatus): void {
    this.cloudStatus = status;
    this.cloudStatus$.next({ ...status });
  }

  private createLocalPairingAuthorizer(): LocalTrustDeviceAuthorizer {
    return new LocalTrustDeviceAuthorizer({
      getTrustedDevice: peerId => locallyPairedRecord(this.core?.getTrustedDevice(peerId)),
    });
  }

  private tryLoadStoredIdentity(stored: DeviceNetworkPersistedIdentity): RawSeedDeviceIdentity | undefined {
    if (!safeStorage.isEncryptionAvailable()) {
      logger.warn('DeviceNetworkService safeStorage encryption unavailable; using an ephemeral device identity for this session');
      return undefined;
    }
    try {
      const encrypted = Buffer.from(stored.encryptedPrivateKey, 'base64');
      const privateKeyRawSeedBase64Url = safeStorage.decryptString(encrypted);
      return {
        peerId: stored.peerId,
        publicKeyMultibase: stored.publicKeyMultibase,
        privateKeyRef: 'libp2p-raw-seed',
        privateKeyRawSeedBase64Url,
        createdAt: stored.createdAt,
        deviceName: stored.deviceName,
        platform: 'desktop',
      };
    } catch (error) {
      logger.warn('DeviceNetworkService failed to decrypt stored identity; rotating device identity', { error });
      return undefined;
    }
  }

  private async createIdentity(): Promise<RawSeedDeviceIdentity> {
    return createDeviceIdentity('desktop', app.getName());
  }

  private async saveIdentity(identity: RawSeedDeviceIdentity): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      logger.warn('DeviceNetworkService safeStorage encryption unavailable; generated identity will not be persisted');
      return;
    }
    const encrypted = safeStorage.encryptString(identity.privateKeyRawSeedBase64Url);
    const record: DeviceNetworkPersistedIdentity = {
      peerId: identity.peerId,
      publicKeyMultibase: identity.publicKeyMultibase,
      encryptedPrivateKey: encrypted.toString('base64'),
      deviceName: identity.deviceName,
      platform: 'desktop',
      createdAt: identity.createdAt,
    };
    await this.settingsStore.update(settings => {
      settings.identityV1 = record;
    }, true);
  }

  private async buildCapabilities(): Promise<DeviceCapabilities> {
    try {
      return await this.runtimeOptions.buildCapabilities?.() ?? emptyCapabilities;
    } catch (error) {
      logger.warn('DeviceNetworkService failed to collect wiki capabilities', { error });
    }
    return emptyCapabilities;
  }
}

export function validateCloudConfiguration(config: { cloudUrl: string; accessToken: string }): { cloudUrl: string; accessToken: string } {
  const cloudUrlInput = config.cloudUrl.trim();
  const accessToken = config.accessToken.trim();
  if (cloudUrlInput.length === 0 || cloudUrlInput.length > 2048) throw new Error('invalid_cloud_url');
  if (accessToken.length === 0 || accessToken.length > 16_384) throw new Error('invalid_cloud_access_token');
  let parsed: URL;
  try {
    parsed = new URL(cloudUrlInput);
  } catch {
    throw new Error('invalid_cloud_url');
  }
  const loopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '[::1]';
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
    throw new Error('cloud_url_requires_https');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname !== '' && parsed.pathname !== '/')) {
    throw new Error('invalid_cloud_url');
  }
  return { cloudUrl: parsed.origin, accessToken };
}

export function locallyPairedRecord(record: TrustedDeviceRecord | undefined): TrustedDeviceRecord | undefined {
  return record?.trustMode === 'local-pairing' ? record : undefined;
}

export function cloudDeviceReachability(
  device: Pick<CloudDeviceRecord, 'lastSeen' | 'multiaddrs' | 'relayReservations'>,
  now: number,
): Device['reachability'] {
  const fresh = device.lastSeen >= now - CLOUD_DEVICE_FRESHNESS_MS;
  if (!fresh) return { state: 'offline', paths: [] };
  const hasDirectAddress = device.multiaddrs.some(address => !address.includes('/p2p-circuit'));
  const hasRelayAddress = device.relayReservations.length > 0 ||
    device.multiaddrs.some(address => address.includes('/p2p-circuit'));
  const paths: Device['reachability']['paths'] = [
    ...(hasDirectAddress ? ['direct' as const] : []),
    ...(hasRelayAddress ? ['relay' as const] : []),
  ];
  return paths.length > 0 ? { state: 'online', paths } : { state: 'offline', paths: [] };
}

function isUnspecifiedOrLoopback(host: string): boolean {
  const normalized = host.toLowerCase();
  return normalized === '0.0.0.0' || normalized === '::' || normalized === '::1' ||
    normalized === 'localhost' || normalized.startsWith('127.');
}

/** True only for an address another device can actually dial directly. */
export function hasValidDirectDeviceAddress(addresses: readonly string[]): boolean {
  return addresses.some((address) => {
    if (address.includes('/p2p-circuit')) return false;
    const parts = address.split('/');
    const protocolIndex = parts.findIndex(part => part === 'ip4' || part === 'ip6' || part === 'dns' || part === 'dns4' || part === 'dns6');
    if (protocolIndex < 0) return false;
    const host = parts[protocolIndex + 1];
    return typeof host === 'string' && host.length > 0 && !isUnspecifiedOrLoopback(host);
  });
}

/** Pairing QR codes contain only dialable WebSocket addresses bound to this identity. */
export function pairingInviteMultiaddrs(addresses: readonly string[], peerId: string): string[] {
  const suffix = `/p2p/${peerId}`;
  const result = addresses
    .filter(address => (address.includes('/ws') || address.includes('/wss')) && hasValidDirectDeviceAddress([address]))
    .map(address => address.includes('/p2p/') ? address : `${address}${suffix}`)
    .filter(address => address.endsWith(suffix));
  const unique = [...new Set(result)];
  if (unique.length === 0) throw new Error('no_dialable_websocket_address');
  return unique;
}

/**
 * Builds the exact identity-bound payload displayed by the Desktop QR producer.
 * Keeping address selection and signing in one seam prevents UI callers and tests
 * from accidentally constructing a weaker, unsigned pairing payload.
 */
export async function createDesktopSignedPairingInvitePayload(
  identity: LocalDeviceIdentity,
  addresses: readonly string[],
  options: { now?: number; ttlMs?: number } = {},
): Promise<string> {
  const multiaddrs = pairingInviteMultiaddrs(addresses, identity.peerId);
  const invite = await createSignedDevicePairingInvite({
    identity,
    multiaddrs,
    ...options,
  });
  return encodeDevicePairingInvite(invite);
}

export function classifyCloudConnectionError(error: unknown): 'offline' | 'error' {
  if (error instanceof Error && /^(4\d\d)\b/.test(error.message)) return 'error';
  return 'offline';
}
