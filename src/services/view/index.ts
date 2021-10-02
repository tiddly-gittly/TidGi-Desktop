import { BrowserView, BrowserWindow, session, ipcMain, WebPreferences } from 'electron';
import { injectable } from 'inversify';

import serviceIdentifier from '@services/serviceIdentifier';
import type { IPreferenceService } from '@services/preferences/interface';
import type { IWorkspaceMetaData, IWorkspaceService } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import type { IWikiService } from '@services/wiki/interface';
import type { IAuthenticationService } from '@services/auth/interface';
import type { IWindowService } from '@services/windows/interface';
import type { IMenuService } from '@services/menu/interface';

import { WindowNames, IBrowserViewMetaData } from '@services/windows/WindowProperties';
import i18n from '@services/libs/i18n';
import getViewBounds from '@services/libs/getViewBounds';
import { IWorkspace } from '@services/workspaces/interface';
import setupViewEventHandlers from './setupViewEventHandlers';
import getFromRenderer from '@services/libs/getFromRenderer';
import { ViewChannel, MetaDataChannel, WindowChannel } from '@/constants/channels';
import { lazyInject } from '@services/container';
import { IViewService } from './interface';
import { getLocalHostUrlWithActualIP, replaceUrlPortWithSettingPort } from '@services/libs/url';
import { logger } from '@services/libs/log';
import { ViewLoadUrlError } from './error';

@injectable()
export class View implements IViewService {
  @lazyInject(serviceIdentifier.Preference) private readonly preferenceService!: IPreferenceService;
  @lazyInject(serviceIdentifier.Window) private readonly windowService!: IWindowService;
  @lazyInject(serviceIdentifier.Workspace) private readonly workspaceService!: IWorkspaceService;
  @lazyInject(serviceIdentifier.MenuService) private readonly menuService!: IMenuService;
  @lazyInject(serviceIdentifier.WorkspaceView) private readonly workspaceViewService!: IWorkspaceViewService;

  constructor() {
    this.initIPCHandlers();
    void this.registerMenu();
  }

  private initIPCHandlers(): void {
    // https://www.electronjs.org/docs/tutorial/online-offline-events
    ipcMain.handle(ViewChannel.onlineStatusChanged, async (_event, online: boolean) => {
      if (online) {
        await this.reloadViewsWebContentsIfDidFailLoad();
      }
    });
  }

