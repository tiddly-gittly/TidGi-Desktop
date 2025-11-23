import { app, BrowserWindow, BrowserWindowConstructorOptions } from 'electron';
import windowStateKeeper, { State as windowStateKeeperState } from 'electron-window-state';
import { inject, injectable } from 'inversify';
import { Menubar } from 'menubar';

import serviceIdentifier from '@services/serviceIdentifier';
import { windowDimension, WindowMeta, WindowNames } from '@services/windows/WindowProperties';

import { Channels, MetaDataChannel, ViewChannel, WindowChannel } from '@/constants/channels';
import type { IPreferenceService } from '@services/preferences/interface';
import type { IViewService } from '@services/view/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';

import { SETTINGS_FOLDER } from '@/constants/appPaths';
import { isTest } from '@/constants/environment';
import { DELAY_MENU_REGISTER } from '@/constants/parameters';
import { getDefaultTidGiUrl } from '@/constants/urls';
import { isMac } from '@/helpers/system';
import { container } from '@services/container';
import getViewBounds from '@services/libs/getViewBounds';
import { logger } from '@services/libs/log';
import type { IThemeService } from '@services/theme/interface';
import { getTidgiMiniWindowTargetWorkspace } from '@services/workspacesView/utilities';
import { handleAttachToTidgiMiniWindow } from './handleAttachToTidgiMiniWindow';
import { handleCreateBasicWindow } from './handleCreateBasicWindow';
import type { IWindowOpenConfig, IWindowService } from './interface';
import { registerBrowserViewWindowListeners } from './registerBrowserViewWindowListeners';
import { registerMenu } from './registerMenu';
import { getPreloadPath } from './viteEntry';

@injectable()
export class Window implements IWindowService {
  private readonly windows = new Map<WindowNames, BrowserWindow>();
  private windowMeta = {} as Partial<WindowMeta>;
  /** tidgi mini window version of main window, if user set attachToTidgiMiniWindow to true in preferences */
  private tidgiMiniWindowMenubar?: Menubar;

  constructor(
    @inject(serviceIdentifier.Preference) private readonly preferenceService: IPreferenceService,
    @inject(serviceIdentifier.ThemeService) private readonly themeService: IThemeService,
  ) {
    setTimeout(() => {
      void registerMenu();
    }, DELAY_MENU_REGISTER);
  }

  public async findInPage(text: string, forward?: boolean): Promise<void> {
    const contents = (await container.get<IViewService>(serviceIdentifier.View).getActiveBrowserView())?.webContents;
    if (contents !== undefined) {
      contents.findInPage(text, {
        forward,
      });
    }
  }

  public async stopFindInPage(close?: boolean, windowName: WindowNames = WindowNames.main): Promise<void> {
    const mainWindow = this.get(windowName);
    const view = await container.get<IViewService>(serviceIdentifier.View).getActiveBrowserView();

    if (view) {
      const contents = view.webContents;
      if (contents !== undefined) {
        contents.stopFindInPage('clearSelection');
        contents.send(ViewChannel.updateFindInPageMatches, 0, 0);
        // adjust bounds to hide the gap for find in page
        if (close === true && mainWindow !== undefined) {
          const contentSize = mainWindow.getContentSize();
          view.setBounds(await getViewBounds(contentSize as [number, number], { windowName }));
        }
      }
    }
  }

  public async requestRestart(): Promise<void> {
    app.relaunch();
    app.quit();
  }

  public get(windowName: WindowNames = WindowNames.main): BrowserWindow | undefined {
    if (windowName === WindowNames.tidgiMiniWindow) {
      return this.tidgiMiniWindowMenubar?.window;
    }
    return this.windows.get(windowName);
  }

  public set(windowName: WindowNames = WindowNames.main, win: BrowserWindow | undefined): void {
    if (win === undefined) {
      this.windows.delete(windowName);
    } else {
      this.windows.set(windowName, win);
    }
  }

  public async close(windowName: WindowNames): Promise<void> {
    this.get(windowName)?.close();
    // remove the window instance, let it GC
    this.windows.delete(windowName);
  }

