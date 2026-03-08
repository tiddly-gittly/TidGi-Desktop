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
 * Minimal mechanism-layer API for managing WebContentsView instances.
 * All policy decisions (which workspace to show, when to hide/restore, mini-window routing)
 * belong in WorkspaceViewService or other orchestrator services.
 */
export interface IViewService {
  initialize(): Promise<void>;

  // ── Registry ──────────────────────────────────────────────
  getView(workspaceID: string, windowName: WindowNames): WebContentsView | undefined;
  getViewCount(): Promise<number>;
  forEachView(function_: (view: WebContentsView, workspaceID: string, windowName: WindowNames) => void): void;
  /** Wait until a view for the given (workspace, window) pair exists and return it. */
  getLoadedViewEnsure(workspaceID: string, windowName: WindowNames): Promise<WebContentsView>;

  // ── Lifecycle ─────────────────────────────────────────────
  /** Create a WebContentsView, add it to the target BrowserWindow, and load its URL. */
  addView(workspace: IWorkspace, windowName: WindowNames): Promise<void>;
  /** True if the workspace already has views for all required windows. */
  alreadyHaveView(workspace: IWorkspace): Promise<boolean>;
  /** Low-level: build WebPreferences for a workspace (session, preload, metadata). */
  getSharedWebPreferences(workspace: IWorkspace): Promise<WebPreferences>;
  /** Low-level: create the WebContentsView, attach it to the window, wire resize listener. */
  createViewAndAttach(workspace: IWorkspace, browserWindow: BrowserWindow, sharedWebPreferences: WebPreferences, windowName: WindowNames): Promise<WebContentsView>;
  /** Low-level: setup event handlers + load initial URL. */
  initializeViewHandlersAndLoad(
    browserWindow: BrowserWindow,
    view: WebContentsView,
    configs: { sharedWebPreferences: WebPreferences; uri?: string; windowName: WindowNames; workspace: IWorkspace },
  ): Promise<void>;
  /** Load (or reload) a URL into an existing view. */
  loadUrlForView(workspace: IWorkspace, view: WebContentsView, uri?: string): Promise<void>;
  /** Reload a specific workspace's views, or all views if no id given. */
  reloadViewsWebContents(workspaceID?: string): Promise<void>;
  /** Reload views that previously failed to load. */
  reloadViewsWebContentsIfDidFailLoad(): Promise<void>;

  // ── Visibility (offscreen-bounds only) ────────────────────
  /**
   * Show a view at default layout bounds (respecting sidebar/findInPage prefs).
   * Ensures the view is a child of the window, sets proper bounds, and focuses it.
   */
  showView(workspaceID: string, windowName: WindowNames): Promise<void>;
  /**
   * Hide a view by moving it offscreen. Does NOT detach or destroy — fast restore guaranteed.
   */
  hideView(workspaceID: string, windowName: WindowNames): Promise<void>;
  /**
   * Set arbitrary bounds on a view (used by Agent split-view embed).
   * Pass `undefined` to hide (offscreen).
   */
  setViewBounds(workspaceID: string, windowName: WindowNames, bounds?: { x: number; y: number; width: number; height: number }): Promise<void>;
  /**
   * Recalculate and apply default bounds for a view (e.g. after sidebar toggle or window resize).
   */
  realignView(workspaceID: string, windowName: WindowNames): Promise<void>;

  // ── Destruction ───────────────────────────────────────────
  /**
   * Hide all views of a workspace (offscreen). Registry entries and webContents stay alive for fast restore.
   */
  hideAllViewsOfWorkspace(workspaceID: string): void;
  /**
   * Permanently destroy all views of a workspace: close webContents, unbind listeners, remove from registry.
   */
  destroyAllViewsOfWorkspace(workspaceID: string): void;

  // ── Convenience / Query ───────────────────────────────────
  getViewCurrentUrl(workspaceID: string, windowName: WindowNames): Promise<string | undefined>;
  setViewsAudioPref(shouldMuteAudio?: boolean): void;
  setViewsNotificationsPref(shouldPauseNotifications?: boolean): void;
}

export const ViewServiceIPCDescriptor = {
  channel: ViewChannel.name,
  properties: {
    addView: ProxyPropertyType.Function,
    alreadyHaveView: ProxyPropertyType.Function,
    forEachView: ProxyPropertyType.Function,
    getView: ProxyPropertyType.Function,
    getViewCount: ProxyPropertyType.Function,
    getViewCurrentUrl: ProxyPropertyType.Function,
    showView: ProxyPropertyType.Function,
    hideView: ProxyPropertyType.Function,
    setViewBounds: ProxyPropertyType.Function,
    realignView: ProxyPropertyType.Function,
    hideAllViewsOfWorkspace: ProxyPropertyType.Function,
    destroyAllViewsOfWorkspace: ProxyPropertyType.Function,
    reloadViewsWebContents: ProxyPropertyType.Function,
    reloadViewsWebContentsIfDidFailLoad: ProxyPropertyType.Function,
    setViewsAudioPref: ProxyPropertyType.Function,
    setViewsNotificationsPref: ProxyPropertyType.Function,
  },
};
