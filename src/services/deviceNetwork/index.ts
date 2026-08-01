import { app, safeStorage } from 'electron';
import settings from 'electron-settings';
import { inject, injectable } from 'inversify';
import { BehaviorSubject } from 'rxjs';

import { CloudDeviceAuthorizer, createDeviceIdentity, Libp2pDeviceNetworkService, type RawSeedDeviceIdentity, signDeviceBinding } from '@memeloop/libp2p';
import {
  type CloudDeviceClient,
  type CloudDeviceRecord,
  type Device,
  type DeviceAuthorizer,
  type DeviceCapabilities,
  type DeviceConnectionGrant,
  type DeviceRelayReservationToken,
  type DeviceTrustStore,
  type LocalDeviceIdentity,
  type LocalPairingRequestOptions,
  LocalTrustDeviceAuthorizer,
  type MemeLoopDuplexStream,
  type MemeLoopProtocol,
  type PairingSession,
  syncCloudDevices,
  type SyncResult,
  type TrustedDeviceRecord,
} from 'memeloop';

import type { IAuthenticationService } from '@services/auth/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';

import type { DeviceCloudConnectionStatus, DeviceNetworkRuntimeOptions, IDeviceNetworkService } from './interface';

const DEVICE_IDENTITY_KEY = 'deviceNetwork.identity.v1';
const TRUSTED_DEVICES_KEY = 'deviceNetwork.trustedDevices.v1';
const CLOUD_CONFIGURATION_KEY = 'deviceNetwork.cloudConfiguration.v1';
const CLOUD_HEARTBEAT_INTERVAL_MS = 60_000;
const RELAY_RENEWAL_WINDOW_MS = 2 * 60_000;
const CLOUD_REQUEST_TIMEOUT_MS = 10_000;
const CLOUD_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;

interface EncryptedIdentityRecord {
  peerId: string;
  publicKeyMultibase: string;
  encryptedPrivateKey: string;
  deviceName: string;
  platform: 'desktop';
  createdAt: number;
}

interface EncryptedCloudConfigurationRecord {
  cloudUrl: string;
  encryptedAccessToken: string;
}

type StoredTrustedDevices = unknown;

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

class ElectronSettingsDeviceTrustStore implements DeviceTrustStore {
  public async loadTrustedDevices(): Promise<TrustedDeviceRecord[]> {
    const stored = settings.getSync(TRUSTED_DEVICES_KEY) as StoredTrustedDevices;
    return Array.isArray(stored) ? stored.filter(isTrustedDeviceRecord) : [];
  }

  public async saveTrustedDevice(record: TrustedDeviceRecord): Promise<void> {
    const records = await this.loadTrustedDevices();
    const next = records.filter((current) => current.peerId !== record.peerId);
    next.push(record);
    settings.setSync(TRUSTED_DEVICES_KEY, next as unknown as Parameters<typeof settings.setSync>[1]);
  }

