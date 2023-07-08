/* eslint-disable n/no-callback-literal */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/consistent-type-assertions */
import { BrowserView, BrowserWindow, ipcMain, session, WebPreferences } from 'electron';
import { injectable } from 'inversify';

import type { IMenuService } from '@services/menu/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWindowService } from '@services/windows/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';

import { MetaDataChannel, ViewChannel, WindowChannel } from '@/constants/channels';
import { getDefaultTidGiUrl } from '@/constants/urls';
import { isMac, isWin } from '@/helpers/system';
import { IAuthenticationService } from '@services/auth/interface';
import { lazyInject } from '@services/container';
import getFromRenderer from '@services/libs/getFromRenderer';
import getViewBounds from '@services/libs/getViewBounds';
import { i18n } from '@services/libs/i18n';
import { logger } from '@services/libs/log';
import { INativeService } from '@services/native/interface';
import { IBrowserViewMetaData, WindowNames } from '@services/windows/WindowProperties';
import { IWorkspace } from '@services/workspaces/interface';
import { setViewEventName } from './constants';
import { ViewLoadUrlError } from './error';
import { IViewService } from './interface';
import { setupIpcServerRoutesHandlers } from './setupIpcServerRoutesHandlers';
import setupViewEventHandlers from './setupViewEventHandlers';
import { setupViewSession } from './setupViewSession';

@injectable()
export class View implements IViewService {
  @lazyInject(serviceIdentifier.Preference)
  private readonly preferenceService!: IPreferenceService;

  @lazyInject(serviceIdentifier.Window)
  private readonly windowService!: IWindowService;

  @lazyInject(serviceIdentifier.Workspace)
  private readonly workspaceService!: IWorkspaceService;

  @lazyInject(serviceIdentifier.MenuService)
  private readonly menuService!: IMenuService;

  @lazyInject(serviceIdentifier.WorkspaceView)
  private readonly workspaceViewService!: IWorkspaceViewService;

  @lazyInject(serviceIdentifier.Authentication)
  private readonly authService!: IAuthenticationService;

  @lazyInject(serviceIdentifier.NativeService)
  private readonly nativeService!: INativeService;

  constructor() {
    this.initIPCHandlers();
    void this.registerMenu();
  }

  private initIPCHandlers(): void {
    ipcMain.handle(ViewChannel.onlineStatusChanged, async (_event, online: boolean) => {
      // try to fix when wifi status changed when wiki startup, causing wiki not loaded properly.
      // if (online) {
      //   await this.reloadViewsWebContentsIfDidFailLoad();
      // }
      // /**
      //  * fixLocalIpNotAccessible. try to fix when network changed cause old local ip not accessible, need to generate a new ip and reload the view
      //  * Do this for all workspace and all views...
      //  */
      // await this.workspaceViewService.restartAllWorkspaceView();
    });
  }