  private async registerMenu(): Promise<void> {
    const hasWorkspaces = (await this.workspaceService.countWorkspaces()) > 0;
    const sidebar = await this.preferenceService.get('sidebar');
    const titleBar = await this.preferenceService.get('titleBar');
    await this.menuService.insertMenu('View', [
      {
        label: () => (sidebar ? i18n.t('Preference.HideSideBar') : i18n.t('Preference.ShowSideBar')),
        accelerator: 'CmdOrCtrl+Alt+S',
        click: async () => {
          const sidebarLatest = await this.preferenceService.get('sidebar');
          void this.preferenceService.set('sidebar', !sidebarLatest);
          void this.workspaceViewService.realignActiveWorkspace();
        },
      },
      {
        label: () => (titleBar ? i18n.t('Preference.HideTitleBar') : i18n.t('Preference.ShowTitleBar')),
        accelerator: 'CmdOrCtrl+Alt+T',
        enabled: process.platform === 'darwin',
        visible: process.platform === 'darwin',
        click: async () => {
          const titleBarLatest = await this.preferenceService.get('titleBar');
          void this.preferenceService.set('titleBar', !titleBarLatest);
          void this.workspaceViewService.realignActiveWorkspace();
        },
      },
      // same behavior as BrowserWindow with autoHideMenuBar: true
      // but with addition to readjust BrowserView so it won't cover the menu bar
      {
        label: () => i18n.t('Preference.ToggleMenuBar'),
        visible: false,
        accelerator: 'Alt+M',
        enabled: process.platform === 'win32',
        click: async (_menuItem, browserWindow) => {
          // if back is called in popup window
          // open menu bar in the popup window instead
          if (browserWindow === undefined) return;
          const { isPopup } = await getFromRenderer<IBrowserViewMetaData>(MetaDataChannel.getViewMetaData, browserWindow);
          if (isPopup === true) {
            browserWindow.setMenuBarVisibility(!browserWindow.isMenuBarVisible());
            return;
          }
          const mainWindow = this.windowService.get(WindowNames.main);
          mainWindow?.setMenuBarVisibility(!mainWindow?.isMenuBarVisible());
          void this.workspaceViewService.realignActiveWorkspace();
        },
      },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      {
        label: () => i18n.t('Menu.ActualSize'),
        accelerator: 'CmdOrCtrl+0',
        click: async (_menuItem, browserWindow) => {
          // if item is called in popup window
          // open menu bar in the popup window instead
          if (browserWindow === undefined) return;
          const { isPopup } = await getFromRenderer<IBrowserViewMetaData>(MetaDataChannel.getViewMetaData, browserWindow);
          if (isPopup === true) {
            const contents = browserWindow.webContents;
            contents.zoomFactor = 1;
            return;
          }
          const mainWindow = this.windowService.get(WindowNames.main);
          const webContent = mainWindow?.getBrowserView()?.webContents;
          // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
          if (webContent) {
            webContent.setZoomFactor(1);
          }
        },
        enabled: hasWorkspaces,
      },
      {
        label: () => i18n.t('Menu.ZoomIn'),
        accelerator: 'CmdOrCtrl+=',
        click: async (_menuItem, browserWindow) => {
          // if item is called in popup window
          // open menu bar in the popup window instead
          if (browserWindow === undefined) return;
          const { isPopup } = await getFromRenderer<IBrowserViewMetaData>(MetaDataChannel.getViewMetaData, browserWindow);
          if (isPopup === true) {
            const contents = browserWindow.webContents;
            contents.zoomFactor += 0.1;
            return;
          }
          const mainWindow = this.windowService.get(WindowNames.main);
          const webContent = mainWindow?.getBrowserView()?.webContents;
          // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
          if (webContent) {
            webContent.setZoomFactor(webContent.getZoomFactor() + 0.1);
          }
        },
        enabled: hasWorkspaces,
      },
      {
        label: () => i18n.t('Menu.ZoomOut'),
        accelerator: 'CmdOrCtrl+-',
        click: async (_menuItem, browserWindow) => {
          // if item is called in popup window
          // open menu bar in the popup window instead
          if (browserWindow === undefined) return;
          const { isPopup } = await getFromRenderer<IBrowserViewMetaData>(MetaDataChannel.getViewMetaData, browserWindow);
          if (isPopup === true) {
            const contents = browserWindow.webContents;
            contents.zoomFactor -= 0.1;
            return;
          }
          const mainWindow = this.windowService.get(WindowNames.main);
          const webContent = mainWindow?.getBrowserView()?.webContents;
          // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
          if (webContent) {
            webContent.setZoomFactor(webContent.getZoomFactor() - 0.1);
          }
        },
        enabled: hasWorkspaces,
      },
      { type: 'separator' },
      {
        label: () => i18n.t('ContextMenu.Reload'),
        accelerator: 'CmdOrCtrl+R',
        click: async (_menuItem, browserWindow) => {
          // if item is called in popup window
          // open menu bar in the popup window instead
          if (browserWindow === undefined) return;
          const { isPopup } = await getFromRenderer<IBrowserViewMetaData>(MetaDataChannel.getViewMetaData, browserWindow);
          if (isPopup === true) {
            browserWindow.webContents.reload();
            return;
          }

          const mainWindow = this.windowService.get(WindowNames.main);
          const webContent = mainWindow?.getBrowserView()?.webContents;
          // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
          if (webContent) {
            webContent.reload();
          }
        },
        enabled: hasWorkspaces,
      },
    ]);
  }

  private views: Record<string, BrowserView> = {};
  private shouldMuteAudio = false;
  private shouldPauseNotifications = false;

