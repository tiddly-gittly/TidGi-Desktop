import 'reflect-metadata';
import { contextBridge, ipcRenderer } from 'electron';
import { IServicesWithoutObservables, IServicesWithOnlyObservables } from 'electron-ipc-cat/common';

import './common/test';
import './common/i18n';
import './common/log';
import './common/remote';
import * as service from './common/services';
import { ViewChannel } from '@/constants/channels';
import { IPossibleWindowMeta, WindowNames } from '@services/windows/WindowProperties';
import { browserViewMetaData } from './common/browserViewMetaData';
import './common/authingPostMessage';
import './view';
import { syncTidgiStateWhenWikiLoads } from './appState';

contextBridge.exposeInMainWorld('service', service);

declare global {
  interface Window {
    meta: IPossibleWindowMeta;
    observables: IServicesWithOnlyObservables<typeof service>;
    service: IServicesWithoutObservables<typeof service>;
  }
}

switch (browserViewMetaData.windowName) {
  case WindowNames.main: {
    /**
     * automatically reload page/wiki when wifi/network is re-connected to a different one, which may cause local ip changed. Or wifi status changed when wiki startup, causing wiki not loaded properly.
     * @url https://www.electronjs.org/docs/latest/tutorial/online-offline-events
     */
    const handleOnlineOffline = (): void => {
      void ipcRenderer.invoke(ViewChannel.onlineStatusChanged, window.navigator.onLine);
    };
    window.addEventListener('online', handleOnlineOffline);
    window.addEventListener('offline', handleOnlineOffline);
    break;
  }
  case WindowNames.view: {
    void syncTidgiStateWhenWikiLoads();
    break;
  }
}
