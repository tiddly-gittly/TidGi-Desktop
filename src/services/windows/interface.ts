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
  setWindowMeta<N extends WindowNames>(windowName: N, meta?: WindowMeta[N]): void;
  updateWindowMeta<N extends WindowNames>(windowName: N, meta?: WindowMeta[N]): void;
  getWindowMeta<N extends WindowNames>(windowName: N): WindowMeta[N] | undefined;
  sendToAllWindows: (channel: Channels, ...arguments_: unknown[]) => void;
  goHome(windowName: WindowNames): Promise<void>;
  goBack(windowName: WindowNames): void;
  goForward(windowName: WindowNames): void;
  reload(windowName: WindowNames): void;
  showMessageBox(message: Electron.MessageBoxOptions['message'], type?: Electron.MessageBoxOptions['type']): void;
}
export const WindowServiceIPCDescriptor = {
  channel: WindowChannel.name,
  properties: {
    get: ProxyPropertyType.Function,
    open: ProxyPropertyType.Function,
    setWindowMeta: ProxyPropertyType.Function,
    updateWindowMeta: ProxyPropertyType.Function,
    getWindowMeta: ProxyPropertyType.Function,
    sendToAllWindows: ProxyPropertyType.Function,
    goHome: ProxyPropertyType.Function,
    goBack: ProxyPropertyType.Function,
    goForward: ProxyPropertyType.Function,
    reload: ProxyPropertyType.Function,
    showMessageBox: ProxyPropertyType.Function,
  },
};
