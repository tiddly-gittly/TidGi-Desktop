import { DeviceNetworkChannel } from '@/constants/channels';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type {
  CloudDeviceRecord,
  Device,
  DeviceCapabilities,
  DeviceConnectionGrant,
  DeviceNetworkService as CoreDeviceNetworkService,
  DeviceRpcHandler,
  FullAgentStorage,
  LocalDeviceIdentity,
  MemeLoopDuplexStream,
  MemeLoopProtocol,
  PairingSession,
  SyncResult,
  TrustedDeviceRecord,
} from 'memeloop';
import type { DeviceCloudConnectionSnapshot } from 'memeloop/device-network';
import type { BehaviorSubject } from 'rxjs';

export interface DeviceNetworkPersistedIdentity {
  peerId: string;
  publicKeyMultibase: string;
  encryptedPrivateKey: string;
  deviceName: string;
  platform: 'desktop';
  createdAt: number;
}

/** Host-only persisted Cloud settings; the access token is encrypted at rest. */
export interface HostDeviceNetworkPersistedCloudConfiguration {
  cloudUrl: string;
  encryptedAccessToken: string;
}

/**
 * Device-network state shares the application's authoritative settings snapshot.
 * Keeping it under one top-level key prevents electron-settings writes from being
 * overwritten when DatabaseService flushes its in-memory settings object.
 */
export interface DeviceNetworkPersistedSettings {
  /** Generation metadata for the durable, all-or-nothing Cloud trust snapshot. */
  cloudTrustSnapshotV1?: {
    epoch: string;
    generation: number;
  };
  cloudConfigurationV1?: HostDeviceNetworkPersistedCloudConfiguration;
  identityV1?: DeviceNetworkPersistedIdentity;
  trustedDevicesV1?: TrustedDeviceRecord[];
}

/** Host-only runtime injection points for Core's device-network service. */
export interface HostDeviceNetworkRuntimeOptions {
  buildCapabilities?: () => Promise<DeviceCapabilities>;
  rpcHandler?: DeviceRpcHandler;
  syncStorage?: FullAgentStorage;
}

/** Core Cloud snapshot plus Desktop-only display metadata. */
export type DeviceCloudConnectionStatus = DeviceCloudConnectionSnapshot & {
  readonly cloudUrl?: string;
  readonly lastConnectedAt?: number;
};

/** Initial Core-shaped snapshot used before the Cloud coordinator starts. */
export function createInitialDeviceCloudConnectionStatus(): DeviceCloudConnectionStatus {
  return {
    status: 'not-configured',
    generation: 0,
    components: {
      authorizer: 'not-run',
      registration: 'not-run',
      relay: 'not-run',
      heartbeat: 'not-run',
      directory: 'not-run',
    },
  };
}

export interface DesktopDeviceSyncOptions {
  presentedGrant?: DeviceConnectionGrant;
  conversationIds?: string[];
  signal?: AbortSignal;
  /** Serializable renderer-to-main cancellation handle. */
  operationId?: string;
}

export interface DesktopDeviceConnectionOptions {
  presentedGrant?: DeviceConnectionGrant;
  signal?: AbortSignal;
  /** Serializable renderer-to-main cancellation handle. */
  operationId?: string;
}

export interface IDeviceNetworkService extends Omit<CoreDeviceNetworkService, 'openStream' | 'sendRpc' | 'syncWithDevice'> {
  openStream(peerId: string, protocol: MemeLoopProtocol, options?: DesktopDeviceConnectionOptions): Promise<MemeLoopDuplexStream>;
  sendRpc<T>(peerId: string, method: string, parameters: unknown, options?: DesktopDeviceConnectionOptions): Promise<T>;
  syncWithDevice(peerId: string, options?: DesktopDeviceSyncOptions): Promise<SyncResult>;
  abortOperation(operationId: string): Promise<void>;
  finishOperation(operationId: string): Promise<void>;
  getLocalIdentity(): Promise<LocalDeviceIdentity>;
  getCloudConnectionStatus(): Promise<DeviceCloudConnectionStatus>;
  createPairingInvite(): Promise<string>;
  requestPairingFromInvite(serialized: string): Promise<PairingSession>;
  clearCloudConfiguration(): Promise<void>;
  configureCloud(config: { cloudUrl: string; accessToken: string }): Promise<void>;
  configureRuntime(options: HostDeviceNetworkRuntimeOptions): void;
  cloudStatus$: BehaviorSubject<DeviceCloudConnectionStatus>;
  devices$: BehaviorSubject<Device[]>;
  pairingSessions$: BehaviorSubject<PairingSession[]>;
}

export const DeviceNetworkServiceIPCDescriptor = {
  channel: DeviceNetworkChannel.name,
  properties: {
    start: ProxyPropertyType.Function,
    stop: ProxyPropertyType.Function,
    getLocalDevice: ProxyPropertyType.Function,
    getLocalIdentity: ProxyPropertyType.Function,
    getCloudConnectionStatus: ProxyPropertyType.Function,
    createPairingInvite: ProxyPropertyType.Function,
    requestPairingFromInvite: ProxyPropertyType.Function,
    clearCloudConfiguration: ProxyPropertyType.Function,
    listDevices: ProxyPropertyType.Function,
    listPairingSessions: ProxyPropertyType.Function,
    requestLocalPairing: ProxyPropertyType.Function,
    acceptPairing: ProxyPropertyType.Function,
    rejectPairing: ProxyPropertyType.Function,
    removeTrustedDevice: ProxyPropertyType.Function,
    configureCloud: ProxyPropertyType.Function,
    syncCloudDevices: ProxyPropertyType.Function,
    sendRpc: ProxyPropertyType.Function,
    syncWithDevice: ProxyPropertyType.Function,
    abortOperation: ProxyPropertyType.Function,
    finishOperation: ProxyPropertyType.Function,
    cloudStatus$: ProxyPropertyType.Value$,
    devices$: ProxyPropertyType.Value$,
    pairingSessions$: ProxyPropertyType.Value$,
  },
};

export type { CloudDeviceRecord, Device, PairingSession, SyncResult };