  public async removeTrustedDevice(peerId: string): Promise<void> {
    const records = await this.loadTrustedDevices();
    const next = records.filter((record) => record.peerId !== peerId);
    settings.setSync(TRUSTED_DEVICES_KEY, next as unknown as Parameters<typeof settings.setSync>[1]);
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

class ElectronCloudClient implements CloudDeviceClient {
  constructor(
    private readonly baseUrl: string,
    private readonly accessToken: string,
  ) {}

  public async listDevices(): Promise<CloudDeviceRecord[]> {
    const response = await this.request<{ devices: CloudDeviceRecord[] }>('/api/devices', { method: 'GET' });
    return response.devices;
  }

  public async getConnectionGrantPublicKey(): Promise<{ issuer: string; publicKeyMultibase: string }> {
    return this.request('/api/devices/connection-grant/public-key', { method: 'GET' });
  }

  public async createConnectionGrant(input: {
    subjectPeerId: string;
    allowedPeerIds: string[];
  }): Promise<DeviceConnectionGrant> {
    return this.request('/api/devices/connection-grant', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  public async createRelayReservation(input: { peerId: string }): Promise<DeviceRelayReservationToken> {
    return this.request('/api/devices/relay-reservation', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  public async createBindingNonce(): Promise<{ nonce: string; accountId: string; expiresAt: string }> {
    return this.request('/api/devices/binding/nonce', { method: 'POST' });
  }

  public async registerDevice(input: {
    identity: LocalDeviceIdentity;
    cloudNonce: string;
    signature: string;
    capabilities: DeviceCapabilities;
    multiaddrs: string[];
    relayReservations: string[];
  }): Promise<{ ok: boolean; peerId: string }> {
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
    });
  }

  public async heartbeat(input: {
    peerId: string;
    capabilities: DeviceCapabilities;
    multiaddrs: string[];
    relayReservations: string[];
  }): Promise<{ ok: boolean }> {
    return this.request('/api/devices/heartbeat', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const baseHeaders: Record<string, string> = {
      'content-type': 'application/json',
      authorization: `Bearer ${this.accessToken}`,
    };
    if (init.headers && typeof init.headers === 'object' && !Array.isArray(init.headers)) {
      for (const [key, value] of Object.entries(init.headers as Record<string, string>)) {
        baseHeaders[key] = value;
      }
    }
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: baseHeaders,
      redirect: 'error',
      signal: AbortSignal.timeout(CLOUD_REQUEST_TIMEOUT_MS),
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
  private readonly trustStore = new ElectronSettingsDeviceTrustStore();
  private cloudConfig?: { cloudUrl: string; accessToken: string };
  private cloudClient?: ElectronCloudClient;
  private cloudAuthorizer?: CloudDeviceAuthorizer;
  private cloudGrantCache = new Map<string, DeviceConnectionGrant>();
  private cloudHeartbeatTimer?: ReturnType<typeof setInterval>;
  private cloudMaintenancePromise?: Promise<void>;
  private relayReservation?: DeviceRelayReservationToken;
  private cloudStatus: DeviceCloudConnectionStatus = { configured: false, state: 'not-configured' };
  private runtimeOptions: DeviceNetworkRuntimeOptions = {};
  public devices$ = new BehaviorSubject<Device[]>([]);
  public pairingSessions$ = new BehaviorSubject<PairingSession[]>([]);
  private deviceNetworkUnsubscribers: Array<() => void> = [];

  constructor(
    @inject(serviceIdentifier.Authentication) private readonly authService: IAuthenticationService,
  ) {}

  public configureRuntime(options: DeviceNetworkRuntimeOptions): void {
    this.runtimeOptions = options;
  }

  public async getLocalIdentity(): Promise<LocalDeviceIdentity> {
    await this.ensureIdentity();
    return this.identity!;
  }

  public async start(): Promise<void> {
    if (this.started) return;
    this.loadPersistedCloudConfiguration();
    await this.ensureIdentity();

    let authorizer: DeviceAuthorizer = this.createLocalPairingAuthorizer();
    if (this.cloudClient) {
      this.cloudStatus = { configured: true, cloudUrl: this.cloudConfig?.cloudUrl, state: 'connecting' };
      try {
        const publicKey = await this.cloudClient.getConnectionGrantPublicKey();
        const cloudAuthorizer = new CloudDeviceAuthorizer({
          localPeerId: this.identity!.peerId,
          grantVerificationPublicKeyMultibase: publicKey.publicKeyMultibase,
          // Cloud-account peers must always present a current signed grant.
          // Only an explicit local pairing may bypass Cloud authorization.
          getTrustedDevice: (peerId) => locallyPairedRecord(this.core?.getTrustedDevice(peerId)),
        });
        authorizer = cloudAuthorizer;
        this.cloudAuthorizer = cloudAuthorizer;
      } catch (error) {
        // Stay usable for local pairing while denying Cloud-account traffic
        // until the verification key can be fetched again on restart.
        logger.warn('DeviceNetworkService cloud grant public key fetch failed', { error });
        this.setCloudError(error);
      }
    }

    const capabilities = await this.buildCapabilities();
    this.core = new Libp2pDeviceNetworkService({
      identity: this.identity!,
      capabilities,
      trustStore: this.trustStore,
      authorizer,
      enableMdns: true,
      syncStorage: this.runtimeOptions.syncStorage,
      rpcHandler: this.runtimeOptions.rpcHandler,
    });
    await this.core.start();

    if (this.cloudClient) {
      let initialCloudError: unknown;
      try {
        await this.registerCloudDevice(capabilities);
      } catch (error) {
        initialCloudError = error;
        logger.warn('DeviceNetworkService cloud device registration failed', { error });
      }
      try {
        const synced = await this.syncCloudDevices();
        logger.info('DeviceNetworkService cloud directory synced', { count: synced.length });
      } catch (error) {
        initialCloudError ??= error;
        logger.warn('DeviceNetworkService initial cloud sync failed', { error });
      }
      if (initialCloudError) this.setCloudError(initialCloudError);
      else this.setCloudOnline();
      // Keep retrying even when the initial registration happened while the
      // machine was offline. A successful first request is not required to arm
      // recovery.
      this.scheduleCloudHeartbeat();
    }

    this.started = true;
    // Wire core observables to IPC-serializable BehaviorSubjects.
    // The core's observe methods return unsubscribe functions that cannot cross IPC,
    // so we mirror their values into Value$ observables exposed to the renderer.
    this.deviceNetworkUnsubscribers.push(
      this.core.observeDevices((devices) => {
        this.devices$.next(devices);
      }),
      this.core.observePairingSessions((sessions) => {
        this.pairingSessions$.next(sessions);
      }),
    );
    logger.info('DeviceNetworkService started', { peerId: this.identity!.peerId, cloud: !!this.cloudClient });
  }

  public async stop(): Promise<void> {
    if (!this.started) return;
    if (this.cloudHeartbeatTimer) {
      clearInterval(this.cloudHeartbeatTimer);
      this.cloudHeartbeatTimer = undefined;
    }
    for (const unsubscribe of this.deviceNetworkUnsubscribers) {
      unsubscribe();
    }
    this.deviceNetworkUnsubscribers = [];
    await this.core?.stop();
    this.core = undefined;
    this.started = false;
    this.cloudGrantCache.clear();
    this.relayReservation = undefined;
    this.cloudMaintenancePromise = undefined;
    logger.info('DeviceNetworkService stopped');
  }

  public async configureCloud(config: { cloudUrl: string; accessToken: string }): Promise<void> {
    const normalized = validateCloudConfiguration(config);
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('secure_storage_unavailable');
    }
    const client = new ElectronCloudClient(normalized.cloudUrl, normalized.accessToken);
    await Promise.all([
      client.getConnectionGrantPublicKey(),
      // The public-key endpoint may be intentionally public. Listing devices
      // proves the supplied account token is actually accepted before storing it.
      client.listDevices(),
    ]);
    const record: EncryptedCloudConfigurationRecord = {
      cloudUrl: normalized.cloudUrl,
      encryptedAccessToken: safeStorage.encryptString(normalized.accessToken).toString('base64'),
    };
    settings.setSync(CLOUD_CONFIGURATION_KEY, record as unknown as Parameters<typeof settings.setSync>[1]);
    await this.applyCloudConfiguration(normalized, client);
  }

  public async clearCloudConfiguration(): Promise<void> {
    settings.unsetSync(CLOUD_CONFIGURATION_KEY);
    const shouldRestart = this.started;
    if (shouldRestart) await this.stop();
    this.cloudConfig = undefined;
    this.cloudClient = undefined;
    this.cloudAuthorizer = undefined;
    this.cloudStatus = { configured: false, state: 'not-configured' };
    if (shouldRestart) await this.start();
  }

  public async getCloudConnectionStatus(): Promise<DeviceCloudConnectionStatus> {
    this.loadPersistedCloudConfiguration();
    return { ...this.cloudStatus };
  }

  public async syncCloudDevices(): Promise<CloudDeviceRecord[]> {
    if (!this.cloudClient) throw new Error('cloud_not_configured');
    const previousCloudRecords = (await this.trustStore.loadTrustedDevices()).filter(
      record => record.trustMode === 'cloud-account',
    );
    const result = await syncCloudDevices({
      cloudClient: this.cloudClient,
      trustStore: this.trustStore,
    });
    const activeDevices = result.filter(device => !device.revokedAt);
    const activeCloudPeerIds = new Set(activeDevices.map(device => device.peerId));
    // Defend downstream hosts even when an older core package is temporarily
    // installed: revoked and disappeared Cloud trust must be removed eagerly.
    for (const staleRecord of previousCloudRecords) {
      if (!activeCloudPeerIds.has(staleRecord.peerId)) {
        await this.trustStore.removeTrustedDevice(staleRecord.peerId);
      }
    }
    for (const revokedDevice of result.filter(device => Boolean(device.revokedAt))) {
      await this.trustStore.removeTrustedDevice(revokedDevice.peerId);
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
          createdAt: Date.now(),
          lastSeen: device.lastSeen,
          revokedAt: device.revokedAt,
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
    const grant = presentedGrant ?? await this.resolveOutboundGrant(peerId);
    return this.core!.sendRpc(peerId, method, parameters, grant);
  }

  public async syncWithDevice(peerId: string, presentedGrant?: DeviceConnectionGrant): Promise<SyncResult> {
    const grant = presentedGrant ?? await this.resolveOutboundGrant(peerId);
    return this.core!.syncWithDevice(peerId, grant);
  }

  private async registerCloudDevice(capabilities: DeviceCapabilities): Promise<void> {
    if (!this.cloudClient || !this.identity || !this.core) return;
    const nonce = await this.cloudClient.createBindingNonce();
    await this.cloudClient.registerDevice({
      identity: this.identity,
      cloudNonce: nonce.nonce,
      signature: await signDeviceBinding({ identity: this.identity, accountId: nonce.accountId, nonce: nonce.nonce }),
      capabilities,
      multiaddrs: this.core.getMultiaddrs(),
      relayReservations: [],
    });
    try {
      this.relayReservation = await this.cloudClient.createRelayReservation({ peerId: this.identity.peerId });
      await this.core.configureRelayReservation(this.relayReservation);
    } catch (error) {
      logger.warn('DeviceNetworkService relay reservation failed', { error });
    }
    await this.sendCloudHeartbeat();
  }

  private scheduleCloudHeartbeat(): void {
    if (this.cloudHeartbeatTimer) clearInterval(this.cloudHeartbeatTimer);
    this.cloudHeartbeatTimer = setInterval(() => {
      void this.runCloudMaintenance().catch((error: unknown) => {
        logger.warn('DeviceNetworkService cloud maintenance failed', { error: error instanceof Error ? error : String(error) });
      });
    }, CLOUD_HEARTBEAT_INTERVAL_MS);
  }

  private runCloudMaintenance(): Promise<void> {
    if (this.cloudMaintenancePromise) return this.cloudMaintenancePromise;
    const maintenance = this.maintainCloudConnection();
    const trackedMaintenance = maintenance.finally(() => {
      if (this.cloudMaintenancePromise === trackedMaintenance) this.cloudMaintenancePromise = undefined;
    });
    this.cloudMaintenancePromise = trackedMaintenance;
    return trackedMaintenance;
  }

  private async maintainCloudConnection(): Promise<void> {
    if (!this.cloudClient || !this.identity || !this.core) return;
    try {
      if (
        shouldRenewRelayReservation(this.relayReservation, Date.now())
      ) {
        this.relayReservation = await this.cloudClient.createRelayReservation({ peerId: this.identity.peerId });
        await this.core.configureRelayReservation(this.relayReservation);
      }
      await this.sendCloudHeartbeat();
      this.setCloudOnline();
    } catch (error) {
      this.setCloudError(error);
      logger.warn('DeviceNetworkService cloud connection requires recovery', {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.registerCloudDevice(await this.buildCapabilities());
      await this.syncCloudDevices();
      this.setCloudOnline();
    }
  }

  private async sendCloudHeartbeat(): Promise<void> {
    if (!this.cloudClient || !this.identity || !this.core) return;
    await this.cloudClient.heartbeat({
      peerId: this.identity.peerId,
      capabilities: await this.buildCapabilities(),
      multiaddrs: this.core.getMultiaddrs(),
      relayReservations: this.currentRelayReservations(),
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
    const stored = settings.getSync(DEVICE_IDENTITY_KEY) as unknown as EncryptedIdentityRecord | undefined;
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

  private loadPersistedCloudConfiguration(): void {
    if (this.cloudClient || this.cloudConfig) return;
    const stored = settings.getSync(CLOUD_CONFIGURATION_KEY) as unknown as EncryptedCloudConfigurationRecord | undefined;
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
      this.cloudConfig = normalized;
      this.cloudClient = new ElectronCloudClient(normalized.cloudUrl, normalized.accessToken);
      this.cloudStatus = { configured: true, cloudUrl: normalized.cloudUrl, state: 'idle' };
    } catch (error) {
      logger.warn('DeviceNetworkService ignored invalid encrypted Cloud configuration', { error });
    }
  }

  private async applyCloudConfiguration(
    config: { cloudUrl: string; accessToken: string },
    client = new ElectronCloudClient(config.cloudUrl, config.accessToken),
  ): Promise<void> {
    const shouldRestart = this.started;
    if (shouldRestart) await this.stop();
    this.cloudConfig = config;
    this.cloudClient = client;
    this.cloudStatus = { configured: true, cloudUrl: config.cloudUrl, state: 'idle' };
    if (shouldRestart) await this.start();
  }

  private setCloudOnline(): void {
    this.cloudStatus = {
      configured: true,
      cloudUrl: this.cloudConfig?.cloudUrl,
      state: 'online',
      lastConnectedAt: Date.now(),
      relayExpiresAt: this.relayReservation?.expiresAt,
    };
  }

  private setCloudError(error: unknown): void {
    this.cloudStatus = {
      configured: true,
      cloudUrl: this.cloudConfig?.cloudUrl,
      state: 'error',
      error: error instanceof Error ? error.message : String(error),
      lastConnectedAt: this.cloudStatus.lastConnectedAt,
      relayExpiresAt: this.relayReservation?.expiresAt,
    };
  }

  private createLocalPairingAuthorizer(): LocalTrustDeviceAuthorizer {
    return new LocalTrustDeviceAuthorizer({
      getTrustedDevice: peerId => locallyPairedRecord(this.core?.getTrustedDevice(peerId)),
    });
  }

  private tryLoadStoredIdentity(stored: EncryptedIdentityRecord): RawSeedDeviceIdentity | undefined {
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
    const record: EncryptedIdentityRecord = {
      peerId: identity.peerId,
      publicKeyMultibase: identity.publicKeyMultibase,
      encryptedPrivateKey: encrypted.toString('base64'),
      deviceName: identity.deviceName,
      platform: 'desktop',
      createdAt: identity.createdAt,
    };
    settings.setSync(DEVICE_IDENTITY_KEY, record as unknown as Parameters<typeof settings.setSync>[1]);
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
