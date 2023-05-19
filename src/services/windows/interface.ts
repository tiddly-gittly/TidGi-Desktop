import { Channels, WindowChannel } from '@/constants/channels';
import { BrowserWindow } from 'electron';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { WindowMeta, WindowNames } from './WindowProperties';

/**
 * Create and manage window open and destroy, you can get all opened electron window instance here
 */
export interface IWindowService {
  clearStorageData(windowName?: WindowNames): Promise<void>;
  close(windowName: WindowNames): Promise<void>;
  findInPage(text: string, forward?: boolean | undefined, windowName?: WindowNames): Promise<void>;
  /** get window, this should not be called in renderer side */
  get(windowName: WindowNames): BrowserWindow | undefined;
  getWindowMeta<N extends WindowNames>(windowName: N): Promise<WindowMeta[N] | undefined>;
  goBack(windowName: WindowNames): Promise<void>;
  goForward(windowName: WindowNames): Promise<void>;
  goHome(windowName: WindowNames): Promise<void>;
  isFullScreen(windowName?: WindowNames): Promise<boolean | undefined>;
  isMenubarOpen(): Promise<boolean>;
  loadURL(windowName: WindowNames, newUrl?: string): Promise<void>;
  maximize(): Promise<void>;
  open<N extends WindowNames>(
    windowName: N,
    meta?: WindowMeta[N],
    config?: {
      recreate?: boolean | ((windowMeta: WindowMeta[N]) => boolean);
    },
  ): Promise<void>;
  reload(windowName: WindowNames): Promise<void>;
  requestRestart(): Promise<void>;
  sendToAllWindows: (channel: Channels, ...arguments_: unknown[]) => Promise<void>;
  setWindowMeta<N extends WindowNames>(windowName: N, meta?: WindowMeta[N]): Promise<void>;
  stopFindInPage(close?: boolean | undefined, windowName?: WindowNames): Promise<void>;
  updateWindowMeta<N extends WindowNames>(windowName: N, meta?: WindowMeta[N]): Promise<void>;
}
export const WindowServiceIPCDescriptor = {
  channel: WindowChannel.name,
  properties: {
    clearStorageData: ProxyPropertyType.Function,
    close: ProxyPropertyType.Function,
    findInPage: ProxyPropertyType.Function,
    get: ProxyPropertyType.Function,
    getWindowMeta: ProxyPropertyType.Function,
    goBack: ProxyPropertyType.Function,
    goForward: ProxyPropertyType.Function,
    goHome: ProxyPropertyType.Function,
    isFullScreen: ProxyPropertyType.Function,
    isMenubarOpen: ProxyPropertyType.Function,
    loadURL: ProxyPropertyType.Function,
    maximize: ProxyPropertyType.Function,
    open: ProxyPropertyType.Function,
    reload: ProxyPropertyType.Function,
    requestRestart: ProxyPropertyType.Function,
    sendToAllWindows: ProxyPropertyType.Function,
    setWindowMeta: ProxyPropertyType.Function,
    stopFindInPage: ProxyPropertyType.Function,
    updateWindowMeta: ProxyPropertyType.Function,
  },
};
