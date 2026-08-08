import { app, safeStorage } from 'electron';
import { inject, injectable } from 'inversify';
import { BehaviorSubject } from 'rxjs';

import {
  CloudDeviceAuthorizer,
  createDeviceIdentity,
  createSignedDevicePairingInvite,
  Libp2pDeviceNetworkService,
  parseVerifiedDevicePairingInvite,
  type RawSeedDeviceIdentity,
  signDeviceBinding,
} from '@memeloop/libp2p';
import {
  type CloudDeviceClient,
  type CloudDeviceRecord,
  type Device,
  type DeviceAuthorizer,
  type DeviceCapabilities,
  DeviceCloudConnectionCoordinator,
  type DeviceCloudConnectionSnapshot,
  type DeviceCloudStepResult,
  type DeviceConnectionGrant,
  type DeviceRelayReservationToken,
  type DeviceSyncStateStore,
  type DeviceTrustStore,
  encodeDevicePairingInvite,
  type LocalDeviceIdentity,
  type LocalPairingRequestOptions,
  LocalTrustDeviceAuthorizer,
  type MemeLoopDuplexStream,
  type MemeLoopProtocol,
  type PairingSession,
  type SyncResult,
  type TrustedDeviceRecord,
  type VersionVector,
} from 'memeloop';

import type { IAuthenticationService } from '@services/auth/interface';
import type { IDatabaseService } from '@services/database/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';

import type {
  DeviceCloudConnectionStatus,
  DeviceNetworkPersistedCloudConfiguration,
  DeviceNetworkPersistedIdentity,
  DeviceNetworkPersistedSettings,
  DeviceNetworkRuntimeOptions,
  IDeviceNetworkService,
} from './interface';
import { TrustedRpcGate } from './trustedRpcGate';

const CLOUD_HEARTBEAT_INTERVAL_MS = 60_000;
const RELAY_RENEWAL_WINDOW_MS = 2 * 60_000;
const CLOUD_REQUEST_TIMEOUT_MS = 10_000;
const CLOUD_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;

interface DesktopCloudConfiguration {
  cloudUrl: string;
  accessToken: string;
  client: ElectronCloudClient;
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
    identityV1: settings?.identityV1 && { ...settings.identityV1 },
    syncVersionVectorV2: settings?.syncVersionVectorV2 && { ...settings.syncVersionVectorV2 },
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
}

class DatabaseSettingsDeviceSyncStateStore implements DeviceSyncStateStore {
  constructor(private readonly settingsStore: DeviceNetworkSettingsStore) {}

  public async loadVersionVector(): Promise<VersionVector> {
    const stored = (await this.settingsStore.read()).syncVersionVectorV2;
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    const versionVector: VersionVector = {};
    for (const [originNodeId, clock] of Object.entries(stored as Record<string, unknown>)) {
      if (originNodeId.length > 0 && typeof clock === 'number' && Number.isSafeInteger(clock) && clock >= 0) {
        versionVector[originNodeId] = clock;
      }
    }
    return versionVector;
  }

