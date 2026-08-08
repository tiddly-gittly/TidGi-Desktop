import { DeviceNetworkChannel } from '@/constants/channels';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type {
  CloudDeviceRecord,
  Device,
  DeviceCapabilities,
  DeviceCloudConnectionSnapshot,
  DeviceNetworkService as CoreDeviceNetworkService,
  DeviceRpcHandler,
  IAgentStorage,
  LocalDeviceIdentity,
  PairingSession,
  SyncResult,
  TrustedDeviceRecord,
  VersionVector,
} from 'memeloop';
import type { BehaviorSubject } from 'rxjs';

export interface DeviceNetworkPersistedIdentity {
  peerId: string;
  publicKeyMultibase: string;
  encryptedPrivateKey: string;
  deviceName: string;
  platform: 'desktop';
  createdAt: number;
}

export interface DeviceNetworkPersistedCloudConfiguration {
  cloudUrl: string;
  encryptedAccessToken: string;
}

/**
 * Device-network state shares the application's authoritative settings snapshot.
 * Keeping it under one top-level key prevents electron-settings writes from being
 * overwritten when DatabaseService flushes its in-memory settings object.
 */
export interface DeviceNetworkPersistedSettings {
  cloudConfigurationV1?: DeviceNetworkPersistedCloudConfiguration;
  identityV1?: DeviceNetworkPersistedIdentity;
  syncVersionVectorV2?: VersionVector;
  trustedDevicesV1?: TrustedDeviceRecord[];
}

export interface DeviceNetworkRuntimeOptions {
  buildCapabilities?: () => Promise<DeviceCapabilities>;
  rpcHandler?: DeviceRpcHandler;
  syncStorage?: IAgentStorage;
}

export interface DeviceCloudConnectionStatus {
  configured: boolean;
  cloudUrl?: string;
  components?: DeviceCloudConnectionSnapshot['components'];
  error?: string;
  generation?: number;
  lastConnectedAt?: number;
  nextRetryAt?: number;
  relayExpiresAt?: number;
  state: DeviceCloudConnectionSnapshot['status'];
}

export interface IDeviceNetworkService extends CoreDeviceNetworkService {
  getLocalIdentity(): Promise<LocalDeviceIdentity>;
  getCloudConnectionStatus(): Promise<DeviceCloudConnectionStatus>;
  createPairingInvite(): Promise<string>;
  requestPairingFromInvite(serialized: string): Promise<PairingSession>;
  clearCloudConfiguration(): Promise<void>;
  configureCloud(config: { cloudUrl: string; accessToken: string }): Promise<void>;
  configureRuntime(options: DeviceNetworkRuntimeOptions): void;
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
    cloudStatus$: ProxyPropertyType.Value$,
    devices$: ProxyPropertyType.Value$,
    pairingSessions$: ProxyPropertyType.Value$,
  },
};

export type { CloudDeviceRecord, Device, PairingSession, SyncResult };