  public async addView(browserWindow: BrowserWindow, workspace: IWorkspace): Promise<void> {
    if (this.views[workspace.id] !== undefined) {
      return;
    }
    const { rememberLastPageVisited, shareWorkspaceBrowsingData, spellcheck, spellcheckLanguages } = await this.preferenceService.getPreferences();
    // configure session, proxy & ad blocker
    const partitionId = shareWorkspaceBrowsingData ? 'persist:shared' : `persist:${workspace.id}`;
    // prepare configs for start a BrowserView that loads wiki's web content
    // session
    const sessionOfView = session.fromPartition(partitionId);
    // spellchecker
    if (spellcheck && process.platform !== 'darwin') {
      sessionOfView.setSpellCheckerLanguages(spellcheckLanguages);
    }
    const browserViewMetaData: IBrowserViewMetaData = { workspaceID: workspace.id };
    const sharedWebPreferences: WebPreferences = {
      devTools: true,
      spellcheck,
      nativeWindowOpen: true,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      session: sessionOfView,
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      additionalArguments: [
        `${MetaDataChannel.browserViewMetaData}${WindowNames.view}`,
        `${MetaDataChannel.browserViewMetaData}${encodeURIComponent(JSON.stringify(browserViewMetaData))}`,
      ],
    };
    const view = new BrowserView({
      webPreferences: sharedWebPreferences,
    });
    // background needs to explicitly set
    // if not, by default, the background of BrowserView is transparent
    // which would break the CSS of certain websites
    // even with dark mode, all major browsers
    // always use #FFF as default page background
    // https://github.com/atomery/webcatalog/issues/723
    // https://github.com/electron/electron/issues/16212
    view.setBackgroundColor('#fafafa');

    // Handle audio & notification preferences
    if (this.shouldMuteAudio !== undefined) {
      view.webContents.audioMuted = this.shouldMuteAudio;
    }
    this.views[workspace.id] = view;
    if (workspace.active) {
      browserWindow.setBrowserView(view);
      const contentSize = browserWindow.getContentSize();
      view.setBounds(await getViewBounds(contentSize as [number, number]));
      view.setAutoResize({
        width: true,
        height: true,
      });
    }
    const initialUrl = getLocalHostUrlWithActualIP(
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      replaceUrlPortWithSettingPort((rememberLastPageVisited && workspace.lastUrl) || workspace.homeUrl, workspace.port),
    );
    /**
     * Try catch loadUrl, other wise it will throw unhandled promise rejection Error: ERR_CONNECTION_REFUSED (-102) loading 'http://localhost:5212/
     * We will set `didFailLoadErrorMessage`, and `didFailLoadTimes < LOAD_VIEW_MAX_RETRIES` in `setupViewEventHandlers`, it will set didFailLoadErrorMessage, and we throw actuarial error after that
     */
    const loadInitialUrlWithCatch = async (): Promise<void> => {
      try {
        await view.webContents.loadURL(initialUrl);
        const unregisterContextMenu = await this.menuService.initContextMenuForWindowWebContents(view.webContents);
        view.webContents.on('destroyed', () => {
          unregisterContextMenu();
        });
      } catch (error) {
        let didFailLoadTimes = 0;
        try {
          const workspaceMetaData = await this.workspaceService.getMetaData(workspace.id);
          didFailLoadTimes = workspaceMetaData.didFailLoadTimes ?? 0;
        } catch {}
        logger.error(new ViewLoadUrlError(initialUrl, didFailLoadTimes, `${(error as Error).message} ${(error as Error).stack ?? ''}`));
      }
    };
    setupViewEventHandlers(view, browserWindow, {
      shouldPauseNotifications: this.shouldPauseNotifications,
      workspace,
      sharedWebPreferences,
      loadInitialUrlWithCatch,
    });
    await loadInitialUrlWithCatch();
  }

  public getView = (id: string): BrowserView => this.views[id];

  public forEachView(functionToRun: (view: BrowserView, id: string) => void): void {
    Object.keys(this.views).forEach((id) => functionToRun(this.getView(id), id));
  }

  public async setActiveView(browserWindow: BrowserWindow, id: string): Promise<void> {
    // stop find in page when switching workspaces
    const currentView = browserWindow.getBrowserView();
    if (currentView !== null) {
      currentView.webContents.stopFindInPage('clearSelection');
      currentView.webContents.send(WindowChannel.closeFindInPage);
    }
    const workspace = await this.workspaceService.get(id);
    if (this.getView(id) === undefined && workspace !== undefined) {
      return await this.addView(browserWindow, workspace);
    } else {
      const view = this.getView(id);
      browserWindow.setBrowserView(view);
      const contentSize = browserWindow.getContentSize();
      if (typeof (await this.workspaceService.getMetaData(id)).didFailLoadErrorMessage !== 'string') {
        view.setBounds(await getViewBounds(contentSize as [number, number], false, 0, 0)); // hide browserView to show error message
      } else {
        view.setBounds(await getViewBounds(contentSize as [number, number]));
      }
      view.setAutoResize({
        width: true,
        height: true,
      });
      // focus on webview
      // https://github.com/quanglam2807/webcatalog/issues/398
      view.webContents.focus();
      browserWindow.setTitle(view.webContents.getTitle());
    }
  }

