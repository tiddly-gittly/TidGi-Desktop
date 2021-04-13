import { contextBridge, ipcRenderer, MenuItemConstructorOptions, webFrame } from 'electron';
import path from 'path';
import { ViewChannel, WindowChannel } from '@/constants/channels';
import { rendererMenuItemProxy } from '@services/menu/rendererMenuItemProxy';
import { IOnContextMenuInfo } from '@services/menu/interface';

import * as service from './services';
import { windowName } from './browserViewMetaData';

export const remoteMethods = {
  popContextMenu: (menus: MenuItemConstructorOptions[], parameters: IOnContextMenuInfo): (() => void) => {
    const [ipcSafeMenus, unregister] = rendererMenuItemProxy(menus);
    void service.menu.buildContextMenuAndPopup(ipcSafeMenus, parameters, windowName);
    return unregister;
  },
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
