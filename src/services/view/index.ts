/* eslint-disable n/no-callback-literal */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/consistent-type-assertions */
import { BrowserView, BrowserWindow, session, ipcMain, WebPreferences } from 'electron';
import { injectable } from 'inversify';

import serviceIdentifier from '@services/serviceIdentifier';
import type { IPreferenceService } from '@services/preferences/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import type { IWindowService } from '@services/windows/interface';
import type { IMenuService } from '@services/menu/interface';

import { WindowNames, IBrowserViewMetaData } from '@services/windows/WindowProperties';
import { i18n } from '@services/libs/i18n';
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
import { isMac, isWin } from '@/helpers/system';

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
    ipcMain.handle(ViewChannel.onlineStatusChanged, async (_event, online: boolean) => {
      // try to fix when wifi status changed when wiki startup, causing wiki not loaded properly.
      if (online) {
        await this.reloadViewsWebContentsIfDidFailLoad();
      }
      /**
       * fixLocalIpNotAccessible. try to fix when network changed cause old local ip not accessible, need to generate a new ip and reload the view
       * Do this for all workspace and all views...
       */
      await this.workspaceViewService.restartAllWorkspaceView();
    });
  }

  private async registerMenu(): Promise<void> {
    const hasWorkspaces = (await this.workspaceService.countWorkspaces()) > 0;
    const sidebar = await this.preferenceService.get('sidebar');
    const titleBar = await this.preferenceService.get('titleBar');
    // electron type forget that click can be async function
    /* eslint-disable @typescript-eslint/no-misused-promises */
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
        enabled: isMac,
        visible: isMac,
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
        enabled: isWin,
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
    /* eslint-enable @typescript-eslint/no-misused-promises */
  }

  /**
   * Record<workspaceID, Record<windowName, BrowserView>>
   *
   * Each workspace can have several windows to render its view (main window and menu bar)
   */
  private views: Record<string, Record<WindowNames, BrowserView> | undefined> = {};
  public async getViewCount(): Promise<number> {
    // eslint-disable-next-line @typescript-eslint/return-await
    return await Promise.resolve(Object.keys(this.views).length);
  }

  public getView = (workspaceID: string, windowName: WindowNames): BrowserView | undefined => this.views[workspaceID]?.[windowName];
  public getAllViewOfWorkspace = (workspaceID: string): BrowserView[] => Object.values(this.views[workspaceID] ?? {});
  public setView = (workspaceID: string, windowName: WindowNames, newView: BrowserView): void => {
    const workspaceOwnedViews = this.views[workspaceID];
    if (workspaceOwnedViews === undefined) {
      this.views[workspaceID] = { [windowName]: newView } as Record<WindowNames, BrowserView>;
    } else {
      workspaceOwnedViews[windowName] = newView;
    }
  };

  private shouldMuteAudio = false;
  private shouldPauseNotifications = false;

  public async addViewForAllBrowserViews(workspace: IWorkspace): Promise<void> {
    await Promise.all([
      this.addView(workspace, WindowNames.main),
      this.preferenceService.get('attachToMenubar').then((attachToMenubar) => {
        attachToMenubar && this.addView(workspace, WindowNames.menuBar);
      }),
    ]);
  }

  public async alreadyHaveView(workspace: IWorkspace): Promise<boolean> {
    const checkNotExist = (workspaceToCheck: IWorkspace, windowName: WindowNames): boolean => {
      const existedView = this.getView(workspaceToCheck.id, windowName);
      return existedView === undefined;
    };
    const checkNotExistResult = await Promise.all([
      checkNotExist(workspace, WindowNames.main),
      this.preferenceService.get('attachToMenubar').then((attachToMenubar) => attachToMenubar && checkNotExist(workspace, WindowNames.menuBar)),
    ]);
    return checkNotExistResult.every((result) => !result);
  }

  public async addView(workspace: IWorkspace, windowName: WindowNames): Promise<void> {
    // we assume each window will only have one view, so get view by window name + workspace
    const existedView = this.getView(workspace.id, windowName);
    const browserWindow = this.windowService.get(windowName);
    if (existedView !== undefined) {
      logger.warn(`BrowserViewService.addView: ${workspace.id} 's view already exists`);
      return;
    }
    if (browserWindow === undefined) {
      logger.warn(`BrowserViewService.addView: ${workspace.id} 's browser window is not ready`);
      return;
    }
    // create a new BrowserView
    const { shareWorkspaceBrowsingData, spellcheck, spellcheckLanguages } = await this.preferenceService.getPreferences();
    // configure session, proxy & ad blocker
    const partitionId = shareWorkspaceBrowsingData ? 'persist:shared' : `persist:${workspace.id}`;
    // prepare configs for start a BrowserView that loads wiki's web content
    // session
    const sessionOfView = session.fromPartition(partitionId);
    // spellchecker
    if (spellcheck && !isMac) {
      sessionOfView.setSpellCheckerLanguages(spellcheckLanguages);
    }
    // pretending we are sending request from same origin using a Chrome browser. So image site won't block our request.
    sessionOfView.webRequest.onBeforeSendHeaders((details, callback) => {
      const url = new URL(details.url);
      details.requestHeaders.Origin = url.origin;
      details.requestHeaders.Referer = details.url;
      details.requestHeaders['User-Agent'] =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36';
      callback({ cancel: false, requestHeaders: details.requestHeaders });
    });
    const browserViewMetaData: IBrowserViewMetaData = { workspaceID: workspace.id };
    const sharedWebPreferences: WebPreferences = {
      devTools: true,
      spellcheck,
      nodeIntegration: false,
      contextIsolation: true,
      // allow loading pictures from the localhost network, you may want to setup img host services in your local network, set this to true will cause CORS
      // TODO: make this a setting in security preference
      webSecurity: false,
      allowRunningInsecureContent: true,
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
    this.setView(workspace.id, windowName, view);
    if (workspace.active) {
      browserWindow.setBrowserView(view);
      const contentSize = browserWindow.getContentSize();
      view.setBounds(await getViewBounds(contentSize as [number, number]));
      view.setAutoResize({
        width: true,
        height: true,
      });
    }
    setupViewEventHandlers(view, browserWindow, {
      shouldPauseNotifications: this.shouldPauseNotifications,
      workspace,
      sharedWebPreferences,
      loadInitialUrlWithCatch: async () => await this.loadUrlForView(workspace, view, windowName),
    });
    await this.loadUrlForView(workspace, view, windowName);
  }

  public async loadUrlForView(workspace: IWorkspace, view: BrowserView, windowName: WindowNames): Promise<void> {
    const { rememberLastPageVisited } = await this.preferenceService.getPreferences();
    // fix some case that local ip can't be load
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const urlToReplace = rememberLastPageVisited ? workspace.lastUrl ?? workspace.homeUrl : workspace.homeUrl;
    const portReplacedUrl = replaceUrlPortWithSettingPort(urlToReplace, workspace.port);
    const hostReplacedUrl = await getLocalHostUrlWithActualIP(portReplacedUrl);
    logger.debug(`Load initialUrl: ${hostReplacedUrl} for windowName ${windowName} for workspace ${workspace.name}`, {
      urlToReplace,
      replacedUrl: portReplacedUrl,
    });
    try {
      logger.debug(
        `loadInitialUrlWithCatch(): view.webContents: ${String(view.webContents)} ${hostReplacedUrl} for windowName ${windowName} for workspace ${
          workspace.name
        }`,
        { stack: new Error('debug error, not a real error').stack },
      );
      if (await this.workspaceService.workspaceDidFailLoad(workspace.id)) {
        return;
      }
      // will set again in view.webContents.on('did-start-loading'), but that one sometimes is too late to block services that wait for `isLoading`
      await this.workspaceService.updateMetaData(workspace.id, {
        // eslint-disable-next-line unicorn/no-null
        didFailLoadErrorMessage: null,
        isLoading: true,
      });
      await view.webContents.loadURL(hostReplacedUrl);
      logger.debug('loadInitialUrlWithCatch() await loadURL() done');
      const unregisterContextMenu = await this.menuService.initContextMenuForWindowWebContents(view.webContents);
      view.webContents.on('destroyed', () => {
        unregisterContextMenu();
      });
    } catch (error) {
      logger.warn(new ViewLoadUrlError(hostReplacedUrl, `${(error as Error).message} ${(error as Error).stack ?? ''}`));
    }
  }

  public forEachView(functionToRun: (view: BrowserView, workspaceID: string, windowName: WindowNames) => unknown): void {
    Object.keys(this.views).forEach((id) => {
      const workspaceOwnedViews = this.views[id];
      if (workspaceOwnedViews !== undefined) {
        (Object.keys(workspaceOwnedViews) as WindowNames[]).forEach((name) => {
          const view = this.getView(id, name);
          if (view !== undefined) {
            functionToRun(view, id, name);
          }
        });
      }
    });
  }

  public async setActiveViewForAllBrowserViews(workspaceID: string): Promise<void> {
    await Promise.all([
      this.setActiveView(workspaceID, WindowNames.main),
      this.preferenceService.get('attachToMenubar').then((attachToMenubar) => {
        attachToMenubar && this.setActiveView(workspaceID, WindowNames.menuBar);
      }),
    ]);
  }

  public async setActiveView(workspaceID: string, windowName: WindowNames): Promise<void> {
    const browserWindow = this.windowService.get(windowName);
    logger.debug(`setActiveView(): ${workspaceID} ${windowName} browserWindow: ${String(browserWindow !== undefined)}`);
    if (browserWindow === undefined) {
      return;
    }
    const workspace = await this.workspaceService.get(workspaceID);
    const view = this.getView(workspaceID, windowName);
    logger.debug(`setActiveView(): view: ${String(view !== undefined && view !== null)} workspace: ${String(workspace !== undefined)}`);
    if (view === undefined || view === null) {
      if (workspace === undefined) {
        logger.error(`workspace is undefined when setActiveView(${windowName}, ${workspaceID})`);
      } else {
        return await this.addView(workspace, windowName);
      }
    } else {
      browserWindow.setBrowserView(view);
      const contentSize = browserWindow.getContentSize();
      if (workspace !== undefined && (await this.workspaceService.workspaceDidFailLoad(workspace.id))) {
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

  public removeView = (workspaceID: string, windowName: WindowNames): void => {
    logger.debug(`Remove view for workspaceID ${workspaceID} via ${new Error('stack').stack ?? 'no stack'}`);
    const view = this.getView(workspaceID, windowName);
    const browserWindow = this.windowService.get(windowName);
    if (view !== undefined && browserWindow !== undefined) {
      void session.fromPartition(`persist:${workspaceID}`).clearStorageData();
      // stop find in page when switching workspaces
      view.webContents.stopFindInPage('clearSelection');
      view.webContents.send(WindowChannel.closeFindInPage);
      // currently use workaround https://github.com/electron/electron/issues/10096
      // eslint-disable-next-line unicorn/no-null
      browserWindow.setBrowserView(null);
      // @ts-expect-error Property 'destroy' does not exist on type 'WebContents'.ts(2339)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      view.webContents.destroy();
    }
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.views[workspaceID]![windowName];
  };

  public removeAllViewOfWorkspace = (workspaceID: string): void => {
    const views = this.views[workspaceID];
    if (views !== undefined) {
      Object.keys(views).forEach((name) => {
        this.removeView(workspaceID, name as WindowNames);
      });
    }
    this.views[workspaceID] = undefined;
  };

  public setViewsAudioPref = (_shouldMuteAudio?: boolean): void => {
    if (_shouldMuteAudio !== undefined) {
      this.shouldMuteAudio = _shouldMuteAudio;
    }

    this.forEachView(async (view, id, name) => {
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

  public async reloadViewsWebContentsIfDidFailLoad(): Promise<void> {
    this.forEachView(async (view, id, _name) => {
      if (await this.workspaceService.workspaceDidFailLoad(id)) {
        view.webContents.reload();
      }
    });
  }

  public async reloadViewsWebContents(workspaceID?: string): Promise<void> {
    const rememberLastPageVisited = await this.preferenceService.get('rememberLastPageVisited');
    this.forEachView(async (view, id, _name) => {
      /** if workspaceID not passed means reload all views. */
      if (workspaceID === undefined || id === workspaceID) {
        view.webContents.reload();
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (workspaceID !== undefined) {
          const workspace = await this.workspaceService.get(workspaceID);
          // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
          if (rememberLastPageVisited && workspace?.lastUrl) {
            await view.webContents.loadURL(workspace.lastUrl);
          }
        }
      }
    });
  }

  public async getViewCurrentUrl(workspaceID?: string): Promise<string | undefined> {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!workspaceID) {
      return;
    }
    const view = this.getView(workspaceID, WindowNames.main);
    if (view === undefined) {
      return;
    }
    return view.webContents.getURL();
  }

  public async getActiveBrowserView(): Promise<BrowserView | undefined> {
    const workspace = await this.workspaceService.getActiveWorkspace();
    const isMenubarOpen = await this.windowService.isMenubarOpen();
    if (workspace !== undefined) {
      if (isMenubarOpen) {
        return this.getView(workspace.id, WindowNames.menuBar);
      } else {
        return this.getView(workspace.id, WindowNames.main);
      }
    }
  }

  public async getActiveBrowserViews(): Promise<Array<BrowserView | undefined>> {
    const workspace = await this.workspaceService.getActiveWorkspace();
    if (workspace !== undefined) {
      return [this.getView(workspace.id, WindowNames.main), this.getView(workspace.id, WindowNames.menuBar)];
    }
    return [];
  }

  public async reloadActiveBrowserView(): Promise<void> {
    const views = await this.getActiveBrowserViews();
    views.forEach((view) => {
      if (view !== undefined) {
        view.webContents.reload();
      }
    });
  }

  public realignActiveView = async (browserWindow: BrowserWindow, activeId: string, isRetry?: boolean): Promise<void> => {
    const view = browserWindow.getBrowserView();
    if (view?.webContents !== null && view?.webContents !== undefined) {
      const contentSize = browserWindow.getContentSize();
      if (await this.workspaceService.workspaceDidFailLoad(activeId)) {
        logger.warn(`realignActiveView() hide because didFailLoad`);
        view?.setBounds(await getViewBounds(contentSize as [number, number], false, 0, 0)); // hide browserView to show error message
      } else {
        view?.setBounds(await getViewBounds(contentSize as [number, number]));
      }
    } else if (isRetry === true) {
      logger.error(
        `realignActiveView() ${activeId} failed view?.webContents is ${String(view?.webContents)} and isRetry is ${String(isRetry)} stack: ${
          new Error('stack').stack ?? 'no stack'
        }`,
      );
    } else {
      // retry one time later if webContent is not ready yet
      setTimeout(() => void this.realignActiveView(browserWindow, activeId, true), 1000);
    }
  };
}
