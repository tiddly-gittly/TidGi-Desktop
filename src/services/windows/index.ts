import { app, BrowserWindow, BrowserWindowConstructorOptions } from 'electron';
import windowStateKeeper, { State as windowStateKeeperState } from 'electron-window-state';
import { inject, injectable } from 'inversify';
import { Menubar } from 'menubar';

import serviceIdentifier from '@services/serviceIdentifier';
import { windowDimension, WindowMeta, WindowNames } from '@services/windows/WindowProperties';

import { Channels, MetaDataChannel, ViewChannel, WindowChannel } from '@/constants/channels';
import type { IPreferenceService } from '@services/preferences/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';

import { SETTINGS_FOLDER } from '@/constants/appPaths';
import { isTest } from '@/constants/environment';
import { DELAY_MENU_REGISTER } from '@/constants/parameters';
import { getDefaultTidGiUrl } from '@/constants/urls';
import { isMac } from '@/helpers/system';
import { container } from '@services/container';
import getViewBounds from '@services/libs/getViewBounds';
import { logger } from '@services/libs/log';
import type { IThemeService } from '@services/theme/interface';
import type { IViewService } from '@services/view/interface';
import { handleAttachToMenuBar } from './handleAttachToMenuBar';
import { handleCreateBasicWindow } from './handleCreateBasicWindow';
import type { IWindowOpenConfig, IWindowService } from './interface';
import { registerBrowserViewWindowListeners } from './registerBrowserViewWindowListeners';
import { registerMenu } from './registerMenu';
import { getPreloadPath } from './viteEntry';

@injectable()
export class Window implements IWindowService {
  private readonly windows = new Map<WindowNames, BrowserWindow>();
  private windowMeta = {} as Partial<WindowMeta>;
  /** menubar version of main window, if user set openInMenubar to true in preferences */
  private mainWindowMenuBar?: Menubar;

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
    if (windowName === WindowNames.menuBar) {
      return this.mainWindowMenuBar?.window;
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

  public async isMenubarOpen(): Promise<boolean> {
    return this.mainWindowMenuBar?.window?.isFocused() ?? false;
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
        if (returnWindow === true) {
          return existedWindow;
        }
        return;
      }
    }

    // create new window
    const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);
    const { hideMenuBar: autoHideMenuBar, titleBar: showTitleBar, menuBarAlwaysOnTop, alwaysOnTop } = preferenceService.getPreferences();
    let windowWithBrowserViewConfig: Partial<BrowserWindowConstructorOptions> = {};
    let windowWithBrowserViewState: windowStateKeeperState | undefined;
    const WindowToKeepPositionState = [WindowNames.main, WindowNames.menuBar];
    const WindowWithBrowserView = [WindowNames.main, WindowNames.menuBar, WindowNames.secondary];
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
    const hideTitleBar = [WindowNames.main, WindowNames.menuBar].includes(windowName) && !showTitleBar;
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
      alwaysOnTop: windowName === WindowNames.menuBar ? menuBarAlwaysOnTop : alwaysOnTop,
      webPreferences: {
        devTools: !isTest,
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
      parent: isWindowWithBrowserView ? undefined : this.get(WindowNames.main),
    };
    let newWindow: BrowserWindow;
    if (windowName === WindowNames.menuBar) {
      this.mainWindowMenuBar = await handleAttachToMenuBar(windowConfig, windowWithBrowserViewState);
      if (this.mainWindowMenuBar.window === undefined) {
        throw new Error('MenuBar failed to create window.');
      }
      newWindow = this.mainWindowMenuBar.window;
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

  public async toggleMenubarWindow(): Promise<void> {
    try {
      const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);

      const isOpen = await this.isMenubarOpen();
      if (isOpen) {
        await this.disableMenubarWindow();
      } else {
        const attachToMenubar = await preferenceService.get('attachToMenubar');
        if (attachToMenubar) {
          await this.enableMenubarWindow();
        } else {
          logger.warn('Cannot open menubar window: attachToMenubar preference is disabled', { function: 'toggleMenubarWindow' });
        }
      }
    } catch (error) {
      logger.error('Failed to open/hide menubar window', { error });
    }
  }

  public async enableMenubarWindow(): Promise<void> {
    try {
      // Check if menubar is already enabled
      if (this.mainWindowMenuBar !== undefined) {
        logger.debug('Menubar is already enabled');
        return;
      }

      // Create menubar window
      await this.open(WindowNames.menuBar);
      logger.info('Menubar enabled successfully without restart');
    } catch (error) {
      logger.error('Failed to enable menubar', { error });
      throw error;
    }
  }

  public async disableMenubarWindow(): Promise<void> {
    try {
      // Check if menubar exists
      if (this.mainWindowMenuBar === undefined) {
        logger.debug('Menubar is already disabled');
        return;
      }

      // Close menubar window and clean up
      await this.close(WindowNames.menuBar);

      // Clean up tray icon
      if (this.mainWindowMenuBar.tray && !this.mainWindowMenuBar.tray.isDestroyed()) {
        this.mainWindowMenuBar.tray.destroy();
      }

      this.mainWindowMenuBar = undefined;
      logger.info('Menubar disabled successfully without restart');
    } catch (error) {
      logger.error('Failed to disable menubar', { error });
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

      // Handle menubar specific properties
      if (windowName === WindowNames.menuBar && this.mainWindowMenuBar?.window) {
        if (properties.alwaysOnTop !== undefined) {
          this.mainWindowMenuBar.window.setAlwaysOnTop(properties.alwaysOnTop);
        }
      }
    } catch (error) {
      logger.error(`Failed to update window properties for ${windowName}`, { error, properties });
      throw error;
    }
  }
}
