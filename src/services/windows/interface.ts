import { Channels, WindowChannel } from '@/constants/channels';
import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { BrowserWindow } from 'electron';
import { WindowNames, WindowMeta } from './WindowProperties';

/**
 * Create and manage window open and destroy, you can get all opened electron window instance here
 */
export interface IWindowService {
  /** get window, this should not be called in renderer side */
  get(windowName: WindowNames): BrowserWindow | undefined;
  open<N extends WindowNames>(windowName: N, meta?: WindowMeta[N], recreate?: boolean | ((windowMeta: WindowMeta[N]) => boolean)): Promise<void>;
  close(windowName: WindowNames): Promise<void>;
  setWindowMeta<N extends WindowNames>(windowName: N, meta?: WindowMeta[N]): Promise<void>;
  updateWindowMeta<N extends WindowNames>(windowName: N, meta?: WindowMeta[N]): Promise<void>;
  getWindowMeta<N extends WindowNames>(windowName: N): Promise<WindowMeta[N] | undefined>;
  sendToAllWindows: (channel: Channels, ...arguments_: unknown[]) => Promise<void>;
  requestShowRequireRestartDialog(): Promise<void>;
  isFullScreen(windowName?: WindowNames): Promise<boolean | undefined>;
  goHome(windowName: WindowNames): Promise<void>;
  goBack(windowName: WindowNames): Promise<void>;
  goForward(windowName: WindowNames): Promise<void>;
  loadURL(windowName: WindowNames, newUrl?: string): Promise<void>;
  reload(windowName: WindowNames): Promise<void>;
  clearStorageData(windowName?: WindowNames): Promise<void>;
  findInPage(text: string, forward?: boolean | undefined, windowName?: WindowNames): Promise<void>;
  stopFindInPage(close?: boolean | undefined, windowName?: WindowNames): Promise<void>;
}
export const WindowServiceIPCDescriptor = {
  channel: WindowChannel.name,
  properties: {
    get: ProxyPropertyType.Function,
    open: ProxyPropertyType.Function,
    close: ProxyPropertyType.Function,
    setWindowMeta: ProxyPropertyType.Function,
    updateWindowMeta: ProxyPropertyType.Function,
    getWindowMeta: ProxyPropertyType.Function,
    requestShowRequireRestartDialog: ProxyPropertyType.Function,
    sendToAllWindows: ProxyPropertyType.Function,
    isFullScreen: ProxyPropertyType.Function,
    goHome: ProxyPropertyType.Function,
    goBack: ProxyPropertyType.Function,
    goForward: ProxyPropertyType.Function,
    reload: ProxyPropertyType.Function,
    loadURL: ProxyPropertyType.Function,
    clearStorageData: ProxyPropertyType.Function,
    findInPage: ProxyPropertyType.Function,
    stopFindInPage: ProxyPropertyType.Function,
  },
};