  private async registerMenu(): Promise<void> {
    const hasWorkspaces = async () => (await this.workspaceService.countWorkspaces()) > 0;
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
      {
        label: () => i18n.t('Menu.ActualSize'),
        accelerator: 'CmdOrCtrl+0',
        click: async (_menuItem, browserWindow) => {
          // if item is called in popup window
          // modify menu bar in the popup window instead
          if (browserWindow === undefined) return;
          const { isPopup } = await getFromRenderer<IBrowserViewMetaData>(MetaDataChannel.getViewMetaData, browserWindow);
          if (isPopup === true) {
            const contents = browserWindow.webContents;
            contents.zoomFactor = 1;
            return;
          }
          // modify browser view in the main window
          const mainWindow = this.windowService.get(WindowNames.main);
          mainWindow?.getBrowserView()?.webContents?.setZoomFactor(1);
        },
        enabled: hasWorkspaces,
      },
      {
        label: () => i18n.t('Menu.ZoomIn'),
        accelerator: 'CmdOrCtrl+=',
        click: async (_menuItem, browserWindow) => {
          // if item is called in popup window
          // modify menu bar in the popup window instead
          if (browserWindow === undefined) return;
          const { isPopup } = await getFromRenderer<IBrowserViewMetaData>(MetaDataChannel.getViewMetaData, browserWindow);
          if (isPopup === true) {
            const contents = browserWindow.webContents;
            contents.zoomFactor += 0.05;
            return;
          }
          // modify browser view in the main window
          const mainWindow = this.windowService.get(WindowNames.main);
          const webContent = mainWindow?.getBrowserView()?.webContents;
          // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
          webContent?.setZoomFactor(webContent.getZoomFactor() + 0.05);
        },
        enabled: hasWorkspaces,
      },
      {
        label: () => i18n.t('Menu.ZoomOut'),
        accelerator: 'CmdOrCtrl+-',
        click: async (_menuItem, browserWindow) => {
          // if item is called in popup window
          // modify menu bar in the popup window instead
          if (browserWindow === undefined) return;
          const { isPopup } = await getFromRenderer<IBrowserViewMetaData>(MetaDataChannel.getViewMetaData, browserWindow);
          if (isPopup === true) {
            const contents = browserWindow.webContents;
            contents.zoomFactor -= 0.05;
            return;
          }
          // modify browser view in the main window
          const mainWindow = this.windowService.get(WindowNames.main);
          const webContent = mainWindow?.getBrowserView()?.webContents;
          // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
          webContent?.setZoomFactor(webContent.getZoomFactor() - 0.05);
        },
        enabled: hasWorkspaces,
      },
      { type: 'separator' },
      {
        label: () => i18n.t('ContextMenu.Reload'),
        accelerator: 'CmdOrCtrl+R',
        click: async (_menuItem, browserWindow) => {
          // if item is called in popup window
          // modify menu bar in the popup window instead
          if (browserWindow === undefined) return;
          const { isPopup } = await getFromRenderer<IBrowserViewMetaData>(MetaDataChannel.getViewMetaData, browserWindow);
          if (isPopup === true) {
            browserWindow.webContents.reload();
            return;
          }
          // refresh the main window browser view's wiki content, instead of sidebar's react content
          const mainWindow = this.windowService.get(WindowNames.main);
          mainWindow?.getBrowserView()?.webContents?.reload();
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
      this.setViewEventTarget.dispatchEvent(new Event(setViewEventName(workspaceID, windowName)));
    } else {
      workspaceOwnedViews[windowName] = newView;
    }
  };

  private readonly setViewEventTarget = new EventTarget();

  private shouldMuteAudio = false;
  private shouldPauseNotifications = false;

  public async addViewForAllBrowserViews(workspace: IWorkspace): Promise<void> {
    await Promise.all([
      this.addView(workspace, WindowNames.main),
      this.preferenceService.get('attachToMenubar').then(async (attachToMenubar) => {
        return await (attachToMenubar && this.addView(workspace, WindowNames.menuBar));
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
    const preferences = await this.preferenceService.getPreferences();
    const { spellcheck } = preferences;

    const sessionOfView = setupViewSession(workspace, preferences);
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
      loadInitialUrlWithCatch: async () => {
        await this.loadUrlForView(workspace, view, windowName);
      },
    });
    setupIpcServerRoutesHandlers(view, workspace.id);
    await this.loadUrlForView(workspace, view, windowName);
  }

  public async loadUrlForView(workspace: IWorkspace, view: BrowserView, windowName: WindowNames): Promise<void> {
    const { rememberLastPageVisited } = await this.preferenceService.getPreferences();
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/strict-boolean-expressions
    const urlToLoad = (rememberLastPageVisited ? workspace.lastUrl : workspace.homeUrl) || workspace.homeUrl || getDefaultTidGiUrl(workspace.id);
    try {
      logger.debug(
        `loadUrlForView(): view.webContents: ${String(view.webContents)} urlToLoad: ${urlToLoad} for windowName ${windowName} for workspace ${workspace.name}`,
        { stack: new Error('stack').stack?.replace('Error:', '') },
      );
      // if workspace failed to load, means nodejs server may have plugin error or something. Stop retrying, and show the error message in src/pages/Main/ErrorMessage.tsx
      if (await this.workspaceService.workspaceDidFailLoad(workspace.id)) {
        return;
      }
      // will set again in view.webContents.on('did-start-loading'), but that one sometimes is too late to block services that wait for `isLoading`
      await this.workspaceService.updateMetaData(workspace.id, {
        // eslint-disable-next-line unicorn/no-null
        didFailLoadErrorMessage: null,
        isLoading: true,
      });
      // DEBUG devTool
      // view.webContents.openDevTools({ mode: 'detach' });
      await view.webContents.loadURL(urlToLoad);
      logger.debug('loadUrlForView() await loadURL() done');
      const unregisterContextMenu = await this.menuService.initContextMenuForWindowWebContents(view.webContents);
      view.webContents.on('destroyed', () => {
        unregisterContextMenu();
      });
    } catch (error) {
      logger.warn(new ViewLoadUrlError(urlToLoad, `${(error as Error).message} ${(error as Error).stack ?? ''}`));
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
      this.preferenceService.get('attachToMenubar').then(async (attachToMenubar) => {
        return await (attachToMenubar && this.setActiveView(workspaceID, WindowNames.menuBar));
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
        await this.addView(workspace, windowName);
      }
    } else {
      browserWindow.setBrowserView(view);
      logger.debug(`setActiveView() setBrowserView`);
      const contentSize = browserWindow.getContentSize();
      if (workspace !== undefined && (await this.workspaceService.workspaceDidFailLoad(workspace.id))) {
        view.setBounds(await getViewBounds(contentSize as [number, number], false, 0, 0)); // hide browserView to show error message
      } else {
        logger.debug(`setActiveView() contentSize ${JSON.stringify(contentSize)}`);
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

      // don't set activate browserView to null here, the "current browser view" may point to other workspace's view now, it will close other workspace's view when switching workspaces.
      // eslint-disable-next-line unicorn/no-null
      // browserWindow.setBrowserView(null);
      browserWindow.removeBrowserView(view);

      // currently use workaround https://github.com/electron/electron/issues/10096
      // @ts-expect-error Property 'destroy' does not exist on type 'WebContents'.ts(2339)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      view.webContents.destroy();
    } else {
      logger.error(`removeView() view or browserWindow is undefined for workspaceID ${workspaceID} windowName ${windowName}, not destroying view properly.`);
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

    this.forEachView(async (view, id) => {
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
        if (view.webContents === null) {
          logger.error(`view.webContents is ${String(view.webContents)} when reloadViewsWebContentsIfDidFailLoad's forEachView(${id})`);
          return;
        }
        view.webContents.reload();
      }
    });
  }

  public async reloadViewsWebContents(workspaceID?: string): Promise<void> {
    const rememberLastPageVisited = await this.preferenceService.get('rememberLastPageVisited');
    this.forEachView(async (view, id, _name) => {
      /** if workspaceID not passed means reload all views. */
      if (workspaceID === undefined || id === workspaceID) {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!view.webContents) {
          logger.error(`view.webContents is ${String(view.webContents)} when reloadViewsWebContents's forEachView(${id})`);
          return;
        }
        // if we can get lastUrl, use it
        if (workspaceID !== undefined) {
          const workspace = await this.workspaceService.get(workspaceID);
          // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
          if (rememberLastPageVisited && workspace?.lastUrl) {
            try {
              await view.webContents.loadURL(workspace.lastUrl);
              return;
            } catch (error) {
              logger.warn(new ViewLoadUrlError(workspace.lastUrl, `${(error as Error).message} ${(error as Error).stack ?? ''}`));
            }
          }
        }
        // else fallback to just reload
        view.webContents.reload();
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
    logger.error(`getActiveBrowserViews workspace !== undefined`, { stack: new Error('stack').stack?.replace('Error:', '') });
    return [];
  }

  public async reloadActiveBrowserView(): Promise<void> {
    const views = await this.getActiveBrowserViews();
    if (views.length === 0) {
      logger.error(`reloadActiveBrowserView views.length === 0`, { stack: new Error('stack').stack?.replace('Error:', '') });
    }
    views.forEach((view) => {
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (view?.webContents) {
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
        await this.hideView(browserWindow);
      } else {
        logger.debug(`realignActiveView() contentSize set to ${JSON.stringify(contentSize)}`);
        view?.setBounds(await getViewBounds(contentSize as [number, number]));
      }
    } else if (isRetry === true) {
      logger.error(
        `realignActiveView() ${activeId} failed view?.webContents is ${String(view?.webContents)} and isRetry is ${String(isRetry)} stack: ${
          new Error('stack').stack?.replace('Error:', '') ?? 'no stack'
        }`,
      );
    } else {
      // retry one time later if webContent is not ready yet
      logger.debug(`realignActiveView() retry one time later`);
      setTimeout(() => void this.realignActiveView(browserWindow, activeId, true), 1000);
    }
  };

  public async hideView(browserWindow: BrowserWindow): Promise<void> {
    const view = browserWindow.getBrowserView();
    if (view !== null) {
      const contentSize = browserWindow.getContentSize();
      view?.setBounds(await getViewBounds(contentSize as [number, number], false, 0, 0)); // hide browserView to show error message or other pages
    }
  }
}
