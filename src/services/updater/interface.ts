import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { UpdaterChannel } from '@/constants/channels';

export interface IUpdaterService {
  checkForUpdates(isSilent: boolean): Promise<void>;
}
export const UpdaterServiceIPCDescriptor = {
  channel: UpdaterChannel.name,
  properties: {
    checkForUpdates: ProxyPropertyType.Function,
  },
};
