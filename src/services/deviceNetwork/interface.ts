import { DeviceNetworkChannel } from '@/constants/channels';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type { Device, DeviceNetworkService as CoreDeviceNetworkService, LocalDeviceIdentity, PairingSession, SyncResult } from 'memeloop';

export interface IDeviceNetworkService extends CoreDeviceNetworkService {
  getLocalIdentity(): Promise<LocalDeviceIdentity>;
}

export const DeviceNetworkServiceIPCDescriptor = {
  channel: DeviceNetworkChannel.name,
  properties: {
    start: ProxyPropertyType.Function,
    stop: ProxyPropertyType.Function,
    getLocalDevice: ProxyPropertyType.Function,
    getLocalIdentity: ProxyPropertyType.Function,
    listDevices: ProxyPropertyType.Function,
    requestLocalPairing: ProxyPropertyType.Function,
    acceptPairing: ProxyPropertyType.Function,
    rejectPairing: ProxyPropertyType.Function,
    removeTrustedDevice: ProxyPropertyType.Function,
    sendRpc: ProxyPropertyType.Function,
    syncWithDevice: ProxyPropertyType.Function,
  },
};

export type { Device, PairingSession, SyncResult };
