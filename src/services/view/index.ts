import { container } from '@services/container';
import { getPreloadPath } from '@services/windows/viteEntry';
import { BrowserWindow, WebContentsView, WebPreferences } from 'electron';
import { inject, injectable } from 'inversify';

import type { IMenuService } from '@services/menu/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWindowService } from '@services/windows/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';

import { MetaDataChannel, WindowChannel } from '@/constants/channels';
import { getDefaultTidGiUrl } from '@/constants/urls';
import { isMac, isWin } from '@/helpers/system';
import type { IAuthenticationService } from '@services/auth/interface';
import getFromRenderer from '@services/libs/getFromRenderer';
import getViewBounds from '@services/libs/getViewBounds';
import { i18n } from '@services/libs/i18n';
import { isBrowserWindow } from '@services/libs/isBrowserWindow';
import { logger } from '@services/libs/log';
import type { INativeService } from '@services/native/interface';
import { type IBrowserViewMetaData, WindowNames } from '@services/windows/WindowProperties';
import { isWikiWorkspace, type IWorkspace } from '@services/workspaces/interface';
import { getTidgiMiniWindowTargetWorkspace } from '@services/workspacesView/utilities';
import debounce from 'lodash/debounce';
import { setViewEventName } from './constants';
import { ViewLoadUrlError } from './error';
import type { IViewService } from './interface';
import { setupIpcServerRoutesHandlers } from './setupIpcServerRoutesHandlers';
import setupViewEventHandlers from './setupViewEventHandlers';
import { setupViewSession } from './setupViewSession';

@injectable()
export class View implements IViewService {
  constructor(
    @inject(serviceIdentifier.Preference) private readonly preferenceService: IPreferenceService,
    @inject(serviceIdentifier.Authentication) private readonly authService: IAuthenticationService,
    @inject(serviceIdentifier.NativeService) private readonly nativeService: INativeService,
    @inject(serviceIdentifier.MenuService) private readonly menuService: IMenuService,
  ) {
  }

  // Circular dependency services - use container.get() when needed
  private get windowService(): IWindowService {
    return container.get<IWindowService>(serviceIdentifier.Window);
  }

  private get workspaceService(): IWorkspaceService {
    return container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  }

  public async initialize(): Promise<void> {
    await this.registerMenu();
  }

