import { app, safeStorage } from 'electron';
import settings from 'electron-settings';
import { inject, injectable } from 'inversify';
import { BehaviorSubject } from 'rxjs';

import {
  CloudDeviceAuthorizer,
  type CloudDeviceClient,
  type CloudDeviceRecord,
  createDeviceIdentity,
  type Device,
  type DeviceCapabilities,
  type DeviceConnectionGrant,
  type DeviceRelayReservationToken,
  type DeviceTrustStore,
  Libp2pDeviceNetworkService,
  type LocalDeviceIdentity,
  type LocalPairingRequestOptions,
  type MemeLoopDuplexStream,
  type MemeLoopProtocol,
  type PairingSession,
  type RawSeedDeviceIdentity,
  signDeviceBinding,
  syncCloudDevices,
  type SyncResult,
  type TrustedDeviceRecord,
} from 'memeloop';

import type { IAuthenticationService } from '@services/auth/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';

import type { DeviceNetworkRuntimeOptions, IDeviceNetworkService } from './interface';

const DEVICE_IDENTITY_KEY = 'deviceNetwork.identity.v1';
const TRUSTED_DEVICES_KEY = 'deviceNetwork.trustedDevices.v1';

interface EncryptedIdentityRecord {
  peerId: string;
  publicKeyMultibase: string;
  encryptedPrivateKey: string;
  deviceName: string;
  platform: 'desktop';
  createdAt: number;
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
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${await response.text()}`);
    }
    return (await response.json()) as T;
  }
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
  private relayReservation?: DeviceRelayReservationToken;
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
    await this.ensureIdentity();

    let authorizer: CloudDeviceAuthorizer | undefined;
    if (this.cloudClient) {
      try {
        const publicKey = await this.cloudClient.getConnectionGrantPublicKey();
        authorizer = new CloudDeviceAuthorizer({
          localPeerId: this.identity!.peerId,
          grantVerificationPublicKeyMultibase: publicKey.publicKeyMultibase,
          getTrustedDevice: (peerId) => this.core?.getTrustedDevice(peerId),
        });
        this.cloudAuthorizer = authorizer;
      } catch (error) {
        logger.warn('DeviceNetworkService cloud grant public key fetch failed', { error });
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
      try {
        await this.registerCloudDevice(capabilities);
      } catch (error) {
        logger.warn('DeviceNetworkService cloud device registration failed', { error });
      }
      try {
        const synced = await this.syncCloudDevices();
        logger.info('DeviceNetworkService cloud directory synced', { count: synced.length });
      } catch (error) {
        logger.warn('DeviceNetworkService initial cloud sync failed', { error });
      }
    }

    this.started = true;
    // Wire core observables to IPC-serializable BehaviorSubjects.
    // The core's observe methods return unsubscribe functions that cannot cross IPC,
    // so we mirror their values into Value$ observables exposed to the renderer.
    this.deviceNetworkUnsubscribers.push(
      this.core.observeDevices((devices) => this.devices$.next(devices)),
      this.core.observePairingSessions((sessions) => this.pairingSessions$.next(sessions)),
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
    logger.info('DeviceNetworkService stopped');
  }

  public configureCloud(config: { cloudUrl: string; accessToken: string }): void {
    this.cloudConfig = config;
    this.cloudClient = new ElectronCloudClient(config.cloudUrl, config.accessToken);
  }

  public async syncCloudDevices(): Promise<CloudDeviceRecord[]> {
    if (!this.cloudClient) throw new Error('cloud_not_configured');
    const result = await syncCloudDevices({
      cloudClient: this.cloudClient,
      trustStore: this.trustStore,
    });
    if (result.length > 0 && this.core) {
      for (const device of result) {
        const trustedDevice: TrustedDeviceRecord = {
          peerId: device.peerId,
          publicKeyMultibase: device.publicKeyMultibase,
          deviceName: device.deviceName,
          platform: device.platform,
          trustMode: 'cloud-account',
          accountId: device.accountId,
          createdAt: Date.now(),
          lastSeen: device.lastSeen,
          revokedAt: device.revokedAt,
        };
        const paths = [
          ...(device.multiaddrs.length > 0 ? ['direct' as const] : []),
          ...(device.relayReservations.length > 0 ? ['relay' as const] : []),
        ];
        this.core.upsertTrustedDevice(trustedDevice);
        this.core.upsertDiscoveredDevice({
          peerId: device.peerId,
          displayName: device.deviceName,
          platform: device.platform,
          trustMode: 'cloud-account',
          trusted: !device.revokedAt,
          reachability: { state: device.revokedAt ? 'offline' : 'online', paths },
          capabilities: device.capabilities,
          multiaddrs: device.multiaddrs,
          lastSeen: device.lastSeen,
        });
      }
    }
    return result;
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
    this.scheduleCloudHeartbeat();
  }

  private scheduleCloudHeartbeat(): void {
    if (this.cloudHeartbeatTimer) clearInterval(this.cloudHeartbeatTimer);
    this.cloudHeartbeatTimer = setInterval(() => {
      void this.sendCloudHeartbeat().catch((error: unknown) => {
        logger.warn('DeviceNetworkService cloud heartbeat failed', { error: error instanceof Error ? error : String(error) });
      });
    }, 60_000);
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
