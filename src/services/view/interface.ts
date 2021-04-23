import { BrowserWindow, BrowserView } from 'electron';

import { ViewChannel } from '@/constants/channels';
import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { IWorkspace } from '@services/workspaces/interface';

/**
 * BrowserView related things, the BrowserView is the webview like frame that renders our wiki website.
 */
export interface IViewService {
  addView: (browserWindow: BrowserWindow, workspace: IWorkspace) => Promise<void>;
  getView: (id: string) => BrowserView;
  forEachView: (functionToRun: (view: BrowserView, id: string) => void) => void;
  setActiveView: (browserWindow: BrowserWindow, id: string) => Promise<void>;
  removeView: (id: string) => void;
  setViewsAudioPref: (_shouldMuteAudio?: boolean) => void;
  setViewsNotificationsPref: (_shouldPauseNotifications?: boolean) => void;
  hibernateView: (id: string) => void;
  reloadViewsWebContentsIfDidFailLoad: () => void;
  reloadViewsWebContents: () => void;
  getActiveBrowserView: () => BrowserView | undefined;
  realignActiveView: (browserWindow: BrowserWindow, activeId: string) => Promise<void>;
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
    hibernateView: ProxyPropertyType.Function,
    reloadViewsWebContentsIfDidFailLoad: ProxyPropertyType.Function,
    reloadViewsWebContents: ProxyPropertyType.Function,
    getActiveBrowserView: ProxyPropertyType.Function,
    realignActiveView: ProxyPropertyType.Function,
  },
};
