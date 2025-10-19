import type { BrowserWindow, WebContentsView, WebPreferences } from 'electron';
import { ProxyPropertyType } from 'electron-ipc-cat/common';

import { ViewChannel } from '@/constants/channels';
import type { WindowNames } from '@services/windows/WindowProperties';
import type { IWorkspace } from '@services/workspaces/interface';

export type INewWindowAction =
  | {
    action: 'deny';
  }
  | {
    action: 'allow';
    overrideBrowserWindowOptions?: Electron.BrowserWindowConstructorOptions | undefined;
  };

/**
 * WebContentsView related things, the WebContentsView is the webview like frame that renders our wiki website.
 */
export interface IViewService {
  initialize(): Promise<void>;
  /**
   * Add a new browserView and load the url
   */
  addView: (workspace: IWorkspace, windowName: WindowNames) => Promise<void>;
  /**
   * Check if we can skip the addView() for a workspace
   */
  alreadyHaveView(workspace: IWorkspace): Promise<boolean>;
  createViewAddToWindow(workspace: IWorkspace, browserWindow: BrowserWindow, sharedWebPreferences: WebPreferences, windowName: WindowNames): Promise<WebContentsView>;
  forEachView: (functionToRun: (view: WebContentsView, workspaceID: string, windowName: WindowNames) => void) => void;
  /**
   * If tidgi mini window is open, we get tidgi mini window browser view, else we get main window browser view
   */
  getActiveBrowserView: () => Promise<WebContentsView | undefined>;
  /**
   * Get active workspace's main window and tidgi mini window browser view.
   */
  getActiveBrowserViews: () => Promise<Array<WebContentsView | undefined>>;
  getLoadedViewEnsure(workspaceID: string, windowName: WindowNames): Promise<WebContentsView>;
  getSharedWebPreferences(workspace: IWorkspace): Promise<WebPreferences>;
  getView: (workspaceID: string, windowName: WindowNames) => WebContentsView | undefined;
  getViewCount(): Promise<number>;
  getViewCurrentUrl(workspaceID?: string): Promise<string | undefined>;
  /**
   * Move the view to the side to hide it.
   * This won't destroy view or remove it from the window, but if you add another view to the window now, this will be replaced safely. To completely remove the view, use `removeView`.
   */
  hideView(browserWindow: BrowserWindow, windowName: WindowNames, idToDeactivate: string): Promise<void>;
  initializeWorkspaceViewHandlersAndLoad(
    browserWindow: BrowserWindow,
    view: WebContentsView,
    configs: { sharedWebPreferences: WebPreferences; uri?: string; windowName: WindowNames; workspace: IWorkspace },
  ): Promise<void>;
  /**
   * Try catch loadUrl, other wise it will throw unhandled promise rejection Error: ERR_CONNECTION_REFUSED (-102) loading 'http://localhost:5212/
   * We will set `didFailLoadErrorMessage`, it will set didFailLoadErrorMessage, and we throw actuarial error after that
   */
  loadUrlForView(workspace: IWorkspace, view: WebContentsView): Promise<void>;
  realignActiveView(browserWindow: BrowserWindow, activeId: string, windowName: WindowNames, isRetry?: boolean): Promise<void>;
  reloadActiveBrowserView: () => Promise<void>;
  reloadViewsWebContents(workspaceID?: string): Promise<void>;
  reloadViewsWebContentsIfDidFailLoad: () => Promise<void>;
  /**
   * @param workspaceID
   * @param permanent Do you still need views later? If this is true, view will be destroyed. If this is false, view will be hidden by remove them from the window, but can still be fast add back later..
   */
  removeAllViewOfWorkspace(workspaceID: string, permanent?: boolean): void;
  /**
   * Each window can only have one browser view, we remove current one, and add another one later. But don't need to destroy current one, we can add it back when user switch back.
   * This won't destroy view or remove it from `views` array, just hide it, but this is more complete than `hideView`.
   */
  removeView(workspaceID: string, windowName: WindowNames): void;
  /**
   * Bring an already created view to the front. If it happened to not created, will call `addView()` to create one.
   * @param workspaceID id, can only be main workspace id, because only main workspace will have view created.
   * @param windowName you can control main window or tidgi mini window to have this view.
   * @returns
   */
  setActiveView: (workspaceID: string, windowName: WindowNames) => Promise<void>;
  setActiveViewForAllBrowserViews(workspaceID: string): Promise<void>;
  setViewsAudioPref: (_shouldMuteAudio?: boolean) => void;
  setViewsNotificationsPref: (_shouldPauseNotifications?: boolean) => void;
}
export const ViewServiceIPCDescriptor = {
  channel: ViewChannel.name,
  properties: {
    addView: ProxyPropertyType.Function,
    alreadyHaveView: ProxyPropertyType.Function,
    forEachView: ProxyPropertyType.Function,
    getActiveBrowserView: ProxyPropertyType.Function,
    getSharedWebPreferences: ProxyPropertyType.Function,
    getView: ProxyPropertyType.Function,
    getViewCount: ProxyPropertyType.Function,
    getViewCurrentUrl: ProxyPropertyType.Function,
    hideView: ProxyPropertyType.Function,
    initializeWorkspaceViewHandlersAndLoad: ProxyPropertyType.Function,
    realignActiveView: ProxyPropertyType.Function,
    reloadActiveBrowserView: ProxyPropertyType.Function,
    reloadViewsWebContents: ProxyPropertyType.Function,
    reloadViewsWebContentsIfDidFailLoad: ProxyPropertyType.Function,
    removeAllViewOfWorkspace: ProxyPropertyType.Function,
    removeView: ProxyPropertyType.Function,
    setActiveView: ProxyPropertyType.Function,
    setActiveViewForAllBrowserViews: ProxyPropertyType.Function,
    setViewsAudioPref: ProxyPropertyType.Function,
    setViewsNotificationsPref: ProxyPropertyType.Function,
  },
};
