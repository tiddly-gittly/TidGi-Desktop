import type { UpdateInfo } from 'electron-updater';
import type { ProgressInfo } from 'builder-util-runtime';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { UpdaterChannel } from '@/constants/channels';
import { BehaviorSubject } from 'rxjs';

export interface IUpdaterMetaData {
  info?: UpdateInfo | Error | ProgressInfo;
  status?: 'update-not-available' | 'checking-for-update' | 'update-available' | 'error' | 'update-cancelled' | 'download-progress' | 'update-downloaded';
}
export interface IUpdaterService {
  checkForUpdates(isSilent: boolean): Promise<void>;
  updaterMetaData$: BehaviorSubject<IUpdaterMetaData>;
}
export const UpdaterServiceIPCDescriptor = {
  channel: UpdaterChannel.name,
  properties: {
    updaterMetaData$: ProxyPropertyType.Value$,
    checkForUpdates: ProxyPropertyType.Function,
  },
};
