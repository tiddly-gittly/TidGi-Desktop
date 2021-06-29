import { contextBridge, ipcRenderer, MenuItemConstructorOptions, webFrame } from 'electron';
import path from 'path';
import { ViewChannel, WindowChannel } from '@/constants/channels';
import { rendererMenuItemProxy } from '@services/menu/rendererMenuItemProxy';
import { IOnContextMenuInfo } from '@services/menu/interface';
import { getLocalHostUrlWithActualIP } from '@services/libs/url';

import * as service from './services';
import { windowName } from './browserViewMetaData';

export const remoteMethods = {
  buildContextMenuAndPopup: async (menus: MenuItemConstructorOptions[], parameters: IOnContextMenuInfo): Promise<() => void> => {
    const [ipcSafeMenus, unregister] = rendererMenuItemProxy(menus);
    await service.menu.buildContextMenuAndPopup(ipcSafeMenus, parameters, windowName);
    return unregister;
  },
  closeCurrentWindow: async (): Promise<void> => {
    await service.window.close(windowName);
  },
  /** call NodeJS.path */
  getBaseName: (pathString?: string): string | undefined => {
    if (typeof pathString === 'string') return path.basename(pathString);
  },
  getDirectoryName: (pathString?: string): string | undefined => {
    if (typeof pathString === 'string') return path.dirname(pathString);
  },
  joinPath: (...paths: string[]): string => {
    return path.join(...paths);
  },
  getLocalHostUrlWithActualIP,
  /**
   * an wrapper around setVisualZoomLevelLimits
   */
  setVisualZoomLevelLimits: (minimumLevel: number, maximumLevel: number): void => {
    webFrame.setVisualZoomLevelLimits(minimumLevel, maximumLevel);
  },
  registerOpenFindInPage: (handleOpenFindInPage: () => void): void => void ipcRenderer.on(WindowChannel.openFindInPage, handleOpenFindInPage),
  unregisterOpenFindInPage: (handleOpenFindInPage: () => void): void => void ipcRenderer.removeListener(WindowChannel.openFindInPage, handleOpenFindInPage),
  registerCloseFindInPage: (handleCloseFindInPage: () => void): void => void ipcRenderer.on(WindowChannel.closeFindInPage, handleCloseFindInPage),
  unregisterCloseFindInPage: (handleCloseFindInPage: () => void): void => void ipcRenderer.removeListener(WindowChannel.closeFindInPage, handleCloseFindInPage),
  registerUpdateFindInPageMatches: (updateFindInPageMatches: (event: Electron.IpcRendererEvent, activeMatchOrdinal: number, matches: number) => void): void =>
    void ipcRenderer.on(ViewChannel.updateFindInPageMatches, updateFindInPageMatches),
  unregisterUpdateFindInPageMatches: (updateFindInPageMatches: (event: Electron.IpcRendererEvent, activeMatchOrdinal: number, matches: number) => void): void =>
    void ipcRenderer.removeListener(ViewChannel.updateFindInPageMatches, updateFindInPageMatches),
};
contextBridge.exposeInMainWorld('remote', remoteMethods);

declare global {
  interface Window {
    remote: typeof remoteMethods;
  }
}
