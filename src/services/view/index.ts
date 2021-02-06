import { BrowserView, BrowserWindow, WebContents, app, session, dialog, ipcMain, WebPreferences } from 'electron';
import { injectable } from 'inversify';
import getDecorators from 'inversify-inject-decorators';

import serviceIdentifier from '@services/serviceIdentifier';
import type { IPreferenceService } from '@services/preferences/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import type { IWikiService } from '@services/wiki/interface';
import type { IAuthenticationService } from '@services/auth/interface';
import type { IWindowService } from '@services/windows/interface';
import type { IMenuService } from '@services/menu/interface';

import { WindowNames, IBrowserViewMetaData } from '@services/windows/WindowProperties';
import i18n from '@services/libs/i18n';
import getViewBounds from '@services/libs/get-view-bounds';
import { extractDomain } from '@services/libs/url';
import { IWorkspace } from '@services/workspaces/interface';
import setupViewEventHandlers from './setupViewEventHandlers';
import getFromRenderer from '@services/libs/getFromRenderer';
import { ViewChannel, MetaDataChannel, WindowChannel, NotificationChannel } from '@/constants/channels';
import { container } from '@services/container';
import { IViewService } from './interface';

const { lazyInject } = getDecorators(container);

@injectable()
export class View implements IViewService {
  @lazyInject(serviceIdentifier.Preference) private readonly preferenceService!: IPreferenceService;
  @lazyInject(serviceIdentifier.Wiki) private readonly wikiService!: IWikiService;
  @lazyInject(serviceIdentifier.Window) private readonly windowService!: IWindowService;
  @lazyInject(serviceIdentifier.Workspace) private readonly workspaceService!: IWorkspaceService;
  @lazyInject(serviceIdentifier.Authentication) private readonly authService!: IAuthenticationService;
  @lazyInject(serviceIdentifier.MenuService) private readonly menuService!: IMenuService;
  @lazyInject(serviceIdentifier.WorkspaceView) private readonly workspaceViewService!: IWorkspaceViewService;

  constructor() {
    this.initIPCHandlers();
    this.registerMenu();
  }

  private initIPCHandlers(): void {
    // https://www.electronjs.org/docs/tutorial/online-offline-events
    ipcMain.handle(ViewChannel.onlineStatusChanged, (_event, online: boolean) => {
      if (online) {
        this.reloadViewsWebContentsIfDidFailLoad();
      }
    });
    ipcMain.handle('request-reload-views-dark-reader', () => {
      this.reloadViewsDarkReader();
    });
  }

