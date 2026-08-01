import { DeviceNetworkChannel } from '@/constants/channels';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type {
  CloudDeviceRecord,
  Device,
  DeviceCapabilities,
  DeviceNetworkService as CoreDeviceNetworkService,
  DeviceRpcHandler,
  IAgentStorage,
  LocalDeviceIdentity,
  PairingSession,
  SyncResult,
} from 'memeloop';
import type { BehaviorSubject } from 'rxjs';

export interface DeviceNetworkRuntimeOptions {
  buildCapabilities?: () => Promise<DeviceCapabilities>;
  rpcHandler?: DeviceRpcHandler;
  syncStorage?: IAgentStorage;
}

export interface DeviceCloudConnectionStatus {
  configured: boolean;
  cloudUrl?: string;
  error?: string;
  lastConnectedAt?: number;
  relayExpiresAt?: number;
  state: 'not-configured' | 'idle' | 'connecting' | 'online' | 'error';
}

export interface IDeviceNetworkService extends CoreDeviceNetworkService {
  getLocalIdentity(): Promise<LocalDeviceIdentity>;
  getCloudConnectionStatus(): Promise<DeviceCloudConnectionStatus>;
  clearCloudConfiguration(): Promise<void>;
  configureCloud(config: { cloudUrl: string; accessToken: string }): Promise<void>;
  configureRuntime(options: DeviceNetworkRuntimeOptions): void;
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
    devices$: ProxyPropertyType.Value$,
    pairingSessions$: ProxyPropertyType.Value$,
  },
};

export type { CloudDeviceRecord, Device, PairingSession, SyncResult };
