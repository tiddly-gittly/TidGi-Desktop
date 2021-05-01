import 'reflect-metadata';
import { contextBridge, ipcRenderer } from 'electron';

import './common/test';
import './common/i18n';
import './common/log';
import './common/remote';
import './common/authing-postmessage';
import * as service from './common/services';
import { ViewChannel } from '@/constants/channels';
import { WindowNames, IPossibleWindowMeta } from '@services/windows/WindowProperties';
import { IServicesWithoutObservables, IServicesWithOnlyObservables } from '@/helpers/electron-ipc-proxy/common';
import { windowName, browserViewMetaData } from './common/browserViewMetaData';

contextBridge.exposeInMainWorld('service', service);

declare global {
  interface Window {
    service: IServicesWithoutObservables<typeof service>;
    observables: IServicesWithOnlyObservables<typeof service>;
    meta: IPossibleWindowMeta;
  }
}

if (windowName === WindowNames.view) {
  void import('./view');
}
if (browserViewMetaData.windowName === 'main') {
  // automatically reload page when wifi/network is connected
  // https://www.electronjs.org/docs/tutorial/online-offline-events
  const handleOnlineOffline = (): void => {
    void ipcRenderer.invoke(ViewChannel.onlineStatusChanged, window.navigator.onLine);
  };
  window.addEventListener('online', handleOnlineOffline);
  window.addEventListener('offline', handleOnlineOffline);
}