  public async hide(windowName: WindowNames): Promise<void> {
    const windowToHide = this.get(windowName);
    if (windowToHide === undefined) {
      logger.error(`Window ${windowName} is not found`, { function: 'Window.hide' });
      return;
    }
    // https://github.com/electron/electron/issues/6033#issuecomment-242023295
    if (windowToHide.isFullScreen()) {
      windowToHide.once('leave-full-screen', () => {
        if (windowToHide !== undefined) {
          windowToHide.hide();
        }
      });
      windowToHide.setFullScreen(false);
    } else {
      windowToHide.hide();
    }
  }

  public async clearWindowsReference(): Promise<void> {
    // https://github.com/atom/electron/issues/444#issuecomment-76492576
    if (isMac && this.get(WindowNames.main) !== undefined) {
      // App force quit on MacOS, ask window not preventDefault
      await this.updateWindowMeta(WindowNames.main, { forceClose: true });
    }
    this.windows.clear();
  }

  public async isTidgiMiniWindowOpen(): Promise<boolean> {
    return this.tidgiMiniWindowMenubar?.window?.isVisible() ?? false;
  }

  public async open<N extends WindowNames>(windowName: N, meta?: WindowMeta[N], config?: IWindowOpenConfig<N>): Promise<undefined>;

  public async open<N extends WindowNames>(windowName: N, meta: WindowMeta[N] | undefined, config: IWindowOpenConfig<N> | undefined, returnWindow: true): Promise<BrowserWindow>;

  public async open<N extends WindowNames>(
    windowName: N,
    meta: WindowMeta[N] = {} as WindowMeta[N],
    config?: IWindowOpenConfig<N>,
    returnWindow?: boolean,
  ): Promise<undefined | BrowserWindow> {
    const { recreate = false, multiple = false } = config ?? {};
    const existedWindow = this.get(windowName);
    // update window meta
    await this.setWindowMeta(windowName, meta);
    const existedWindowMeta = await this.getWindowMeta(windowName);

    if (existedWindow !== undefined && !multiple) {
      if (recreate === true || (typeof recreate === 'function' && existedWindowMeta !== undefined && recreate(existedWindowMeta))) {
        existedWindow.close();
      } else {
        if (existedWindow.isMinimized()) {
          existedWindow.restore();
        }
        if (!isTest) {
          // Don't bring up window when running e2e test, otherwise it will annoy the developer who is doing other things.
          existedWindow.show();
        }
        // Realign workspace view when reopening window to ensure browser view is properly positioned
        // This fixes issue #626: white screen after hiding and reopening window
        const WindowWithBrowserView = [WindowNames.main, WindowNames.tidgiMiniWindow];
        if (WindowWithBrowserView.includes(windowName)) {
          await container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView).realignActiveWorkspace();
        }
        if (returnWindow === true) {
          return existedWindow;
        }
        return;
      }
    }

