import { NativeChannel, ViewChannel, WindowChannel } from '@/constants/channels';
import { rendererMenuItemProxy } from '@services/menu/contextMenu/rendererMenuItemProxy';
import { IOnContextMenuInfo } from '@services/menu/interface';
import { contextBridge, ipcRenderer, MenuItemConstructorOptions, webFrame } from 'electron';

import { WindowNames } from '@services/windows/WindowProperties';
import { windowName } from './browserViewMetaData';
import * as service from './services';

export const remoteMethods = {
  buildContextMenuAndPopup: async (menus: MenuItemConstructorOptions[], parameters: IOnContextMenuInfo): Promise<() => void> => {
    const [ipcSafeMenus, unregister] = rendererMenuItemProxy(menus);
    await service.menu.buildContextMenuAndPopup(ipcSafeMenus, parameters, windowName);
    return unregister;
  },
  closeCurrentWindow: async (): Promise<void> => {
    await service.window.close(windowName);
  },
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
  /**
   * @returns — the index of the clicked button. -1 means unknown or errored. 0 if canceled (this can be configured by `cancelId` in the options).
   */
  showElectronMessageBoxSync: (options: Electron.MessageBoxSyncOptions): number => {
    // only main window can show message box, view window (browserView) can't. Currently didn't handle menubar window, hope it won't show message box...
    const clickedButtonIndex = ipcRenderer.sendSync(NativeChannel.showElectronMessageBoxSync, options, WindowNames.main) as unknown;
    if (typeof clickedButtonIndex === 'number') {
      return clickedButtonIndex;
    }
    return -1;
  },
};
contextBridge.exposeInMainWorld('remote', remoteMethods);

declare global {
  interface Window {
    remote: typeof remoteMethods;
  }
}