  public removeView = (id: string): void => {
    const view = this.getView(id);
    void session.fromPartition(`persist:${id}`).clearStorageData();
    if (view !== undefined) {
      // currently use workaround https://github.com/electron/electron/issues/10096
      // @ts-expect-error Property 'destroy' does not exist on type 'WebContents'.ts(2339)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      view.webContents.destroy();
    }
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.views[id];
  };

  public setViewsAudioPref = (_shouldMuteAudio?: boolean): void => {
    if (_shouldMuteAudio !== undefined) {
      this.shouldMuteAudio = _shouldMuteAudio;
    }
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    void Object.keys(this.views).forEach(async (id) => {
      const view = this.getView(id);
      const workspace = await this.workspaceService.get(id);
      if (view !== undefined && workspace !== undefined) {
        view.webContents.audioMuted = workspace.disableAudio || this.shouldMuteAudio;
      }
    });
  };

  public setViewsNotificationsPref = (_shouldPauseNotifications?: boolean): void => {
    if (_shouldPauseNotifications !== undefined) {
      this.shouldPauseNotifications = _shouldPauseNotifications;
    }
  };

  public hibernateView = (id: string): void => {
    if (this.getView(id) !== undefined) {
      // currently use workaround https://github.com/electron/electron/issues/10096
      // @ts-expect-error Property 'destroy' does not exist on type 'WebContents'.ts(2339)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      this.getView(id).webContents.destroy();
      this.removeView(id);
    }
  };

  public async reloadViewsWebContentsIfDidFailLoad(): Promise<void> {
    const workspaceMetaData: Record<string, Partial<IWorkspaceMetaData>> = await this.workspaceService.getAllMetaData();
    Object.keys(workspaceMetaData).forEach((id) => {
      if (typeof workspaceMetaData[id].didFailLoadErrorMessage !== 'string') {
        return;
      }
      const view = this.getView(id);
      if (view !== undefined) {
        view.webContents.reload();
      }
    });
  }

  public async reloadViewsWebContents(workspaceID?: string): Promise<void> {
    const workspaceMetaData = await this.workspaceService.getAllMetaData();
    Object.keys(workspaceMetaData).forEach((id) => {
      if (workspaceID !== undefined && id !== workspaceID) {
        return;
      }
      const view = this.getView(id);
      if (view !== undefined) {
        view.webContents.reload();
      }
    });
  }

  public async getActiveBrowserView(): Promise<BrowserView | undefined> {
    const workspace = await this.workspaceService.getActiveWorkspace();
    if (workspace !== undefined) {
      return this.getView(workspace.id);
    }
  }

  public async reloadActiveBrowserView(): Promise<void> {
    const view = await this.getActiveBrowserView();
    if (view !== undefined) {
      view.webContents.reload();
    }
  }

  public realignActiveView = async (browserWindow: BrowserWindow, activeId: string, isRetry?: boolean): Promise<void> => {
    const view = browserWindow.getBrowserView();
    if (view?.webContents !== null && view?.webContents !== undefined) {
      const contentSize = browserWindow.getContentSize();
      const didFailLoadErrorMessage = (await this.workspaceService.getMetaData(activeId)).didFailLoadErrorMessage;
      if (typeof didFailLoadErrorMessage === 'string' && didFailLoadErrorMessage.length > 0) {
        view?.setBounds(await getViewBounds(contentSize as [number, number], false, 0, 0)); // hide browserView to show error message
      } else {
        view?.setBounds(await getViewBounds(contentSize as [number, number]));
      }
    } else if (isRetry !== true) {
      // retry one time later if webContent is not ready yet
      setTimeout(() => void this.realignActiveView(browserWindow, activeId, true), 1000);
    }
  };
}