    // create new window
    const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);
    const { hideMenuBar: autoHideMenuBar, titleBar: showTitleBar, tidgiMiniWindowAlwaysOnTop, alwaysOnTop } = preferenceService.getPreferences();
    let windowWithBrowserViewConfig: Partial<BrowserWindowConstructorOptions> = {};
    let windowWithBrowserViewState: windowStateKeeperState | undefined;
    const WindowToKeepPositionState = [WindowNames.main, WindowNames.tidgiMiniWindow];
    const WindowWithBrowserView = [WindowNames.main, WindowNames.tidgiMiniWindow, WindowNames.secondary];
    const isWindowWithBrowserView = WindowWithBrowserView.includes(windowName);
    if (WindowToKeepPositionState.includes(windowName)) {
      windowWithBrowserViewState = windowStateKeeper({
        file: `window-state-${windowName}.json`,
        path: SETTINGS_FOLDER,
        defaultWidth: windowDimension[windowName].width,
        defaultHeight: windowDimension[windowName].height,
      });
      windowWithBrowserViewConfig = {
        x: windowWithBrowserViewState.x,
        y: windowWithBrowserViewState.y,
        width: windowWithBrowserViewState.width,
        height: windowWithBrowserViewState.height,
      };
    }
    // hide titleBar should not take effect on setting window
    const hideTitleBar = [WindowNames.main, WindowNames.tidgiMiniWindow].includes(windowName) && !showTitleBar;
    const windowConfig: BrowserWindowConstructorOptions = {
      ...windowDimension[windowName],
      ...windowWithBrowserViewConfig,
      resizable: true,
      maximizable: true,
      minimizable: true,
      fullscreenable: true,
      autoHideMenuBar,
      titleBarStyle: hideTitleBar ? 'hidden' : 'default',
      // https://www.electronjs.org/docs/latest/tutorial/custom-title-bar#add-native-window-controls-windows-linux
      ...(hideTitleBar && process.platform !== 'darwin' ? { titleBarOverlay: true } : {}),
      alwaysOnTop: windowName === WindowNames.tidgiMiniWindow ? tidgiMiniWindowAlwaysOnTop : alwaysOnTop,
      webPreferences: {
        devTools: true, // Always enable devTools, even in test mode for debugging
        nodeIntegration: false,
        webSecurity: false,
        allowRunningInsecureContent: true,
        contextIsolation: true,
        preload: getPreloadPath(),
        additionalArguments: [
          `${MetaDataChannel.browserViewMetaData}${windowName}`,
          `${MetaDataChannel.browserViewMetaData}${encodeURIComponent(JSON.stringify(meta))}`,
          '--unsafely-disable-devtools-self-xss-warnings',
        ],
      },
    };
    let newWindow: BrowserWindow;
    if (windowName === WindowNames.tidgiMiniWindow) {
      this.tidgiMiniWindowMenubar = await handleAttachToTidgiMiniWindow(windowConfig, windowWithBrowserViewState);
      if (this.tidgiMiniWindowMenubar.window === undefined) {
        throw new Error('TidgiMiniWindow failed to create window.');
      }
      newWindow = this.tidgiMiniWindowMenubar.window;
    } else {
      newWindow = await handleCreateBasicWindow(windowName, windowConfig, meta, config);
      if (isWindowWithBrowserView) {
        registerBrowserViewWindowListeners(newWindow, windowName);
        // calling this to redundantly setBounds WebContentsView
        // after the UI is fully loaded
        // if not, WebContentsView mouseover event won't work correctly
        // https://github.com/atomery/webcatalog/issues/812
        // await this.workspaceViewService.realignActiveWorkspace();
      } else {
        newWindow.setMenuBarVisibility(false);
      }
    }
    windowWithBrowserViewState?.manage(newWindow);
    if (returnWindow === true) {
      return newWindow;
    }
  }

  public async isFullScreen(windowName = WindowNames.main): Promise<boolean | undefined> {
    return this.windows.get(windowName)?.isFullScreen();
  }

  public async setWindowMeta<N extends WindowNames>(windowName: N, meta: WindowMeta[N]): Promise<void> {
    this.windowMeta[windowName] = meta;
  }

  public async updateWindowMeta<N extends WindowNames>(windowName: N, meta: WindowMeta[N]): Promise<void> {
    const newMeta = { ...this.windowMeta[windowName], ...meta };
    this.windowMeta[windowName] = newMeta;
  }

  public async getWindowMeta<N extends WindowNames>(windowName: N): Promise<WindowMeta[N] | undefined> {
    return this.windowMeta[windowName] as WindowMeta[N];
  }

  /**
   * When using `loadURL`, window meta will be clear. And we can only append meta to a new window. So we need to push meta to window after `loadURL`.
   */
  private async pushWindowMetaToWindow(win: BrowserWindow, meta: unknown): Promise<void> {
    win.webContents.send(MetaDataChannel.pushViewMetaData, meta);
  }

  /**
   * BroadCast message to all opened windows, so we can sync state to redux and make them take effect immediately
   * @param channel ipc channel to send
   * @param arguments_ any messages
   */
  public sendToAllWindows = async (channel: Channels, ...arguments_: unknown[]): Promise<void> => {
    const wins = BrowserWindow.getAllWindows();
    wins.forEach((win) => {
      win.webContents.send(channel, ...arguments_);
    });
  };

  public async goHome(): Promise<void> {
    const contents = (await container.get<IViewService>(serviceIdentifier.View).getActiveBrowserView())?.webContents;
    const activeWorkspace = await container.get<IWorkspaceService>(serviceIdentifier.Workspace).getActiveWorkspace();
    if (contents !== undefined && activeWorkspace !== undefined) {
      await contents.loadURL(getDefaultTidGiUrl(activeWorkspace.id));
      contents.send(WindowChannel.updateCanGoBack, contents.navigationHistory.canGoBack());
      contents.send(WindowChannel.updateCanGoForward, contents.navigationHistory.canGoForward());
    }
  }

  public async goBack(): Promise<void> {
    const contents = (await container.get<IViewService>(serviceIdentifier.View).getActiveBrowserView())?.webContents;
    if (contents?.navigationHistory.canGoBack() === true) {
      contents.navigationHistory.goBack();
      contents.send(WindowChannel.updateCanGoBack, contents.navigationHistory.canGoBack());
      contents.send(WindowChannel.updateCanGoForward, contents.navigationHistory.canGoForward());
    }
  }

  public async goForward(): Promise<void> {
    const contents = (await container.get<IViewService>(serviceIdentifier.View).getActiveBrowserView())?.webContents;
    if (contents?.navigationHistory.canGoForward() === true) {
      contents.navigationHistory.goForward();
      contents.send(WindowChannel.updateCanGoBack, contents.navigationHistory.canGoBack());
      contents.send(WindowChannel.updateCanGoForward, contents.navigationHistory.canGoForward());
    }
  }

  public async reload(windowName: WindowNames = WindowNames.main): Promise<void> {
    const win = this.get(windowName);
    if (win !== undefined) {
      await this.pushWindowMetaToWindow(win, this.windowMeta[windowName]);
    }
  }

  async loadURL(windowName: WindowNames, newUrl: string): Promise<void> {
    const win = this.get(windowName);
    if (win !== undefined) {
      await win.loadURL(newUrl);
      await this.pushWindowMetaToWindow(win, this.windowMeta[windowName]);
    }
  }

  public async clearStorageData(workspaceID: string, windowName: WindowNames = WindowNames.main): Promise<void> {
    const view = container.get<IViewService>(serviceIdentifier.View).getView(workspaceID, windowName);
    const session = view?.webContents.session;
    if (session !== undefined) {
      await session.clearStorageData();
      await session.clearAuthCache();
    }
  }

  public async maximize(): Promise<void> {
    const mainWindow = this.get(WindowNames.main);
    if (mainWindow !== undefined) {
      if (mainWindow.isMaximized()) {
        mainWindow.maximize();
      } else {
        mainWindow.unmaximize();
      }
    }
  }

  public async toggleTidgiMiniWindow(): Promise<void> {
    logger.info('toggleTidgiMiniWindow called', { function: 'toggleTidgiMiniWindow' });
    try {
      const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);

      const isOpen = await this.isTidgiMiniWindowOpen();
      logger.debug('TidgiMiniWindow open status checked', { function: 'toggleTidgiMiniWindow', isOpen });
      if (isOpen) {
        logger.info('Closing tidgi mini window', { function: 'toggleTidgiMiniWindow' });
        await this.closeTidgiMiniWindow();
      } else {
        const tidgiMiniWindow = await preferenceService.get('tidgiMiniWindow');
        logger.debug('tidgiMiniWindow preference checked', { function: 'toggleTidgiMiniWindow', tidgiMiniWindow });
        if (tidgiMiniWindow) {
          logger.info('Opening tidgi mini window', { function: 'toggleTidgiMiniWindow' });
          await this.openTidgiMiniWindow(true, true); // Explicitly show window when toggling
        } else {
          logger.warn('Cannot open tidgi mini window: tidgiMiniWindow preference is disabled', { function: 'toggleTidgiMiniWindow' });
        }
      }
    } catch (error) {
      logger.error('Failed to open/hide tidgi mini window', { error });
    }
  }

  public async openTidgiMiniWindow(enableIt = true, showWindow = true): Promise<void> {
    try {
      // Check if tidgi mini window is already enabled
      if (this.tidgiMiniWindowMenubar?.window !== undefined) {
        logger.debug('TidGi mini window is already enabled, bring it to front', { function: 'openTidgiMiniWindow' });
        if (showWindow) {
          // Before showing, get the target workspace
          const { shouldSync, targetWorkspaceId } = await getTidgiMiniWindowTargetWorkspace();

          logger.info('openTidgiMiniWindow: preparing to show window', {
            function: 'openTidgiMiniWindow',
            shouldSync,
            targetWorkspaceId,
          });

          // Ensure view exists for the target workspace before realigning
          if (targetWorkspaceId) {
            const targetWorkspace = await container.get<IWorkspaceService>(serviceIdentifier.Workspace).get(targetWorkspaceId);
            if (targetWorkspace && !targetWorkspace.pageType) {
              // This is a wiki workspace - ensure it has a view for tidgi mini window
              const viewService = container.get<IViewService>(serviceIdentifier.View);
              const existingView = viewService.getView(targetWorkspace.id, WindowNames.tidgiMiniWindow);
              if (!existingView) {
                logger.info('openTidgiMiniWindow: creating missing tidgi mini window view', {
                  function: 'openTidgiMiniWindow',
                  workspaceId: targetWorkspace.id,
                });
                await viewService.addView(targetWorkspace, WindowNames.tidgiMiniWindow);
              }
            }

            logger.info('openTidgiMiniWindow: calling realignActiveWorkspace', {
              function: 'openTidgiMiniWindow',
              targetWorkspaceId,
            });
            await container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView).realignActiveWorkspace(targetWorkspaceId);
            logger.info('openTidgiMiniWindow: realignActiveWorkspace completed', {
              function: 'openTidgiMiniWindow',
              targetWorkspaceId,
            });
          }

          // Use menuBar.showWindow() instead of direct window.show() for proper tidgi mini window behavior
          void this.tidgiMiniWindowMenubar.showWindow();
        }
        return;
      }

      // Create tidgi mini window (create and open when enableIt is true)
      await this.open(WindowNames.tidgiMiniWindow);
      if (enableIt) {
        logger.debug('TidGi mini window enabled', { function: 'openTidgiMiniWindow' });
        // After creating the tidgi mini window, show it if requested
        if (showWindow && this.tidgiMiniWindowMenubar) {
          logger.debug('Showing newly created tidgi mini window', { function: 'openTidgiMiniWindow' });
          void this.tidgiMiniWindowMenubar.showWindow();
        }
      }
    } catch (error) {
      logger.error('Failed to open tidgi mini window', { error, function: 'openTidgiMiniWindow' });
      throw error;
    }
  }

  public async closeTidgiMiniWindow(disableIt = false): Promise<void> {
    try {
      // Check if tidgi mini window exists
      if (this.tidgiMiniWindowMenubar === undefined) {
        logger.debug('TidGi mini window is already disabled', { function: 'closeTidgiMiniWindow' });
        return;
      }
      const menuBar = this.tidgiMiniWindowMenubar;
      if (disableIt) {
        // Fully destroy tidgi mini window: destroy window and tray, then clear reference
        if (menuBar.window) {
          // remove custom close listener so destroy will actually close
          menuBar.window.removeAllListeners('close');
          menuBar.window.destroy();
        }
        // hide app on mac if needed
        menuBar.app?.hide?.();
        if (menuBar.tray && !menuBar.tray.isDestroyed()) {
          menuBar.tray.destroy();
        }
        this.tidgiMiniWindowMenubar = undefined;
        logger.debug('TidGi mini window disabled successfully without restart', { function: 'closeTidgiMiniWindow' });
      } else {
        // Only hide the tidgi mini window (keep tray and instance for re-open)
        // Use menuBar.hideWindow() for proper tidgi mini window behavior
        menuBar.hideWindow();
        logger.debug('TidGi mini window closed (kept enabled)', { function: 'closeTidgiMiniWindow' });
      }
    } catch (error) {
      logger.error('Failed to close tidgi mini window', { error });
      throw error;
    }
  }

  public async updateWindowProperties(windowName: WindowNames, properties: { alwaysOnTop?: boolean }): Promise<void> {
    try {
      const window = this.get(windowName);
      if (window === undefined) {
        logger.warn(`Window ${windowName} not found for property update`);
        return;
      }

      if (properties.alwaysOnTop !== undefined) {
        window.setAlwaysOnTop(properties.alwaysOnTop);
        logger.info(`Updated ${windowName} alwaysOnTop to ${properties.alwaysOnTop}`);
      }

      // Handle tidgi mini window specific properties
      if (windowName === WindowNames.tidgiMiniWindow && this.tidgiMiniWindowMenubar?.window) {
        if (properties.alwaysOnTop !== undefined) {
          this.tidgiMiniWindowMenubar.window.setAlwaysOnTop(properties.alwaysOnTop);
        }
      }
    } catch (error) {
      logger.error(`Failed to update window properties for ${windowName}`, { error, properties });
      throw error;
    }
  }

  public async reactWhenPreferencesChanged(key: string, value: unknown): Promise<void> {
    switch (key) {
      case 'tidgiMiniWindow': {
        if (value) {
          // Enable tidgi mini window without showing the window; visibility controlled by toggle/shortcut
          await this.openTidgiMiniWindow(true, false);

          // After enabling tidgi mini window, create view for the current active workspace (if it's a wiki workspace)
          const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
          const viewService = container.get<IViewService>(serviceIdentifier.View);
          const activeWorkspace = await workspaceService.getActiveWorkspace();

          if (activeWorkspace && !activeWorkspace.pageType) {
            // This is a wiki workspace - ensure it has a view for tidgi mini window
            const existingView = viewService.getView(activeWorkspace.id, WindowNames.tidgiMiniWindow);
            if (!existingView) {
              await viewService.addView(activeWorkspace, WindowNames.tidgiMiniWindow);
            }
          }
        } else {
          await this.closeTidgiMiniWindow(true);
        }
        return;
      }
      case 'tidgiMiniWindowSyncWorkspaceWithMainWindow':
      case 'tidgiMiniWindowFixedWorkspaceId': {
        logger.info('Preference changed', { function: 'reactWhenPreferencesChanged', key, value: JSON.stringify(value) });

        // When switching to sync with main window, hide the sidebar
        if (key === 'tidgiMiniWindowSyncWorkspaceWithMainWindow' && value === true) {
          await this.preferenceService.set('tidgiMiniWindowShowSidebar', false);
        }

        // When tidgi mini window workspace settings change, hide all views and let the next window show trigger realignment
        const tidgiMiniWindow = this.get(WindowNames.tidgiMiniWindow);
        if (tidgiMiniWindow) {
          const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
          const viewService = container.get<IViewService>(serviceIdentifier.View);
          const allWorkspaces = await workspaceService.getWorkspacesAsList();
          logger.debug(`Hiding all tidgi mini window views (${allWorkspaces.length} workspaces)`, { function: 'reactWhenPreferencesChanged', key });
          // Hide all views - the correct view will be shown when window is next opened
          await Promise.all(
            allWorkspaces.map(async (workspace) => {
              const view = viewService.getView(workspace.id, WindowNames.tidgiMiniWindow);
              if (view) {
                await viewService.hideView(tidgiMiniWindow, WindowNames.tidgiMiniWindow, workspace.id);
              }
            }),
          );
          // View creation is handled by openTidgiMiniWindow when the window is shown
        } else {
          logger.warn('tidgiMiniWindow not found, skipping view management', { function: 'reactWhenPreferencesChanged', key });
        }
        return;
      }
      case 'tidgiMiniWindowAlwaysOnTop': {
        await this.updateWindowProperties(WindowNames.tidgiMiniWindow, { alwaysOnTop: value as boolean });
        return;
      }
      case 'tidgiMiniWindowShowTitleBar': {
        // Title bar style requires recreating the window
        // We need to fully destroy and recreate the tidgi mini window with new titleBar settings
        logger.info('tidgiMiniWindowShowTitleBar changed, recreating tidgi mini window', {
          function: 'reactWhenPreferencesChanged',
          newValue: value,
        });

        const wasVisible = await this.isTidgiMiniWindowOpen();
        logger.debug('Current tidgi mini window visibility', {
          function: 'reactWhenPreferencesChanged',
          wasVisible,
        });

        // Fully destroy current tidgi mini window (disableIt = true)
        await this.closeTidgiMiniWindow(true);
        logger.debug('Tidgi mini window destroyed', { function: 'reactWhenPreferencesChanged' });

        // Reopen tidgi mini window with new titleBar setting from updated preferences
        // enableIt = true to recreate, showWindow = wasVisible to restore visibility
        await this.openTidgiMiniWindow(true, wasVisible);
        logger.info('Tidgi mini window recreated with new titleBar setting', {
          function: 'reactWhenPreferencesChanged',
          showWindow: wasVisible,
        });
        return;
      }
      default:
        break;
    }
  }
}
