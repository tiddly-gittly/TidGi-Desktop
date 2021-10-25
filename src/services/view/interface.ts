import { BrowserWindow, BrowserView } from 'electron';

import { ViewChannel } from '@/constants/channels';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { IWorkspace } from '@services/workspaces/interface';
import { WindowNames } from '@services/windows/WindowProperties';

/**
 * BrowserView related things, the BrowserView is the webview like frame that renders our wiki website.
 */
export interface IViewService {
  addView: (windowName: WindowNames, workspace: IWorkspace) => Promise<void>;
  forEachView: (functionToRun: (view: BrowserView, id: string) => void) => void;
  getActiveBrowserView: () => Promise<BrowserView | undefined>;
  getView: (id: string) => BrowserView;
  realignActiveView: (browserWindow: BrowserWindow, activeId: string) => Promise<void>;
  reloadActiveBrowserView: () => Promise<void>;
  reloadViewsWebContents(workspaceID?: string | undefined): Promise<void>;
  reloadViewsWebContentsIfDidFailLoad: () => Promise<void>;
  removeView: (id: string) => void;
  setActiveView: (windowName: WindowNames, id: string) => Promise<void>;
  setViewsAudioPref: (_shouldMuteAudio?: boolean) => void;
  setViewsNotificationsPref: (_shouldPauseNotifications?: boolean) => void;
}
export const ViewServiceIPCDescriptor = {
  channel: ViewChannel.name,
  properties: {
    addView: ProxyPropertyType.Function,
    getView: ProxyPropertyType.Function,
    forEachView: ProxyPropertyType.Function,
    setActiveView: ProxyPropertyType.Function,
    removeView: ProxyPropertyType.Function,
    setViewsAudioPref: ProxyPropertyType.Function,
    setViewsNotificationsPref: ProxyPropertyType.Function,
    reloadViewsWebContentsIfDidFailLoad: ProxyPropertyType.Function,
    reloadViewsWebContents: ProxyPropertyType.Function,
    reloadActiveBrowserView: ProxyPropertyType.Function,
    getActiveBrowserView: ProxyPropertyType.Function,
    realignActiveView: ProxyPropertyType.Function,
  },
};
