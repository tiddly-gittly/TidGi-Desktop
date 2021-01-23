import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { UpdaterChannel } from '@/constants/channels';

export interface IUpdaterService {}
export const UpdaterServiceIPCDescriptor = {
  channel: UpdaterChannel.name,
  properties: {},
};
