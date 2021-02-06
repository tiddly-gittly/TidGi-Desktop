import { Channels, WindowChannel } from '@/constants/channels';
import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { BrowserWindow } from 'electron';
import { WindowNames, WindowMeta } from './WindowProperties';

/**
 * Create and manage window open and destroy, you can get all opened electron window instance here
 */
export interface IWindowService {
  get(windowName: WindowNames): BrowserWindow | undefined;
  open<N extends WindowNames>(windowName: N, meta?: WindowMeta[N], recreate?: boolean | ((windowMeta: WindowMeta[N]) => boolean)): Promise<void>;
  close(name: WindowNames): void;
  setWindowMeta<N extends WindowNames>(windowName: N, meta?: WindowMeta[N]): void;
  updateWindowMeta<N extends WindowNames>(windowName: N, meta?: WindowMeta[N]): void;
  getWindowMeta<N extends WindowNames>(windowName: N): WindowMeta[N] | undefined;
  sendToAllWindows: (channel: Channels, ...arguments_: unknown[]) => void;
  requestShowRequireRestartDialog(): Promise<void>;
  goHome(windowName: WindowNames): Promise<void>;
  goBack(windowName: WindowNames): void;
  goForward(windowName: WindowNames): void;
  reload(windowName: WindowNames): void;
  findInPage(text: string, forward?: boolean | undefined, windowName?: WindowNames): void;
  stopFindInPage(close?: boolean | undefined, windowName?: WindowNames): void;
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
    goHome: ProxyPropertyType.Function,
    goBack: ProxyPropertyType.Function,
    goForward: ProxyPropertyType.Function,
    reload: ProxyPropertyType.Function,
    findInPage: ProxyPropertyType.Function,
    stopFindInPage: ProxyPropertyType.Function,
  },
};