  private async registerMenu(): Promise<void> {
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);
    const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);

    const hasWorkspaces = async () => (await workspaceService.countWorkspaces()) > 0;
    const sidebar = await preferenceService.get('sidebar');
    const titleBar = await preferenceService.get('titleBar');
    // electron type forget that click can be async function

    await menuService.insertMenu('View', [
      {
        label: () => (sidebar ? i18n.t('Preference.HideSideBar') : i18n.t('Preference.ShowSideBar')),
        accelerator: 'CmdOrCtrl+Alt+S',
        click: async () => {
          const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);
          const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);
          const sidebarLatest = await preferenceService.get('sidebar');
          void preferenceService.set('sidebar', !sidebarLatest);
          void workspaceViewService.realignActiveWorkspace();
        },
      },
      {
        label: () => (titleBar ? i18n.t('Preference.HideTitleBar') : i18n.t('Preference.ShowTitleBar')),
        accelerator: 'CmdOrCtrl+Alt+T',
        enabled: isMac,
        visible: isMac,
        click: async () => {
          const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);
          const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);
          const titleBarLatest = await preferenceService.get('titleBar');
          void preferenceService.set('titleBar', !titleBarLatest);
          void workspaceViewService.realignActiveWorkspace();
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
          const windowService = container.get<IWindowService>(serviceIdentifier.Window);
          const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);
          const mainWindow = windowService.get(WindowNames.main);
          mainWindow?.setMenuBarVisibility(!mainWindow.isMenuBarVisible());
          void workspaceViewService.realignActiveWorkspace();
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
          view?.webContents.setZoomFactor(1);
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
          view?.webContents.setZoomFactor(view.webContents.getZoomFactor() + 0.05);
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
          view?.webContents.setZoomFactor(view.webContents.getZoomFactor() - 0.05);
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
  }

  /**
   * Record<workspaceID, Record<windowName, WebContentsView>>
   *
   * Each workspace can have several windows to render its view (main window and menu bar)
   */
  private readonly views = new Map<string, Map<WindowNames, WebContentsView> | undefined>();
  public async getViewCount(): Promise<number> {
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
      Promise.resolve(checkNotExist(workspace, WindowNames.main)),
      this.preferenceService.get('tidgiMiniWindow').then((tidgiMiniWindow) => (tidgiMiniWindow && checkNotExist(workspace, WindowNames.tidgiMiniWindow)) ? true : false),
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

    const sessionOfView = setupViewSession(workspace, preferences, () => this.preferenceService.getPreferences());
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
      preload: getPreloadPath(),
      additionalArguments: [
        `${MetaDataChannel.browserViewMetaData}${WindowNames.view}`,
        `${MetaDataChannel.browserViewMetaData}${encodeURIComponent(JSON.stringify(browserViewMetaData))}`,
        '--unsafely-disable-devtools-self-xss-warnings',
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
    // Add view to window if:
    // 1. workspace is active (main window)
    // 2. windowName is secondary (always add)
    // 3. windowName is tidgiMiniWindow (tidgi mini window can have fixed workspace independent of main window's active workspace)
    if (workspace.active || windowName === WindowNames.secondary || windowName === WindowNames.tidgiMiniWindow) {
      browserWindow.contentView.addChildView(view);
      const contentSize = browserWindow.getContentSize();
      const newViewBounds = await getViewBounds(contentSize as [number, number], { windowName });
      view.setBounds(newViewBounds);
    }
    // handle autoResize on user drag the window's edge https://github.com/electron/electron/issues/22174#issuecomment-2628884143
    const debouncedOnResize = debounce(async () => {
      logger.debug('debouncedOnResize');
      if (browserWindow === undefined) return;
      const updatedWorkspace = await this.workspaceService.get(workspace.id);
      if (updatedWorkspace === undefined) return;
      // Prevent update non-active (hiding) wiki workspace, so it won't pop up to cover other active agent workspace
      if (windowName === WindowNames.main && !updatedWorkspace.active) return;
      if ([WindowNames.secondary, WindowNames.main, WindowNames.tidgiMiniWindow].includes(windowName)) {
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

    const lastUrl = isWikiWorkspace(workspace) ? workspace.lastUrl : null;
    const homeUrl = isWikiWorkspace(workspace) ? workspace.homeUrl : null;
    const urlToLoad = uri || (rememberLastPageVisited ? lastUrl : homeUrl) || homeUrl || getDefaultTidGiUrl(workspace.id);
    try {
      logger.debug('view load url', {
        stack: new Error('stack').stack?.replace('Error:', ''),
        urlToLoad,
        viewDefined: Boolean(view.webContents),
        workspaceName: workspace.name,
        function: 'loadUrlForView',
      });
      // if workspace failed to load, means nodejs server may have plugin error or something. Stop retrying, and show the error message in src/pages/Main/ErrorMessage.tsx
      if (await this.workspaceService.workspaceDidFailLoad(workspace.id)) {
        return;
      }
      // will set again in view.webContents.on('did-start-loading'), but that one sometimes is too late to block services that wait for `isLoading`
      await this.workspaceService.updateMetaData(workspace.id, {
        didFailLoadErrorMessage: null,
        isLoading: true,
      });
      await view.webContents.loadURL(urlToLoad);
      logger.debug('await loadURL done', {
        function: 'loadUrlForView',
      });
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
    // Set main window workspace
    const mainWindowTask = this.setActiveView(workspaceID, WindowNames.main);
    const tidgiMiniWindow = await this.preferenceService.get('tidgiMiniWindow');

    // For tidgi mini window, decide which workspace to show based on preferences
    let tidgiMiniWindowTask = Promise.resolve();
    if (tidgiMiniWindow) {
      // Default to sync (undefined or true), otherwise use fixed workspace ID (fallback to main if not set)
      const { targetWorkspaceId } = await getTidgiMiniWindowTargetWorkspace(workspaceID);
      const tidgiMiniWindowWorkspaceId = targetWorkspaceId || workspaceID;

      logger.debug('setActiveViewForAllBrowserViews tidgi mini window decision', {
        function: 'setActiveViewForAllBrowserViews',
        tidgiMiniWindowWorkspaceId,
        willSetActiveView: true,
      });

      tidgiMiniWindowTask = this.setActiveView(tidgiMiniWindowWorkspaceId, WindowNames.tidgiMiniWindow);
    } else {
      logger.info('setActiveViewForAllBrowserViews tidgi mini window not enabled', {
        function: 'setActiveViewForAllBrowserViews',
      });
    }

    await Promise.all([mainWindowTask, tidgiMiniWindowTask]);
  }

  public async setActiveView(workspaceID: string, windowName: WindowNames): Promise<void> {
    const browserWindow = this.windowService.get(windowName);
    logger.debug('set active view check', {
      workspaceID,
      windowName,
      browserWindowDefined: String(browserWindow !== undefined),
      function: 'setActiveView',
    });
    if (browserWindow === undefined) {
      return;
    }
    const workspace = await this.workspaceService.get(workspaceID);
    const view = this.getView(workspaceID, windowName);
    logger.debug('view/workspace check', {
      viewDefined: String(view !== undefined && view !== null),
      workspaceDefined: String(workspace !== undefined),
      function: 'setActiveView',
    });
    if (view === undefined || view === null) {
      if (workspace === undefined) {
        logger.error('workspace undefined in setActiveView', {
          function: 'setActiveView',
          windowName,
          workspaceID,
        });
      } else {
        await this.addView(workspace, windowName);
      }
    } else {
      browserWindow.contentView.addChildView(view);
      logger.debug('contentView.addChildView', {
        function: 'setActiveView',
      });
      const contentSize = browserWindow.getContentSize();
      if (workspace !== undefined && (await this.workspaceService.workspaceDidFailLoad(workspace.id))) {
        view.setBounds(await getViewBounds(contentSize as [number, number], { findInPage: false, windowName }, 0, 0)); // hide browserView to show error message
      } else {
        const newViewBounds = await getViewBounds(contentSize as [number, number], { windowName });
        logger.debug('content size updated', {
          newViewBounds: JSON.stringify(newViewBounds),
          function: 'setActiveView',
        });
        view.setBounds(newViewBounds);
      }
      // focus on webview
      // https://github.com/quanglam2807/webcatalog/issues/398
      view.webContents.focus();
      browserWindow.setTitle(view.webContents.getTitle());
    }
  }

  public removeView(workspaceID: string, windowName: WindowNames): void {
    logger.debug('removeView called', {
      function: 'removeView',
      workspaceID,
      stack: new Error('stack').stack ?? 'no stack',
    });
    const view = this.getView(workspaceID, windowName);
    const browserWindow = this.windowService.get(windowName);
    if (view !== undefined && browserWindow !== undefined) {
      // stop find in page when switching workspaces
      view.webContents.stopFindInPage('clearSelection');
      view.webContents.send(WindowChannel.closeFindInPage);

      // don't clear contentView here `browserWindow.contentView.children = [];`, the "current contentView" may point to other workspace's view now, it will close other workspace's view when switching workspaces.
      browserWindow.contentView.removeChildView(view);
    } else {
      logger.error('view or browserWindow is undefined, not destroying view properly', {
        workspaceID,
        windowName,
        function: 'removeView',
      });
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
        view.webContents.audioMuted = (isWikiWorkspace(workspace) ? workspace.disableAudio : false) || this.shouldMuteAudio;
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
          logger.error('webContents null in reloadViewsWebContentsIfDidFailLoad', {
            function: 'reloadViewsWebContentsIfDidFailLoad',
            workspaceID: id,
            webContents: String(view.webContents),
          });
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
        if (!view.webContents) {
          logger.error('webContents missing in reloadViewsWebContents', {
            function: 'reloadViewsWebContents',
            workspaceID: id,
            webContents: String(view.webContents),
          });
          return;
        }
        // if we can get lastUrl, use it
        if (workspaceID !== undefined) {
          const workspace = await this.workspaceService.get(workspaceID);

          if (rememberLastPageVisited && workspace && isWikiWorkspace(workspace) && workspace.lastUrl) {
            try {
              await view.webContents.loadURL(workspace.lastUrl);
            } catch (error) {
              logger.warn(new ViewLoadUrlError(workspace.lastUrl, `${(error as Error).message} ${(error as Error).stack ?? ''}`));
            }
          }
        }
        // Always trigger a reload
        view.webContents.reload();
      }
    });
  }

  public async getViewCurrentUrl(workspaceID?: string): Promise<string | undefined> {
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
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const workspace = await workspaceService.getActiveWorkspace();
    if (workspace !== undefined) {
      const windowService = container.get<IWindowService>(serviceIdentifier.Window);
      const isTidgiMiniWindowOpen = await windowService.isTidgiMiniWindowOpen();
      if (isTidgiMiniWindowOpen) {
        return this.getView(workspace.id, WindowNames.tidgiMiniWindow);
      } else {
        return this.getView(workspace.id, WindowNames.main);
      }
    }
  }

  public async getActiveBrowserViews(): Promise<Array<WebContentsView | undefined>> {
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const workspace = await workspaceService.getActiveWorkspace();
    if (workspace !== undefined) {
      return [this.getView(workspace.id, WindowNames.main), this.getView(workspace.id, WindowNames.tidgiMiniWindow)];
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
      if (view?.webContents) {
        view.webContents.reload();
      }
    });
  }

  public async realignActiveView(browserWindow: BrowserWindow, activeId: string, windowName: WindowNames, isRetry?: boolean): Promise<void> {
    const view = this.getView(activeId, windowName);
    if (view?.webContents) {
      const contentSize = browserWindow.getContentSize();
      if (await this.workspaceService.workspaceDidFailLoad(activeId)) {
        logger.warn('hide because didFailLoad', { function: 'realignActiveView' });
        await this.hideView(browserWindow, windowName, activeId);
      } else {
        const newViewBounds = await getViewBounds(contentSize as [number, number], { windowName });
        logger.debug('contentSize set', { newViewBounds: JSON.stringify(newViewBounds), function: 'realignActiveView' });
        view.setBounds(newViewBounds);
      }
    } else if (isRetry === true) {
      logger.error(
        `realignActiveView() ${activeId} failed view?.webContents is ${view?.webContents ? '[WebContents]' : 'undefined'} and isRetry is ${String(isRetry)} stack: ${
          new Error('stack').stack?.replace('Error:', '') ?? 'no stack'
        }`,
      );
    } else {
      // retry one time later if webContent is not ready yet
      logger.debug('retry one time later', { function: 'realignActiveView' });
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
      view.setBounds({
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
