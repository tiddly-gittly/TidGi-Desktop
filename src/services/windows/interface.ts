import { Channels, WindowChannel } from '@/constants/channels';
import { BrowserWindow } from 'electron';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { WindowMeta, WindowNames } from './WindowProperties';

export interface IWindowOpenConfig<N extends WindowNames> {
  /**
   * Allow multiple window with same name
   */
  multiple?: boolean;
  /**
   * If recreate is true, we will close the window if it is already opened, and create a new one.
   */
  recreate?: boolean | ((windowMeta: WindowMeta[N]) => boolean);
}

/**
 * Create and manage window open and destroy, you can get all opened electron window instance here
 */
export interface IWindowService {
  clearStorageData(workspaceID: string, windowName?: WindowNames): Promise<void>;
  /** cleanup all window references for GC */
  clearWindowsReference(): Promise<void>;
  /**
   * Completely close a window, destroy its all state and WebContentsView. Need more time to restore. Use `hide` if you want to hide it temporarily.
   */
  close(windowName: WindowNames): Promise<void>;
  findInPage(text: string, forward?: boolean): Promise<void>;
  /** get window, this should not be called in renderer side */
  get(windowName: WindowNames): BrowserWindow | undefined;
  getWindowMeta<N extends WindowNames>(windowName: N): Promise<WindowMeta[N] | undefined>;
  goBack(): Promise<void>;
  goForward(): Promise<void>;
  goHome(): Promise<void>;
  /**
   * Temporarily hide window, it will not be destroyed, and can be shown again very quick, with WebContentsView restored immediately.
   */
  hide(windowName: WindowNames): Promise<void>;
  isFullScreen(windowName?: WindowNames): Promise<boolean | undefined>;
  isMenubarOpen(): Promise<boolean>;
  loadURL(windowName: WindowNames, newUrl?: string): Promise<void>;
  maximize(): Promise<void>;
  /**
   * Create a new window. Handles setup of window configs.
   * See `src/services/windows/handleCreateBasicWindow.ts` for `new BrowserWindow` process.
   * @param returnWindow Return created window or not. Usually false, so this method can be call IPC way (because window will cause `Failed to serialize arguments`).
   */
  open<N extends WindowNames>(windowName: N, meta?: WindowMeta[N], config?: IWindowOpenConfig<N>): Promise<undefined>;
  open<N extends WindowNames>(windowName: N, meta: WindowMeta[N] | undefined, config: IWindowOpenConfig<N> | undefined, returnWindow: true): Promise<BrowserWindow>;
  open<N extends WindowNames>(windowName: N, meta?: WindowMeta[N], config?: IWindowOpenConfig<N>, returnWindow?: boolean): Promise<undefined | BrowserWindow>;
  reload(windowName: WindowNames): Promise<void>;
  requestRestart(): Promise<void>;
  sendToAllWindows: (channel: Channels, ...arguments_: unknown[]) => Promise<void>;
  /** set window or delete window object by passing undefined (will not close it, only remove reference), this should not be called in renderer side */
  set(windowName: WindowNames, win: BrowserWindow | undefined): void;
  setWindowMeta<N extends WindowNames>(windowName: N, meta?: WindowMeta[N]): Promise<void>;
  stopFindInPage(close?: boolean, windowName?: WindowNames): Promise<void>;
  toggleMenubarWindow(): Promise<void>;
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
    toggleMenubarWindow: ProxyPropertyType.Function,
    updateWindowMeta: ProxyPropertyType.Function,
  },
};