  public async saveVersionVector(versionVector: VersionVector): Promise<void> {
    await this.settingsStore.update(settings => {
      const current = settings.syncVersionVectorV2 ?? {};
      for (const [originNodeId, clock] of Object.entries(versionVector)) {
        if (originNodeId.length > 0 && Number.isSafeInteger(clock) && clock >= 0) {
          current[originNodeId] = Math.max(current[originNodeId] ?? 0, clock);
        }
      }
      settings.syncVersionVectorV2 = current;
    });
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

class MutableDeviceAuthorizer implements DeviceAuthorizer {
  constructor(private delegate: DeviceAuthorizer) {}

  public setDelegate(delegate: DeviceAuthorizer): void {
    this.delegate = delegate;
  }

  public canOpenProtocol(input: Parameters<DeviceAuthorizer['canOpenProtocol']>[0]): Promise<boolean> {
    return this.delegate.canOpenProtocol(input);
  }
}

class ElectronCloudClient implements CloudDeviceClient {
  constructor(
    private readonly baseUrl: string,
    private readonly accessToken: string,
  ) {}

  public async listDevices(signal?: AbortSignal): Promise<CloudDeviceRecord[]> {
    const response = await this.request<{ devices: CloudDeviceRecord[] }>('/api/devices', { method: 'GET' }, signal);
    return response.devices;
  }

  public async getConnectionGrantPublicKey(signal?: AbortSignal): Promise<{ issuer: string; publicKeyMultibase: string }> {
    return this.request('/api/devices/connection-grant/public-key', { method: 'GET' }, signal);
  }

  public async createConnectionGrant(input: {
    subjectPeerId: string;
    allowedPeerIds: string[];
  }, signal?: AbortSignal): Promise<DeviceConnectionGrant> {
    return this.request('/api/devices/connection-grant', {
      method: 'POST',
      body: JSON.stringify(input),
    }, signal);
  }

  public async createRelayReservation(input: { peerId: string }, signal?: AbortSignal): Promise<DeviceRelayReservationToken> {
    return this.request('/api/devices/relay-reservation', {
      method: 'POST',
      body: JSON.stringify(input),
    }, signal);
  }

  public async createBindingNonce(signal?: AbortSignal): Promise<{ nonce: string; accountId: string; expiresAt: string }> {
    return this.request('/api/devices/binding/nonce', { method: 'POST' }, signal);
  }

  public async registerDevice(input: {
    identity: LocalDeviceIdentity;
    cloudNonce: string;
    signature: string;
    capabilities: DeviceCapabilities;
    multiaddrs: string[];
    relayReservations: string[];
  }, signal?: AbortSignal): Promise<{ ok: boolean; peerId: string }> {
    return this.request('/api/devices/register', {
      method: 'POST',
      body: JSON.stringify({
        peerId: input.identity.peerId,
        publicKeyMultibase: input.identity.publicKeyMultibase,
        deviceName: input.identity.deviceName,
        platform: input.identity.platform,
        cloudNonce: input.cloudNonce,
        signature: input.signature,
        capabilities: input.capabilities,
        multiaddrs: input.multiaddrs,
        relayReservations: input.relayReservations,
      }),
    }, signal);
  }

  public async heartbeat(input: {
    peerId: string;
    capabilities: DeviceCapabilities;
    multiaddrs: string[];
    relayReservations: string[];
  }, signal?: AbortSignal): Promise<{ ok: boolean }> {
    return this.request('/api/devices/heartbeat', {
      method: 'POST',
      body: JSON.stringify(input),
    }, signal);
  }

  private async request<T>(path: string, init: RequestInit, externalSignal?: AbortSignal): Promise<T> {
    const baseHeaders: Record<string, string> = {
      'content-type': 'application/json',
      authorization: `Bearer ${this.accessToken}`,
    };
    if (init.headers && typeof init.headers === 'object' && !Array.isArray(init.headers)) {
      for (const [key, value] of Object.entries(init.headers as Record<string, string>)) {
        baseHeaders[key] = value;
      }
    }
    const timeoutSignal = AbortSignal.timeout(CLOUD_REQUEST_TIMEOUT_MS);
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: baseHeaders,
      redirect: 'error',
      signal: externalSignal ? AbortSignal.any([externalSignal, timeoutSignal]) : timeoutSignal,
    });
    const responseText = await readBoundedResponseText(response, CLOUD_RESPONSE_MAX_BYTES);
    if (!response.ok) {
      throw new Error(`${response.status} ${responseText.slice(0, 4096)}`);
    }
    return JSON.parse(responseText) as T;
  }
}

async function readBoundedResponseText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let totalBytes = 0;
  let text = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel('cloud_response_too_large');
      throw new Error('cloud_response_too_large');
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

