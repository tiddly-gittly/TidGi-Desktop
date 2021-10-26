import { BrowserWindow, BrowserView } from 'electron';

import { ViewChannel } from '@/constants/channels';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { IWorkspace } from '@services/workspaces/interface';
import { WindowNames } from '@services/windows/WindowProperties';

/**
 * BrowserView related things, the BrowserView is the webview like frame that renders our wiki website.
 */
export interface IViewService {
  addView: (workspace: IWorkspace, windowName: WindowNames) => Promise<void>;
  forEachView: (functionToRun: (view: BrowserView, workspaceID: string, windowName: WindowNames) => void) => void;
  /**
   * Get active workspace's main window browser view.
   */
  getActiveBrowserView: () => Promise<BrowserView | undefined>;
  getAllViewOfWorkspace: (workspaceID: string) => BrowserView[];
  getView: (workspaceID: string, windowName: WindowNames) => BrowserView | undefined;
  realignActiveView: (browserWindow: BrowserWindow, activeId: string) => Promise<void>;
  reloadActiveBrowserView: () => Promise<void>;
  reloadViewsWebContents(workspaceID?: string | undefined): Promise<void>;
  reloadViewsWebContentsIfDidFailLoad: () => Promise<void>;
  removeAllViewOfWorkspace: (workspaceID: string) => void;
  removeView: (workspaceID: string, windowName: WindowNames) => void;
  setActiveView: (workspaceID: string, windowName: WindowNames) => Promise<void>;
  setViewsAudioPref: (_shouldMuteAudio?: boolean) => void;
  setViewsNotificationsPref: (_shouldPauseNotifications?: boolean) => void;
}
export const ViewServiceIPCDescriptor = {
  channel: ViewChannel.name,
  properties: {
    addView: ProxyPropertyType.Function,
    forEachView: ProxyPropertyType.Function,
    getActiveBrowserView: ProxyPropertyType.Function,
    getAllViewOfWorkspace: ProxyPropertyType.Function,
    getView: ProxyPropertyType.Function,
    realignActiveView: ProxyPropertyType.Function,
    reloadActiveBrowserView: ProxyPropertyType.Function,
    reloadViewsWebContents: ProxyPropertyType.Function,
    reloadViewsWebContentsIfDidFailLoad: ProxyPropertyType.Function,
    removeAllViewOfWorkspace: ProxyPropertyType.Function,
    removeView: ProxyPropertyType.Function,
    setActiveView: ProxyPropertyType.Function,
    setViewsAudioPref: ProxyPropertyType.Function,
    setViewsNotificationsPref: ProxyPropertyType.Function,
  },
};
