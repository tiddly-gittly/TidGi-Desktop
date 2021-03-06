import type { UpdateInfo } from 'electron-updater';
import type { ProgressInfo } from 'builder-util-runtime';
import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { UpdaterChannel } from '@/constants/channels';
import { Subject } from 'rxjs';

export interface IUpdaterMetaData {
  status?: 'update-not-available' | 'checking-for-update' | 'update-available' | 'error' | 'update-cancelled' | 'download-progress' | 'update-downloaded';
  info?: UpdateInfo | Error | ProgressInfo;
}
export interface IUpdaterService {
  updaterMetaData$: Subject<IUpdaterMetaData>;
  checkForUpdates(isSilent: boolean): Promise<void>;
}
export const UpdaterServiceIPCDescriptor = {
  channel: UpdaterChannel.name,
  properties: {
    updaterMetaData$: ProxyPropertyType.Value$,
    checkForUpdates: ProxyPropertyType.Function,
  },
};
