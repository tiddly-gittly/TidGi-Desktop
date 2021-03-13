import 'reflect-metadata';
import { contextBridge, ipcRenderer, webFrame } from 'electron';
import path from 'path';

import './common/i18n';
import './common/authing-postmessage';
import * as service from './common/services';
import { MetaDataChannel, ViewChannel, ContextChannel, WindowChannel } from '@/constants/channels';
import { WindowNames, WindowMeta, IPossibleWindowMeta } from '@services/windows/WindowProperties';

const extraMetaJSONString = process.argv.pop() as string;
const windowName = process.argv.pop() as WindowNames;
const extraMeta = JSON.parse(extraMetaJSONString) as WindowMeta[WindowNames];

const browserViewMetaData = { windowName, ...extraMeta };
contextBridge.exposeInMainWorld('meta', browserViewMetaData);
ipcRenderer.on(MetaDataChannel.getViewMetaData, (event) => {
  event.returnValue = browserViewMetaData;
});

contextBridge.exposeInMainWorld('service', service);

declare global {
  interface Window {
    service: typeof service;
    meta: IPossibleWindowMeta;
  }
}

const remoteMethods = {
  getCurrentWindow: async () => {
    const currentWindow = await service.window.get(windowName);
    if (currentWindow === undefined) {
      throw new Error(`currentWindow is undefined when getCurrentWindow() in preload script with windowName: ${windowName}`);
    }
    return currentWindow;
  },
  closeCurrentWindow: async () => {
    await service.window.close(windowName);
  },
  /** call NodeJS.path */
  getBaseName: (pathString?: string): string | undefined => {
    if (typeof pathString === 'string') return path.basename(pathString);
  },
  getDirectoryName: (pathString?: string): string | undefined => {
    if (typeof pathString === 'string') return path.dirname(pathString);
  },
  /**
   * an wrapper around setVisualZoomLevelLimits
   */
  setVisualZoomLevelLimits: (minimumLevel: number, maximumLevel: number): void => {
    webFrame.setVisualZoomLevelLimits(minimumLevel, maximumLevel);
  },
  registerOpenFindInPage: (handleOpenFindInPage: () => void) => void ipcRenderer.on(WindowChannel.openFindInPage, handleOpenFindInPage),
  unregisterOpenFindInPage: (handleOpenFindInPage: () => void) => void ipcRenderer.removeListener(WindowChannel.openFindInPage, handleOpenFindInPage),
  registerUpdateFindInPageMatches: (updateFindInPageMatches: (event: Electron.IpcRendererEvent, activeMatchOrdinal: number, matches: number) => void) =>
    void ipcRenderer.on(ViewChannel.updateFindInPageMatches, updateFindInPageMatches),
  unregisterUpdateFindInPageMatches: (updateFindInPageMatches: (event: Electron.IpcRendererEvent, activeMatchOrdinal: number, matches: number) => void) =>
    void ipcRenderer.removeListener(ViewChannel.updateFindInPageMatches, updateFindInPageMatches),
};
contextBridge.exposeInMainWorld('remote', remoteMethods);

declare global {
  interface Window {
    remote: typeof remoteMethods;
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