@injectable()
export class DeviceNetworkService implements IDeviceNetworkService {
  private core?: Libp2pDeviceNetworkService;
  private identity?: RawSeedDeviceIdentity;
  private started = false;
  private readonly settingsStore: DeviceNetworkSettingsStore;
  private readonly trustStore: DatabaseSettingsDeviceTrustStore;
  private readonly syncStateStore: DatabaseSettingsDeviceSyncStateStore;
  private cloudConfig?: DesktopCloudConfiguration;
  private cloudClient?: ElectronCloudClient;
  private cloudCoordinator?: DeviceCloudConnectionCoordinator<DesktopCloudConfiguration>;
  private mutableAuthorizer?: MutableDeviceAuthorizer;
  private cloudGrantCache = new Map<string, DeviceConnectionGrant>();
  private cloudConfigurationGeneration = 0;
  private cloudConfigurationController = new AbortController();
  private relayReservation?: DeviceRelayReservationToken;
  private cloudStatus: DeviceCloudConnectionStatus = { configured: false, state: 'not-configured' };
  public cloudStatus$ = new BehaviorSubject<DeviceCloudConnectionStatus>(this.cloudStatus);
  private runtimeOptions: DeviceNetworkRuntimeOptions = {};
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
    this.syncStateStore = new DatabaseSettingsDeviceSyncStateStore(this.settingsStore);
  }

  public configureRuntime(options: DeviceNetworkRuntimeOptions): void {
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
      syncStateStore: this.syncStateStore,
      rpcHandler: this.runtimeOptions.rpcHandler,
    });
    await this.core.start();

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
    await this.cloudCoordinator!.setConfiguration(this.cloudConfig).catch((error: unknown) => {
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
    this.cloudGrantCache.clear();
    this.relayReservation = undefined;
    this.mutableAuthorizer = undefined;
    logger.info('DeviceNetworkService stopped');
  }

  public async configureCloud(config: { cloudUrl: string; accessToken: string }): Promise<void> {
    const generation = this.beginCloudConfigurationChange();
    const signal = this.cloudConfigurationController.signal;
    const normalized = validateCloudConfiguration(config);
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('secure_storage_unavailable');
    }
    const shouldResumeCoordinator = this.started && this.cloudCoordinator !== undefined;
    if (shouldResumeCoordinator) await this.cloudCoordinator!.stop();
    const client = new ElectronCloudClient(normalized.cloudUrl, normalized.accessToken);
    try {
      await Promise.all([
        client.getConnectionGrantPublicKey(signal),
        // The public-key endpoint may be intentionally public. Listing devices
        // proves the supplied account token is actually accepted before storing it.
        client.listDevices(signal),
      ]);
    } catch (error) {
      if (
        generation === this.cloudConfigurationGeneration &&
        shouldResumeCoordinator &&
        this.cloudConfig
      ) {
        await this.cloudCoordinator!.start().catch((resumeError: unknown) => {
          logger.warn('DeviceNetworkService failed to resume the previous Cloud configuration', { error: resumeError });
        });
      }
      throw error;
    }
    this.assertCloudConfigurationGeneration(generation, signal);
    const record: DeviceNetworkPersistedCloudConfiguration = {
      cloudUrl: normalized.cloudUrl,
      encryptedAccessToken: safeStorage.encryptString(normalized.accessToken).toString('base64'),
    };
    await this.settingsStore.update(settings => {
      settings.cloudConfigurationV1 = record;
    }, true);
    this.assertCloudConfigurationGeneration(generation, signal);
    await this.applyCloudConfiguration({ ...normalized, client });
  }

  public async clearCloudConfiguration(): Promise<void> {
    this.beginCloudConfigurationChange();
    const shouldResumeCoordinator = this.started && this.cloudCoordinator !== undefined;
    if (shouldResumeCoordinator) await this.cloudCoordinator!.stop();
    await this.settingsStore.update(settings => {
      delete settings.cloudConfigurationV1;
    }, true);
    this.cloudConfig = undefined;
    this.cloudClient = undefined;
    this.cloudGrantCache.clear();
    this.relayReservation = undefined;
    this.mutableAuthorizer?.setDelegate(this.createLocalPairingAuthorizer());
    await this.cloudCoordinator?.setConfiguration(undefined);
    if (shouldResumeCoordinator) await this.cloudCoordinator!.start();
    this.updateCloudStatus({ configured: false, state: 'not-configured' });
  }

  public async getCloudConnectionStatus(): Promise<DeviceCloudConnectionStatus> {
    await this.loadPersistedCloudConfiguration();
    return { ...this.cloudStatus };
  }

  public async syncCloudDevices(): Promise<CloudDeviceRecord[]> {
    if (!this.cloudConfig) throw new Error('cloud_not_configured');
    const devices = await this.cloudConfig.client.listDevices();
    return this.mergeCloudDevices(devices);
  }

  private async mergeCloudDevices(devices: CloudDeviceRecord[]): Promise<CloudDeviceRecord[]> {
    const previousCloudRecords = (await this.trustStore.loadTrustedDevices()).filter(
      record => record.trustMode === 'cloud-account',
    );
    const activeDevices = devices.filter(device => !device.revokedAt && device.peerId !== this.identity?.peerId);
    const activeCloudPeerIds = new Set(activeDevices.map(device => device.peerId));
    for (const staleRecord of previousCloudRecords) {
      if (!activeCloudPeerIds.has(staleRecord.peerId)) {
        await this.trustStore.removeTrustedDevice(staleRecord.peerId);
      }
    }
    for (const device of activeDevices) {
      const existing = (await this.trustStore.loadTrustedDevices()).find(record => record.peerId === device.peerId);
      if (existing?.trustMode !== 'local-pairing') {
        await this.trustStore.saveTrustedDevice({
          peerId: device.peerId,
          publicKeyMultibase: device.publicKeyMultibase,
          deviceName: device.deviceName,
          platform: device.platform,
          trustMode: 'cloud-account',
          accountId: device.accountId,
          createdAt: existing?.createdAt ?? Date.now(),
          lastSeen: device.lastSeen,
        });
      }
    }
    if (this.core) {
      for (const staleRecord of previousCloudRecords) {
        if (!activeCloudPeerIds.has(staleRecord.peerId)) {
          await this.core.removeTrustedDevice(staleRecord.peerId);
        }
      }
      for (const device of activeDevices) {
        const existing = this.core.getTrustedDevice(device.peerId);
        const trustedDevice: TrustedDeviceRecord = {
          peerId: device.peerId,
          publicKeyMultibase: device.publicKeyMultibase,
          deviceName: device.deviceName,
          platform: device.platform,
          trustMode: existing?.trustMode === 'local-pairing' ? 'local-pairing' : 'cloud-account',
          accountId: device.accountId,
          createdAt: existing?.createdAt ?? Date.now(),
          lastSeen: device.lastSeen,
        };
        const paths = [
          ...(device.multiaddrs.length > 0 ? ['direct' as const] : []),
          ...(device.relayReservations.length > 0 ? ['relay' as const] : []),
        ];
        if (existing?.trustMode !== 'local-pairing') {
          this.core.upsertTrustedDevice(trustedDevice);
        }
        this.core.upsertDiscoveredDevice({
          peerId: device.peerId,
          displayName: device.deviceName,
          platform: device.platform,
          trustMode: 'cloud-account',
          trusted: true,
          reachability: { state: 'online', paths },
          capabilities: device.capabilities,
          multiaddrs: device.multiaddrs,
          lastSeen: device.lastSeen,
        });
      }
    }
    return activeDevices;
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
    const multiaddrs = pairingInviteMultiaddrs(this.core.getMultiaddrs(), this.identity!.peerId);
    const invite = await createSignedDevicePairingInvite({
      identity: this.identity!,
      multiaddrs,
    });
    return encodeDevicePairingInvite(invite);
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
    presentedGrant?: DeviceConnectionGrant,
  ): Promise<MemeLoopDuplexStream> {
    const grant = presentedGrant ?? await this.resolveOutboundGrant(peerId);
    return this.core!.openStream(peerId, protocol, grant);
  }

  public async sendRpc<T>(
    peerId: string,
    method: string,
    parameters: unknown,
    presentedGrant?: DeviceConnectionGrant,
  ): Promise<T> {
    const core = this.core;
    if (!core || !this.started) throw new Error('device_network_not_started');
    const isTrusted = () => {
      const record = core.getTrustedDevice(peerId);
      return record !== undefined && record.revokedAt === undefined;
    };
    return this.trustedRpcGate.run(peerId, isTrusted, async () => {
      const grant = presentedGrant ?? await this.resolveOutboundGrant(peerId);
      if (!isTrusted()) throw new Error(`device_rpc_trust_changed:${peerId}`);
      return core.sendRpc<T>(peerId, method, parameters, grant);
    });
  }

  public async syncWithDevice(peerId: string, presentedGrant?: DeviceConnectionGrant): Promise<SyncResult> {
    const grant = presentedGrant ?? await this.resolveOutboundGrant(peerId);
    return this.core!.syncWithDevice(peerId, grant);
  }

  private ensureCloudCoordinator(): void {
    if (this.cloudCoordinator) return;
    this.cloudCoordinator = new DeviceCloudConnectionCoordinator<DesktopCloudConfiguration>({
      adapter: {
        isConfigured: (configuration): configuration is DesktopCloudConfiguration => configuration !== undefined,
        relayRequiredForOnline: () => !hasValidDirectDeviceAddress(this.core?.getMultiaddrs() ?? []),
        ensureAuthorizer: async (configuration, signal) => {
          if (!this.identity) throw new Error('device_identity_unavailable');
          const publicKey = await configuration.client.getConnectionGrantPublicKey(signal);
          const authorizer = new CloudDeviceAuthorizer({
            localPeerId: this.identity.peerId,
            grantVerificationPublicKeyMultibase: publicKey.publicKeyMultibase,
            // Cloud-account peers must always present a current signed grant.
            // Only an explicit local pairing may bypass Cloud authorization.
            getTrustedDevice: peerId => locallyPairedRecord(this.core?.getTrustedDevice(peerId)),
          });
          return {
            commit: async () => {
              this.mutableAuthorizer?.setDelegate(authorizer);
            },
          };
        },
        registerDevice: (configuration, signal) => this.registerCloudDevice(configuration, signal),
        ensureRelay: (configuration, signal) => this.prepareRelayReservation(configuration, signal),
        heartbeat: async (configuration, signal) => {
          await this.sendCloudHeartbeat(configuration, signal);
          return undefined;
        },
        syncDirectory: async (configuration, signal) => {
          const devices = await configuration.client.listDevices(signal);
          return {
            commit: async () => {
              await this.mergeCloudDevices(devices);
            },
          };
        },
        classifyError: classifyCloudConnectionError,
      },
      heartbeatIntervalMs: CLOUD_HEARTBEAT_INTERVAL_MS,
      logWarning: (message, error) => logger.warn(`DeviceNetworkService ${message}`, { error }),
      onStatus: snapshot => {
        this.applyCloudConnectionSnapshot(snapshot);
      },
    });
  }

  private async registerCloudDevice(
    configuration: DesktopCloudConfiguration,
    signal: AbortSignal,
  ): Promise<DeviceCloudStepResult | undefined> {
    if (!this.identity || !this.core) throw new Error('device_network_not_started');
    const capabilities = await this.buildCapabilities();
    const nonce = await configuration.client.createBindingNonce(signal);
    await configuration.client.registerDevice({
      identity: this.identity,
      cloudNonce: nonce.nonce,
      signature: await signDeviceBinding({ identity: this.identity, accountId: nonce.accountId, nonce: nonce.nonce }),
      capabilities,
      multiaddrs: this.core.getMultiaddrs(),
      relayReservations: this.currentRelayReservations(),
    }, signal);
    return undefined;
  }

  private async prepareRelayReservation(
    configuration: DesktopCloudConfiguration,
    signal: AbortSignal,
  ): Promise<DeviceCloudStepResult | undefined> {
    if (!this.identity || !this.core) throw new Error('device_network_not_started');
    if (!shouldRenewRelayReservation(this.relayReservation, Date.now())) return undefined;
    const reservation = await configuration.client.createRelayReservation({ peerId: this.identity.peerId }, signal);
    return {
      commit: async () => {
        await this.core!.configureRelayReservation(reservation);
        this.relayReservation = reservation;
      },
    };
  }

  private async sendCloudHeartbeat(
    configuration: DesktopCloudConfiguration,
    signal: AbortSignal,
  ): Promise<void> {
    if (!this.identity || !this.core) throw new Error('device_network_not_started');
    await configuration.client.heartbeat({
      peerId: this.identity.peerId,
      capabilities: await this.buildCapabilities(),
      multiaddrs: this.core.getMultiaddrs(),
      relayReservations: this.currentRelayReservations(),
    }, signal);
  }

  private applyCloudConnectionSnapshot(snapshot: DeviceCloudConnectionSnapshot): void {
    const connected = snapshot.status === 'online' || snapshot.status === 'degraded';
    this.updateCloudStatus({
      configured: snapshot.status !== 'not-configured',
      cloudUrl: this.cloudConfig?.cloudUrl,
      components: snapshot.components,
      error: snapshot.lastError === undefined
        ? undefined
        : snapshot.lastError instanceof Error
        ? snapshot.lastError.message
        : typeof snapshot.lastError === 'string'
        ? snapshot.lastError
        : 'unknown_cloud_error',
      generation: snapshot.generation,
      lastConnectedAt: connected ? Date.now() : this.cloudStatus.lastConnectedAt,
      nextRetryAt: snapshot.nextRetryAt,
      relayExpiresAt: this.relayReservation?.expiresAt,
      state: snapshot.status,
    });
  }

  private currentRelayReservations(): string[] {
    const relayedAddresses = this.core?.getMultiaddrs().filter((address) => address.includes('/p2p-circuit')) ?? [];
    return relayedAddresses.length > 0 ? relayedAddresses : this.relayReservation?.relayMultiaddrs ?? [];
  }

  private async resolveOutboundGrant(peerId: string): Promise<DeviceConnectionGrant | undefined> {
    if (!this.cloudClient || !this.identity) return undefined;
    const cached = this.cloudGrantCache.get(peerId);
    if (cached && cached.expiresAt > Date.now() + 30_000) return cached;
    try {
      const grant = await this.cloudClient.createConnectionGrant({
        subjectPeerId: this.identity.peerId,
        allowedPeerIds: [peerId],
      });
      this.cloudGrantCache.set(peerId, grant);
      return grant;
    } catch {
      return undefined;
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
      const client = new ElectronCloudClient(normalized.cloudUrl, normalized.accessToken);
      this.cloudConfig = { ...normalized, client };
      this.cloudClient = client;
      this.updateCloudStatus({ configured: true, cloudUrl: normalized.cloudUrl, state: 'offline' });
    } catch (error) {
      logger.warn('DeviceNetworkService ignored invalid encrypted Cloud configuration', { error });
    }
  }

  private async applyCloudConfiguration(config: DesktopCloudConfiguration): Promise<void> {
    const shouldResumeCoordinator = this.started && this.cloudCoordinator !== undefined;
    if (shouldResumeCoordinator) await this.cloudCoordinator!.stop();
    this.mutableAuthorizer?.setDelegate(this.createLocalPairingAuthorizer());
    this.cloudConfig = config;
    this.cloudClient = config.client;
    this.cloudGrantCache.clear();
    this.relayReservation = undefined;
    this.updateCloudStatus({ configured: true, cloudUrl: config.cloudUrl, state: 'offline' });
    this.ensureCloudCoordinator();
    await this.cloudCoordinator!.setConfiguration(config);
    if (shouldResumeCoordinator) {
      await this.cloudCoordinator!.start().catch((error: unknown) => {
        logger.warn('DeviceNetworkService Cloud reconfiguration failed; recovery remains scheduled', { error });
      });
    }
  }

  private beginCloudConfigurationChange(): number {
    this.cloudConfigurationGeneration += 1;
    this.cloudConfigurationController.abort(new Error('device cloud configuration changed'));
    this.cloudConfigurationController = new AbortController();
    return this.cloudConfigurationGeneration;
  }

  private assertCloudConfigurationGeneration(generation: number, signal: AbortSignal): void {
    if (generation !== this.cloudConfigurationGeneration || signal.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error('stale device cloud configuration');
    }
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

export function shouldRenewRelayReservation(
  reservation: DeviceRelayReservationToken | undefined,
  now: number,
): boolean {
  return !reservation || reservation.expiresAt <= now + RELAY_RENEWAL_WINDOW_MS;
}

export function locallyPairedRecord(record: TrustedDeviceRecord | undefined): TrustedDeviceRecord | undefined {
  return record?.trustMode === 'local-pairing' ? record : undefined;
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

export function classifyCloudConnectionError(error: unknown): 'offline' | 'error' {
  if (error instanceof Error && /^(4\d\d)\b/.test(error.message)) return 'error';
  return 'offline';
}