  private registerMenu(): void {
    const hasWorkspaces = this.workspaceService.countWorkspaces() > 0;
    this.menuService.insertMenu('View', [
      {
        label: () => (this.preferenceService.get('sidebar') ? 'Hide Sidebar' : 'Show Sidebar'),
        accelerator: 'CmdOrCtrl+Alt+S',
        click: () => {
          void this.preferenceService.set('sidebar', !this.preferenceService.get('sidebar'));
          void this.workspaceViewService.realignActiveWorkspace();
        },
      },
      {
        label: () => (this.preferenceService.get('navigationBar') ? 'Hide Navigation Bar' : 'Show Navigation Bar'),
        accelerator: 'CmdOrCtrl+Alt+N',
        click: () => {
          void this.preferenceService.set('navigationBar', !this.preferenceService.get('navigationBar'));
          void this.workspaceViewService.realignActiveWorkspace();
        },
      },
      {
        label: () => (this.preferenceService.get('titleBar') ? 'Hide Title Bar' : 'Show Title Bar'),
        accelerator: 'CmdOrCtrl+Alt+T',
        enabled: process.platform === 'darwin',
        visible: process.platform === 'darwin',
        click: () => {
          void this.preferenceService.set('titleBar', !this.preferenceService.get('titleBar'));
          void this.workspaceViewService.realignActiveWorkspace();
        },
      },
      // same behavior as BrowserWindow with autoHideMenuBar: true
      // but with addition to readjust BrowserView so it won't cover the menu bar
      {
        label: 'Toggle Menu Bar',
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
        label: 'Actual Size',
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
        label: 'Zoom In',
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
        label: 'Zoom Out',
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
        label: 'Reload This Page',
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
      { type: 'separator' },
      {
        label: 'Developer Tools',
        submenu: [
          {
            label: 'Open Developer Tools of Active Workspace',
            accelerator: 'CmdOrCtrl+Option+I',
            click: () => this.getActiveBrowserView()?.webContents?.openDevTools(),
            enabled: hasWorkspaces,
          },
        ],
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
    if (workspace.isSubWiki) {
      return;
    }
    const {
      customUserAgent,
      proxyBypassRules,
      proxyPacScript,
      proxyRules,
      proxyType,
      rememberLastPageVisited,
      shareWorkspaceBrowsingData,
      spellcheck,
      spellcheckLanguages,
    } = this.preferenceService.getPreferences();
    // configure session, proxy & ad blocker
    const partitionId = shareWorkspaceBrowsingData ? 'persist:shared' : `persist:${workspace.id}`;
    const userInfo = this.authService.get('authing');
    if (userInfo !== undefined) {
      // user not logined into Github
      void dialog.showMessageBox(browserWindow, {
        title: i18n.t('Dialog.GithubUserInfoNoFound'),
        message: i18n.t('Dialog.GithubUserInfoNoFoundDetail'),
        buttons: ['OK'],
        cancelId: 0,
        defaultId: 0,
      });
    }
    // session
    const sessionOfView = session.fromPartition(partitionId);
    // proxy
    if (proxyType === 'rules') {
      await sessionOfView.setProxy({
        proxyRules,
        proxyBypassRules,
      });
    } else if (proxyType === 'pacScript') {
      await sessionOfView.setProxy({
        pacScript: proxyPacScript,
        proxyBypassRules,
      });
    }
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
      enableRemoteModule: true,
      session: sessionOfView,
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      additionalArguments: [WindowNames.view, JSON.stringify(browserViewMetaData)],
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
    view.setBackgroundColor('#FFF');

    /**
     * Side effect, update contents.userAgent
     * @param _contents webContent to set userAgent
     * @param _url
     */
    let adjustUserAgentByUrl = (_contents: WebContents, _url: string): boolean => false;
    if (typeof customUserAgent === 'string' && customUserAgent.length > 0) {
      view.webContents.userAgent = customUserAgent;
    } else {
      // Hide Electron from UA to improve compatibility
      // https://github.com/quanglam2807/webcatalog/issues/182
      const uaString = view.webContents.userAgent;
      const commonUaString = uaString
        // Fix WhatsApp requires Google Chrome 49+ bug
        .replace(` ${app.name}/${app.getVersion()}`, '')
        // Hide Electron from UA to improve compatibility
        // https://github.com/quanglam2807/webcatalog/issues/182
        .replace(` Electron/${process.versions.electron}`, '');
      view.webContents.userAgent = commonUaString;
      // fix Google prevents signing in because of security concerns
      // https://github.com/quanglam2807/webcatalog/issues/455
      // https://github.com/meetfranz/franz/issues/1720#issuecomment-566460763
      const fakedEdgeUaString = `${commonUaString} Edge/18.18875`;
      adjustUserAgentByUrl = (contents: WebContents, url: string): boolean => {
        if (typeof customUserAgent === 'string' && customUserAgent.length > 0) {
          return false;
        }
        const navigatedDomain = extractDomain(url);
        const currentUaString = contents.userAgent;
        if (navigatedDomain === 'accounts.google.com') {
          if (currentUaString !== fakedEdgeUaString) {
            contents.userAgent = fakedEdgeUaString;
            return true;
          }
        } else if (currentUaString !== commonUaString) {
          contents.userAgent = commonUaString;
          return true;
        }
        return false;
      };
    }
    // Handle audio & notification preferences
    if (this.shouldMuteAudio !== undefined) {
      view.webContents.audioMuted = this.shouldMuteAudio;
    }
    this.views[workspace.id] = view;
    if (workspace.active) {
      browserWindow.setBrowserView(view);
      const contentSize = browserWindow.getContentSize();
      view.setBounds(getViewBounds(contentSize as [number, number]));
      view.setAutoResize({
        width: true,
        height: true,
      });
    }
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const initialUrl = (rememberLastPageVisited && workspace.lastUrl) || workspace.homeUrl;
    adjustUserAgentByUrl(view.webContents, initialUrl);
    setupViewEventHandlers(
      view,
      browserWindow,
      { shouldPauseNotifications: this.shouldPauseNotifications, workspace, sharedWebPreferences },
      { adjustUserAgentByUrl },
    );
    // start wiki on startup, or on sub-wiki creation
    await this.wikiService.wikiStartup(workspace);
    void view.webContents.loadURL(initialUrl);
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
      // FIXME: is this useful?
      // browserWindow.send('close-find-in-page');
    }
    const workspace = this.workspaceService.get(id);
    if (this.getView(id) === undefined && workspace !== undefined) {
      return await this.addView(browserWindow, workspace);
    } else {
      const view = this.getView(id);
      browserWindow.setBrowserView(view);
      const contentSize = browserWindow.getContentSize();
      if (typeof this.workspaceService.getMetaData(id).didFailLoadErrorMessage !== 'string') {
        view.setBounds(getViewBounds(contentSize as [number, number], false, 0, 0)); // hide browserView to show error message
      } else {
        view.setBounds(getViewBounds(contentSize as [number, number]));
      }
      view.setAutoResize({
        width: true,
        height: true,
      });
      // focus on webview
      // https://github.com/quanglam2807/webcatalog/issues/398
      view.webContents.focus();
      this.windowService.sendToAllWindows(WindowChannel.updateAddress, view.webContents.getURL(), false);
      this.windowService.sendToAllWindows(WindowChannel.updateTitle, view.webContents.getTitle());
      browserWindow.setTitle(view.webContents.getTitle());
    }
  }

  public removeView = (id: string): void => {
    const view = this.getView(id);
    void session.fromPartition(`persist:${id}`).clearStorageData();
    // FIXME: Property 'destroy' does not exist on type 'BrowserView'.ts(2339) , might related to https://github.com/electron/electron/pull/25411 which previously cause crush when I quit the app
    // maybe use https://github.com/electron/electron/issues/10096
    // if (view !== undefined) {
    //   view.destroy();
    // }
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.views[id];
  };

  public setViewsAudioPref = (_shouldMuteAudio?: boolean): void => {
    if (_shouldMuteAudio !== undefined) {
      this.shouldMuteAudio = _shouldMuteAudio;
    }
    Object.keys(this.views).forEach((id) => {
      const view = this.getView(id);
      const workspace = this.workspaceService.get(id);
      if (view !== undefined && workspace !== undefined) {
        view.webContents.audioMuted = workspace.disableAudio || this.shouldMuteAudio;
      }
    });
  };

  public setViewsNotificationsPref = (_shouldPauseNotifications?: boolean): void => {
    if (_shouldPauseNotifications !== undefined) {
      this.shouldPauseNotifications = _shouldPauseNotifications;
    }
    Object.keys(this.views).forEach((id) => {
      const view = this.getView(id);
      const workspace = this.workspaceService.get(id);
      if (view !== undefined && workspace !== undefined) {
        view.webContents.send(NotificationChannel.shouldPauseNotificationsChanged, Boolean(workspace.disableNotifications || this.shouldPauseNotifications));
      }
    });
  };

  public hibernateView = (id: string): void => {
    if (this.getView(id) !== undefined) {
      // FIXME: remove view, now using workaround in https://github.com/electron/electron/issues/10096#issuecomment-373063642
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      (this.getView(id) as any).destroy();
      this.removeView(id);
    }
  };

  public reloadViewsDarkReader(): void {
    Object.keys(this.views).forEach((id) => {
      const view = this.getView(id);
      if (view !== undefined) {
        view.webContents.send('reload-dark-reader');
      }
    });
  }

  public reloadViewsWebContentsIfDidFailLoad(): void {
    const workspaceMetaData = this.workspaceService.getAllMetaData();
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

  public reloadViewsWebContents(): void {
    const workspaceMetaData = this.workspaceService.getAllMetaData();
    Object.keys(workspaceMetaData).forEach((id) => {
      const view = this.getView(id);
      if (view !== undefined) {
        view.webContents.reload();
      }
    });
  }

  public getActiveBrowserView(): BrowserView | undefined {
    const workspace = this.workspaceService.getActiveWorkspace();
    if (workspace !== undefined) {
      return this.getView(workspace.id);
    }
  }

  public realignActiveView = (browserWindow: BrowserWindow, activeId: string): void => {
    const view = browserWindow.getBrowserView();
    if (view?.webContents !== null) {
      const contentSize = browserWindow.getContentSize();
      if (typeof this.workspaceService.getMetaData(activeId).didFailLoadErrorMessage === 'string') {
        view?.setBounds(getViewBounds(contentSize as [number, number], false, 0, 0)); // hide browserView to show error message
      } else {
        view?.setBounds(getViewBounds(contentSize as [number, number]));
      }
    }
  };
}
