/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable n/no-callback-literal */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/consistent-type-assertions */
import { BrowserWindow, ipcMain, WebContentsView, WebPreferences } from 'electron';
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
import { isBrowserWindow } from '@services/libs/isBrowserWindow';
import { logger } from '@services/libs/log';
import { INativeService } from '@services/native/interface';
import { IBrowserViewMetaData, WindowNames } from '@services/windows/WindowProperties';
import { IWorkspace } from '@services/workspaces/interface';
import debounce from 'lodash/debounce';
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
      // but with addition to readjust WebContentsView so it won't cover the menu bar
      {
        label: () => i18n.t('Preference.ToggleMenuBar'),
        visible: false,
        accelerator: 'Alt+M',
        enabled: isWin,
        click: async (_menuItem, browserWindow) => {
          // if back is called in popup window
          // open menu bar in the popup window instead
          if (!isBrowserWindow(browserWindow)) return;
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
          if (!isBrowserWindow(browserWindow)) return;
          const { isPopup } = await getFromRenderer<IBrowserViewMetaData>(MetaDataChannel.getViewMetaData, browserWindow);
          if (isPopup === true) {
            const contents = browserWindow.webContents;
            contents.zoomFactor = 1;
            return;
          }
          // browserWindow above is for the main window's react UI
          // modify browser view in the main window
          const view = await this.getActiveBrowserView();
          view?.webContents?.setZoomFactor?.(1);
        },
        enabled: hasWorkspaces,
      },
      {
        label: () => i18n.t('Menu.ZoomIn'),
        accelerator: 'CmdOrCtrl+=',
        click: async (_menuItem, browserWindow) => {
          // if item is called in popup window
          // modify menu bar in the popup window instead
          if (!isBrowserWindow(browserWindow)) return;
          // TODO: on popup (secondary) window, browserWindow here seems can't get the correct webContent, so this never returns. And can't set zoom of popup.
          const { isPopup } = await getFromRenderer<IBrowserViewMetaData>(MetaDataChannel.getViewMetaData, browserWindow);
          if (isPopup === true) {
            const contents = browserWindow.webContents;
            contents.zoomFactor += 0.05;
            return;
          }
          // modify browser view in the main window
          const view = await this.getActiveBrowserView();
          view?.webContents?.setZoomFactor?.(view.webContents.getZoomFactor() + 0.05);
        },
        enabled: hasWorkspaces,
      },
      {
        label: () => i18n.t('Menu.ZoomOut'),
        accelerator: 'CmdOrCtrl+-',
        click: async (_menuItem, browserWindow) => {
          // if item is called in popup window
          // modify menu bar in the popup window instead
          if (!isBrowserWindow(browserWindow)) return;
          const { isPopup } = await getFromRenderer<IBrowserViewMetaData>(MetaDataChannel.getViewMetaData, browserWindow);
          if (isPopup === true) {
            const contents = browserWindow.webContents;
            contents.zoomFactor -= 0.05;
            return;
          }
          // modify browser view in the main window
          const view = await this.getActiveBrowserView();
          view?.webContents?.setZoomFactor?.(view.webContents.getZoomFactor() - 0.05);
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
          if (!isBrowserWindow(browserWindow)) return;
          const { isPopup } = await getFromRenderer<IBrowserViewMetaData>(MetaDataChannel.getViewMetaData, browserWindow);
          if (isPopup === true) {
            browserWindow.webContents.reload();
            return;
          }
          // refresh the main window browser view's wiki content, instead of sidebar's react content
          await this.reloadActiveBrowserView();
        },
        enabled: hasWorkspaces,
      },
    ]);
    /* eslint-enable @typescript-eslint/no-misused-promises */
  }

  /**
   * Record<workspaceID, Record<windowName, WebContentsView>>
   *
   * Each workspace can have several windows to render its view (main window and menu bar)
   */
  private readonly views = new Map<string, Map<WindowNames, WebContentsView> | undefined>();
  public async getViewCount(): Promise<number> {
    // eslint-disable-next-line @typescript-eslint/return-await
    return await Promise.resolve(Object.keys(this.views).length);
  }

  public getView(workspaceID: string, windowName: WindowNames): WebContentsView | undefined {
    return this.views.get(workspaceID)?.get(windowName);
  }

  public setView(workspaceID: string, windowName: WindowNames, newView: WebContentsView): void {
    const workspaceOwnedViews = this.views.get(workspaceID);
    if (workspaceOwnedViews === undefined) {
      this.views.set(workspaceID, new Map([[windowName, newView]]));
      this.setViewEventTarget.dispatchEvent(new Event(setViewEventName(workspaceID, windowName)));
    } else {
      workspaceOwnedViews.set(windowName, newView);
    }
  }

  private readonly setViewEventTarget = new EventTarget();

  private shouldMuteAudio = false;
  private shouldPauseNotifications = false;

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
    const sharedWebPreferences = await this.getSharedWebPreferences(workspace);
    const view = await this.createViewAddToWindow(workspace, browserWindow, sharedWebPreferences, windowName);
    this.setView(workspace.id, windowName, view);
    await this.initializeWorkspaceViewHandlersAndLoad(browserWindow, view, { workspace, sharedWebPreferences, windowName });
  }

  public async getSharedWebPreferences(workspace: IWorkspace) {
    const preferences = this.preferenceService.getPreferences();
    const { spellcheck } = preferences;

    const sessionOfView = setupViewSession(workspace, preferences);
    const browserViewMetaData: IBrowserViewMetaData = { workspaceID: workspace.id };
    return {
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
    } satisfies WebPreferences;
  }

  public async createViewAddToWindow(workspace: IWorkspace, browserWindow: BrowserWindow, sharedWebPreferences: WebPreferences, windowName: WindowNames): Promise<WebContentsView> {
    // create a new WebContentsView
    const view = new WebContentsView({
      webPreferences: sharedWebPreferences,
    });
    // background needs to explicitly set
    // if not, by default, the background of WebContentsView is transparent
    // which would break the CSS of certain websites
    // even with dark mode, all major browsers
    // always use #FFF as default page background
    // https://github.com/atomery/webcatalog/issues/723
    // https://github.com/electron/electron/issues/16212

    // Handle audio & notification preferences
    if (this.shouldMuteAudio !== undefined) {
      view.webContents.audioMuted = this.shouldMuteAudio;
    }
    if (workspace.active || windowName === WindowNames.secondary) {
      browserWindow.contentView.addChildView(view);
      const contentSize = browserWindow.getContentSize();
      const newViewBounds = await getViewBounds(contentSize as [number, number], { windowName });
      view.setBounds(newViewBounds);
    }
    // handle autoResize on user drag the window's edge
    const debouncedOnResize = debounce(async () => {
      logger.debug('debouncedOnResize');
      if (browserWindow === undefined) return;
      if (windowName === WindowNames.secondary || windowName === WindowNames.main) {
        const contentSize = browserWindow.getContentSize();
        const newViewBounds = await getViewBounds(contentSize as [number, number], { windowName });
        view.setBounds(newViewBounds);
      }
    }, 200);
    browserWindow.on('resize', debouncedOnResize);
    return view;
  }

  public async initializeWorkspaceViewHandlersAndLoad(
    browserWindow: BrowserWindow,
    view: WebContentsView,
    configs: { sharedWebPreferences: WebPreferences; uri?: string; windowName: WindowNames; workspace: IWorkspace },
  ) {
    const { sharedWebPreferences, uri, workspace, windowName } = configs;
    setupViewEventHandlers(view, browserWindow, {
      shouldPauseNotifications: this.shouldPauseNotifications,
      workspace,
      sharedWebPreferences,
      loadInitialUrlWithCatch: async () => {
        await this.loadUrlForView(workspace, view, uri);
      },
      windowName,
    });
    setupIpcServerRoutesHandlers(view, workspace.id);
    await this.loadUrlForView(workspace, view, uri);
  }

  public async loadUrlForView(workspace: IWorkspace, view: WebContentsView, uri?: string): Promise<void> {
    const { rememberLastPageVisited } = this.preferenceService.getPreferences();
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/strict-boolean-expressions
    const urlToLoad = uri || (rememberLastPageVisited ? workspace.lastUrl : workspace.homeUrl) || workspace.homeUrl || getDefaultTidGiUrl(workspace.id);
    try {
      logger.debug(
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        `loadUrlForView(): view.webContents is ${view.webContents ? 'define' : 'undefined'} urlToLoad: ${urlToLoad} for workspace ${workspace.name}`,
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

  public forEachView(functionToRun: (view: WebContentsView, workspaceID: string, windowName: WindowNames) => unknown): void {
    [...this.views.keys()].forEach((workspaceID) => {
      const workspaceOwnedViews = this.views.get(workspaceID);
      if (workspaceOwnedViews !== undefined) {
        [...workspaceOwnedViews.keys()].forEach((windowName) => {
          const view = workspaceOwnedViews.get(windowName);
          if (view !== undefined) {
            functionToRun(view, workspaceID, windowName);
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
      browserWindow.contentView.addChildView(view);
      logger.debug(`setActiveView() contentView.addChildView`);
      const contentSize = browserWindow.getContentSize();
      if (workspace !== undefined && (await this.workspaceService.workspaceDidFailLoad(workspace.id))) {
        view.setBounds(await getViewBounds(contentSize as [number, number], { findInPage: false, windowName }, 0, 0)); // hide browserView to show error message
      } else {
        const newViewBounds = await getViewBounds(contentSize as [number, number], { windowName });
        logger.debug(`setActiveView() contentSize ${JSON.stringify(newViewBounds)}`);
        view.setBounds(newViewBounds);
      }
      // focus on webview
      // https://github.com/quanglam2807/webcatalog/issues/398
      view.webContents.focus();
      browserWindow.setTitle(view.webContents.getTitle());
    }
  }

  public removeView(workspaceID: string, windowName: WindowNames): void {
    logger.debug(`Remove view for workspaceID ${workspaceID} via ${new Error('stack').stack ?? 'no stack'}`);
    const view = this.getView(workspaceID, windowName);
    const browserWindow = this.windowService.get(windowName);
    if (view !== undefined && browserWindow !== undefined) {
      // stop find in page when switching workspaces
      view.webContents.stopFindInPage('clearSelection');
      view.webContents.send(WindowChannel.closeFindInPage);

      // don't clear contentView here `browserWindow.contentView.children = [];`, the "current contentView" may point to other workspace's view now, it will close other workspace's view when switching workspaces.
      browserWindow.contentView.removeChildView(view);
    } else {
      logger.error(`removeView() view or browserWindow is undefined for workspaceID ${workspaceID} windowName ${windowName}, not destroying view properly.`);
    }
  }

  public removeAllViewOfWorkspace(workspaceID: string): void {
    const views = this.views.get(workspaceID);
    if (views !== undefined) {
      [...views.keys()].forEach((windowName) => {
        this.removeView(workspaceID, windowName);
      });
      views.clear();
    }
  }

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

  public async getActiveBrowserView(): Promise<WebContentsView | undefined> {
    const workspace = await this.workspaceService.getActiveWorkspace();
    if (workspace !== undefined) {
      const isMenubarOpen = await this.windowService.isMenubarOpen();
      if (isMenubarOpen) {
        return this.getView(workspace.id, WindowNames.menuBar);
      } else {
        return this.getView(workspace.id, WindowNames.main);
      }
    }
  }

  public async getActiveBrowserViews(): Promise<Array<WebContentsView | undefined>> {
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

  public async realignActiveView(browserWindow: BrowserWindow, activeId: string, windowName: WindowNames, isRetry?: boolean): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const view = this.getView(activeId, windowName);
    if (view?.webContents) {
      const contentSize = browserWindow.getContentSize();
      if (await this.workspaceService.workspaceDidFailLoad(activeId)) {
        logger.warn(`realignActiveView() hide because didFailLoad`);
        await this.hideView(browserWindow, windowName, activeId);
      } else {
        const newViewBounds = await getViewBounds(contentSize as [number, number], { windowName });
        logger.debug(`realignActiveView() contentSize set to ${JSON.stringify(newViewBounds)}`);
        view?.setBounds(newViewBounds);
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
      setTimeout(() => void this.realignActiveView(browserWindow, activeId, windowName, true), 1000);
    }
  }

  public async hideView(browserWindow: BrowserWindow, windowName: WindowNames, idToDeactivate: string): Promise<void> {
    logger.debug('Hide view', { idToDeactivate, windowName });
    if (!idToDeactivate) return;
    const view = this.getView(idToDeactivate, windowName);
    if (view) {
      const contentSize = browserWindow.getContentSize();
      // disable view features
      view.webContents.stopFindInPage('clearSelection');
      view.webContents.send(WindowChannel.closeFindInPage);
      // make view small, hide browserView to show error message or other pages
      view?.setBounds({
        x: -contentSize[0],
        y: -contentSize[1],
        width: contentSize[0],
        height: contentSize[1],
      });
    }
  }

  public async getLoadedViewEnsure(workspaceID: string, windowName: WindowNames): Promise<WebContentsView> {
    let view = this.getView(workspaceID, windowName);
    if (view === undefined) {
      // wait for view to be set
      await new Promise<void>(resolve => {
        this.setViewEventTarget.addEventListener(setViewEventName(workspaceID, windowName), () => {
          resolve();
        });
      });
    } else {
      return view;
    }
    view = this.getView(workspaceID, windowName);
    if (view === undefined) {
      const errorMessage = `Still no view for ${workspaceID} in window ${windowName} after waiting.`;
      logger.error(errorMessage, { function: 'getLoadedViewEnsure' });
      throw new Error(errorMessage);
    }
    return view;
  }
}
