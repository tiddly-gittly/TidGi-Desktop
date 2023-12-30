/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/consistent-type-assertions */
import { app, BrowserWindow, BrowserWindowConstructorOptions, ipcMain, Menu, nativeImage, Tray } from 'electron';
import windowStateKeeper, { State as windowStateKeeperState } from 'electron-window-state';
import { injectable } from 'inversify';
import mergeDeep from 'lodash/merge';
import { Menubar, menubar } from 'menubar';

import serviceIdentifier from '@services/serviceIdentifier';
import { IBrowserViewMetaData, windowDimension, WindowMeta, WindowNames } from '@services/windows/WindowProperties';

import { Channels, MetaDataChannel, ViewChannel, WindowChannel } from '@/constants/channels';
import type { IMenuService } from '@services/menu/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';

import { SETTINGS_FOLDER } from '@/constants/appPaths';
import { isTest } from '@/constants/environment';
import { MENUBAR_ICON_PATH } from '@/constants/paths';
import { getDefaultTidGiUrl } from '@/constants/urls';
import { isMac } from '@/helpers/system';
import { lazyInject } from '@services/container';
import getFromRenderer from '@services/libs/getFromRenderer';
import getViewBounds from '@services/libs/getViewBounds';
import { i18n } from '@services/libs/i18n';
import { logger } from '@services/libs/log';
import { IThemeService } from '@services/theme/interface';
import { debounce } from 'lodash';
import { IWindowOpenConfig, IWindowService } from './interface';

@injectable()
export class Window implements IWindowService {
  // TODO: use WeakMap instead
  private windows = {} as Partial<Record<WindowNames, BrowserWindow | undefined>>;
  private windowMeta = {} as Partial<WindowMeta>;
  /** menubar version of main window, if user set openInMenubar to true in preferences */
  private mainWindowMenuBar?: Menubar;

  @lazyInject(serviceIdentifier.Preference)
  private readonly preferenceService!: IPreferenceService;

  @lazyInject(serviceIdentifier.Workspace)
  private readonly workspaceService!: IWorkspaceService;

  @lazyInject(serviceIdentifier.WorkspaceView)
  private readonly workspaceViewService!: IWorkspaceViewService;

  @lazyInject(serviceIdentifier.MenuService)
  private readonly menuService!: IMenuService;

  @lazyInject(serviceIdentifier.ThemeService)
  private readonly themeService!: IThemeService;

  constructor() {
    void this.registerMenu();
  }

  public async findInPage(text: string, forward?: boolean, windowName: WindowNames = WindowNames.main): Promise<void> {
    const mainWindow = this.get(windowName);
    const contents = mainWindow?.getBrowserView()?.webContents;
    if (contents !== undefined) {
      contents.findInPage(text, {
        forward,
      });
    }
  }

  public async stopFindInPage(close?: boolean, windowName: WindowNames = WindowNames.main): Promise<void> {
    const mainWindow = this.get(windowName);
    const view = mainWindow?.getBrowserView();
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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
    return this.windows[windowName];
  }

  public async close(windowName: WindowNames): Promise<void> {
    this.get(windowName)?.close();
    if (windowName === WindowNames.menuBar) {
      this.mainWindowMenuBar?.app?.hide?.();
    }
  }

  public async isMenubarOpen(): Promise<boolean> {
    return this.mainWindowMenuBar?.window?.isFocused?.() ?? false;
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
        existedWindow.show();
        if (returnWindow === true) {
          return existedWindow;
        }
        return;
      }
    }

    // create new window
    const { hideMenuBar: autoHideMenuBar, titleBar: showTitleBar, menuBarAlwaysOnTop, alwaysOnTop } = await this.preferenceService.getPreferences();
    let windowWithBrowserViewConfig: Partial<BrowserWindowConstructorOptions> = {};
    let windowWithBrowserViewState: windowStateKeeperState | undefined;
    const WindowToKeepPositionState = [WindowNames.main, WindowNames.menuBar];
    const WindowWithBrowserView = [WindowNames.main, WindowNames.menuBar, WindowNames.secondary];
    const isWindowWithBrowserView = WindowWithBrowserView.includes(windowName);
    if (WindowToKeepPositionState.includes(windowName)) {
      windowWithBrowserViewState = windowStateKeeper({
        file: `window-state-${windowName}.json`,
        path: SETTINGS_FOLDER,
        defaultWidth: windowDimension[WindowNames.main].width,
        defaultHeight: windowDimension[WindowNames.main].height,
      });
      windowWithBrowserViewConfig = {
        x: windowWithBrowserViewState.x,
        y: windowWithBrowserViewState.y,
        width: windowWithBrowserViewState.width,
        height: windowWithBrowserViewState.height,
      };
    }
    const windowConfig: BrowserWindowConstructorOptions = {
      ...windowDimension[windowName],
      ...windowWithBrowserViewConfig,
      resizable: true,
      maximizable: true,
      minimizable: true,
      fullscreenable: true,
      autoHideMenuBar,
      // hide titleBar should not take effect on setting window
      titleBarStyle: (![WindowNames.main, WindowNames.menuBar].includes(windowName) || showTitleBar) ? 'default' : 'hidden',
      alwaysOnTop: windowName === WindowNames.menuBar ? menuBarAlwaysOnTop : alwaysOnTop,
      webPreferences: {
        devTools: !isTest,
        nodeIntegration: false,
        webSecurity: false,
        allowRunningInsecureContent: true,
        contextIsolation: true,
        preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
        additionalArguments: [
          `${MetaDataChannel.browserViewMetaData}${windowName}`,
          `${MetaDataChannel.browserViewMetaData}${encodeURIComponent(JSON.stringify(meta))}`,
        ],
      },
      parent: isWindowWithBrowserView ? undefined : this.get(WindowNames.main),
    };
    let newWindow: BrowserWindow;
    if (windowName === WindowNames.menuBar) {
      this.mainWindowMenuBar = await this.handleAttachToMenuBar(windowConfig, windowWithBrowserViewState);
      if (this.mainWindowMenuBar.window === undefined) {
        throw new Error('MenuBar failed to create window.');
      }
      newWindow = this.mainWindowMenuBar.window;
    } else {
      newWindow = await this.handleCreateBasicWindow(windowName, windowConfig, meta, config);
      if (isWindowWithBrowserView) {
        this.registerBrowserViewWindowListeners(newWindow, windowName);
        // calling this to redundantly setBounds BrowserView
        // after the UI is fully loaded
        // if not, BrowserView mouseover event won't work correctly
        // https://github.com/atomery/webcatalog/issues/812
        await this.workspaceViewService.realignActiveWorkspace();
      } else {
        newWindow.setMenuBarVisibility(false);
      }
    }
    windowWithBrowserViewState?.manage(newWindow);
    if (returnWindow === true) {
      return newWindow;
    }
  }

  private async handleCreateBasicWindow<N extends WindowNames>(
    windowName: N,
    windowConfig: BrowserWindowConstructorOptions,
    windowMeta: WindowMeta[N] = {} as WindowMeta[N],
    config?: IWindowOpenConfig<N>,
  ): Promise<BrowserWindow> {
    const newWindow = new BrowserWindow(windowConfig);
    const newWindowURL = (windowMeta !== undefined && 'uri' in windowMeta ? windowMeta.uri : undefined) ?? MAIN_WINDOW_WEBPACK_ENTRY;
    if (config?.multiple !== true) {
      this.windows[windowName] = newWindow;
    }

    const unregisterContextMenu = await this.menuService.initContextMenuForWindowWebContents(newWindow.webContents);
    newWindow.on('closed', () => {
      this.windows[windowName] = undefined;
      unregisterContextMenu();
    });
    let webContentLoadingPromise: Promise<void> | undefined;
    if (windowName === WindowNames.main) {
      // handle window show and Webview/browserView show
      webContentLoadingPromise = new Promise<void>((resolve, reject) => {
        newWindow.once('ready-to-show', async () => {
          const mainWindow = this.get(WindowNames.main);
          if (mainWindow === undefined) {
            reject(new Error("Main window is undefined in newWindow.once('ready-to-show'"));
            return;
          }
          const { wasOpenedAsHidden } = app.getLoginItemSettings();
          if (!wasOpenedAsHidden) {
            mainWindow.show();
          }
          // ensure redux is loaded first
          // if not, redux might not be able catch changes sent from ipcMain
          if (!mainWindow.webContents.isLoading()) {
            resolve();
            return;
          }
          mainWindow.webContents.once('did-stop-loading', () => {
            resolve();
          });
        });
      });
    }
    await this.updateWindowBackground(newWindow);
    // Not loading main window (like sidebar and background) here. Only load wiki in browserView in the secondary window.
    const isWindowToLoadURL = windowName !== WindowNames.secondary;
    if (isWindowToLoadURL) {
      // This loading will wait for a while
      await newWindow.loadURL(newWindowURL);
    }
    await webContentLoadingPromise;
    return newWindow;
  }

  private registerBrowserViewWindowListeners(newWindow: BrowserWindow, windowName: WindowNames): void {
    // Enable swipe to navigate
    void this.preferenceService.get('swipeToNavigate').then((swipeToNavigate) => {
      if (swipeToNavigate) {
        if (newWindow === undefined) return;
        newWindow.on('swipe', (_event, direction) => {
          const view = newWindow?.getBrowserView();
          // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
          if (view) {
            if (direction === 'left') {
              view.webContents.goBack();
            } else if (direction === 'right') {
              view.webContents.goForward();
            }
          }
        });
      }
    });
    // Hide window instead closing on macos
    newWindow.on('close', async (event) => {
      const windowMeta = await this.getWindowMeta(WindowNames.main);
      if (newWindow === undefined) return;
      if (isMac && windowMeta?.forceClose !== true) {
        event.preventDefault();
        // https://github.com/electron/electron/issues/6033#issuecomment-242023295
        if (newWindow.isFullScreen()) {
          newWindow.once('leave-full-screen', () => {
            if (newWindow !== undefined) {
              newWindow.hide();
            }
          });
          newWindow.setFullScreen(false);
        } else {
          newWindow.hide();
        }
      }
    });

    newWindow.on('focus', () => {
      if (newWindow === undefined) return;
      const view = newWindow?.getBrowserView();
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      view?.webContents?.focus();
    });

    newWindow.on('enter-full-screen', async () => {
      const mainWindow = this.get(windowName);
      if (mainWindow === undefined) return;
      mainWindow?.webContents?.send?.('is-fullscreen-updated', true);
      await this.workspaceViewService.realignActiveWorkspace();
    });
    newWindow.on('leave-full-screen', async () => {
      const mainWindow = this.get(windowName);
      if (mainWindow === undefined) return;
      mainWindow?.webContents?.send?.('is-fullscreen-updated', false);
      await this.workspaceViewService.realignActiveWorkspace();
    });
  }

  public async isFullScreen(windowName = WindowNames.main): Promise<boolean | undefined> {
    return this.windows[windowName]?.isFullScreen();
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
  private async pushWindowMetaToWindow<N extends WindowNames>(win: BrowserWindow, meta: WindowMeta[N]): Promise<void> {
    win?.webContents?.send?.(MetaDataChannel.pushViewMetaData, meta);
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

  public async goHome(windowName: WindowNames = WindowNames.main): Promise<void> {
    const win = this.get(windowName);
    const contents = win?.getBrowserView()?.webContents;
    const activeWorkspace = await this.workspaceService.getActiveWorkspace();
    if (contents !== undefined && activeWorkspace !== undefined && win !== undefined) {
      await contents.loadURL(getDefaultTidGiUrl(activeWorkspace.id));
      contents.send(WindowChannel.updateCanGoBack, contents.canGoBack());
      contents.send(WindowChannel.updateCanGoForward, contents.canGoForward());
    }
  }

  public async goBack(windowName: WindowNames = WindowNames.main): Promise<void> {
    const win = this.get(windowName);
    const contents = win?.getBrowserView()?.webContents;
    if (contents?.canGoBack() === true) {
      contents.goBack();
      contents.send(WindowChannel.updateCanGoBack, contents.canGoBack());
      contents.send(WindowChannel.updateCanGoForward, contents.canGoForward());
    }
  }

  public async goForward(windowName: WindowNames = WindowNames.main): Promise<void> {
    const win = this.get(windowName);
    const contents = win?.getBrowserView()?.webContents;
    if (contents?.canGoForward() === true) {
      contents.goForward();
      contents.send(WindowChannel.updateCanGoBack, contents.canGoBack());
      contents.send(WindowChannel.updateCanGoForward, contents.canGoForward());
    }
  }

  public async reload(windowName: WindowNames = WindowNames.main): Promise<void> {
    const win = this.get(windowName);
    if (win !== undefined) {
      win.getBrowserView()?.webContents?.reload?.();
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

  public async clearStorageData(windowName: WindowNames = WindowNames.main): Promise<void> {
    const win = this.get(windowName);
    const session = win?.getBrowserView()?.webContents?.session;
    if (session !== undefined) {
      await session.clearStorageData();
      await session.clearAuthCache();
    }
  }

  private async registerMenu(): Promise<void> {
    await this.menuService.insertMenu('Window', [
      // `role: 'zoom'` is only supported on macOS
      isMac
        ? {
          role: 'zoom',
        }
        : {
          label: 'Zoom',
          click: async () => {
            await this.maximize();
          },
        },
      { role: 'resetZoom' },
      { role: 'togglefullscreen' },
      { role: 'close' },
    ]);

    await this.menuService.insertMenu(
      'View',
      [
        {
          label: () => i18n.t('Menu.Find'),
          accelerator: 'CmdOrCtrl+F',
          click: async () => {
            const mainWindow = this.get(WindowNames.main);
            if (mainWindow !== undefined) {
              mainWindow.webContents.focus();
              mainWindow.webContents.send(WindowChannel.openFindInPage);
              const contentSize = mainWindow.getContentSize();
              const view = mainWindow.getBrowserView();
              view?.setBounds(await getViewBounds(contentSize as [number, number], { findInPage: true }));
            }
          },
          enabled: async () => (await this.workspaceService.countWorkspaces()) > 0,
        },
        {
          label: () => i18n.t('Menu.FindNext'),
          accelerator: 'CmdOrCtrl+G',
          click: () => {
            const mainWindow = this.get(WindowNames.main);
            mainWindow?.webContents?.send('request-back-find-in-page', true);
          },
          enabled: async () => (await this.workspaceService.countWorkspaces()) > 0,
        },
        {
          label: () => i18n.t('Menu.FindPrevious'),
          accelerator: 'Shift+CmdOrCtrl+G',
          click: () => {
            const mainWindow = this.get(WindowNames.main);
            mainWindow?.webContents?.send('request-back-find-in-page', false);
          },
          enabled: async () => (await this.workspaceService.countWorkspaces()) > 0,
        },
        {
          label: () => `${i18n.t('Preference.AlwaysOnTop')} (${i18n.t('Preference.RequireRestart')})`,
          checked: async () => await this.preferenceService.get('alwaysOnTop'),
          click: async () => {
            const alwaysOnTop = await this.preferenceService.get('alwaysOnTop');
            await this.preferenceService.set('alwaysOnTop', !alwaysOnTop);
            await this.requestRestart();
          },
        },
      ],
      // eslint-disable-next-line unicorn/no-null
      null,
      true,
    );

    await this.menuService.insertMenu('History', [
      {
        label: () => i18n.t('Menu.Home'),
        accelerator: 'Shift+CmdOrCtrl+H',
        click: async () => {
          await this.goHome();
        },
        enabled: async () => (await this.workspaceService.countWorkspaces()) > 0,
      },
      {
        label: () => i18n.t('ContextMenu.Back'),
        accelerator: 'CmdOrCtrl+[',
        click: async (_menuItem, browserWindow) => {
          // if back is called in popup window
          // navigate in the popup window instead
          if (browserWindow !== undefined) {
            // TODO: test if we really can get this isPopup value
            const { isPopup = false } = await getFromRenderer<IBrowserViewMetaData>(MetaDataChannel.getViewMetaData, browserWindow);
            await this.goBack(isPopup ? WindowNames.menuBar : WindowNames.main);
          }
          ipcMain.emit('request-go-back');
        },
        enabled: async () => (await this.workspaceService.countWorkspaces()) > 0,
      },
      {
        label: () => i18n.t('ContextMenu.Forward'),
        accelerator: 'CmdOrCtrl+]',
        click: async (_menuItem, browserWindow) => {
          // if back is called in popup window
          // navigate in the popup window instead
          if (browserWindow !== undefined) {
            const { isPopup = false } = await getFromRenderer<IBrowserViewMetaData>(MetaDataChannel.getViewMetaData, browserWindow);
            await this.goForward(isPopup ? WindowNames.menuBar : WindowNames.main);
          }
          ipcMain.emit('request-go-forward');
        },
        enabled: async () => (await this.workspaceService.countWorkspaces()) > 0,
      },
    ]);
  }

  private async handleAttachToMenuBar(windowConfig: BrowserWindowConstructorOptions, windowWithBrowserViewState: windowStateKeeper.State | undefined): Promise<Menubar> {
    // setImage after Tray instance is created to avoid
    // "Segmentation fault (core dumped)" bug on Linux
    // https://github.com/electron/electron/issues/22137#issuecomment-586105622
    // https://github.com/atomery/translatium/issues/164
    const tray = new Tray(nativeImage.createEmpty());
    // icon template is not supported on Windows & Linux
    tray.setImage(MENUBAR_ICON_PATH);

    const menuBar = menubar({
      index: MAIN_WINDOW_WEBPACK_ENTRY,
      tray,
      activateWithApp: false,
      preloadWindow: true,
      tooltip: i18n.t('Menu.TidGiMenuBar'),
      browserWindow: mergeDeep(windowConfig, {
        show: false,
        minHeight: 100,
        minWidth: 250,
      }),
    });

    menuBar.on('after-create-window', () => {
      if (menuBar.window !== undefined) {
        menuBar.window.on('focus', () => {
          logger.debug('restore window position');
          if (windowWithBrowserViewState === undefined) {
            logger.debug('windowWithBrowserViewState is undefined for menuBar');
          } else {
            if (menuBar.window === undefined) {
              logger.debug('menuBar.window is undefined');
            } else {
              menuBar.window.setPosition(windowWithBrowserViewState.x, windowWithBrowserViewState.y, false);
              menuBar.window.setSize(windowWithBrowserViewState.width, windowWithBrowserViewState.height, false);
            }
          }
          const view = menuBar.window?.getBrowserView();
          if (view?.webContents !== undefined) {
            view.webContents.focus();
          }
        });
        menuBar.window.removeAllListeners('close');
        menuBar.window.on('close', (event) => {
          event.preventDefault();
          menuBar.hideWindow();
        });
      }
    });
    // https://github.com/maxogden/menubar/issues/120
    menuBar.on('after-hide', () => {
      if (isMac) {
        menuBar.app.hide();
      }
    });

    // manually save window state https://github.com/mawie81/electron-window-state/issues/64
    const debouncedSaveWindowState = debounce(
      (event: { sender: BrowserWindow }) => {
        windowWithBrowserViewState?.saveState(event.sender);
      },
      500,
    );
    // menubar is hide, not close, so not managed by windowStateKeeper, need to save manually
    menuBar.window?.on('resize', debouncedSaveWindowState);
    menuBar.window?.on('move', debouncedSaveWindowState);

    return await new Promise<Menubar>((resolve) => {
      menuBar.on('ready', async () => {
        // right on tray icon
        menuBar.tray.on('right-click', () => {
          // TODO: restore updater options here
          const contextMenu = Menu.buildFromTemplate([
            {
              label: i18n.t('ContextMenu.OpenTidGi'),
              click: async () => {
                await this.open(WindowNames.main);
              },
            },
            {
              label: i18n.t('ContextMenu.OpenTidGiMenuBar'),
              click: async () => {
                await menuBar.showWindow();
              },
            },
            {
              type: 'separator',
            },
            {
              label: i18n.t('ContextMenu.About'),
              click: async () => {
                await this.open(WindowNames.about);
              },
            },
            { type: 'separator' },
            {
              label: i18n.t('ContextMenu.Preferences'),
              click: async () => {
                await this.open(WindowNames.preferences);
              },
            },
            {
              label: i18n.t('ContextMenu.Notifications'),
              click: async () => {
                await this.open(WindowNames.notifications);
              },
            },
            { type: 'separator' },
            {
              label: i18n.t('ContextMenu.Quit'),
              click: () => {
                menuBar.app.quit();
              },
            },
          ]);

          menuBar.tray.popUpContextMenu(contextMenu);
        });

        // right click on window content
        if (menuBar.window?.webContents !== undefined) {
          const unregisterContextMenu = await this.menuService.initContextMenuForWindowWebContents(menuBar.window.webContents);
          menuBar.on('after-close', () => {
            unregisterContextMenu();
          });
        }

        resolve(menuBar);
      });
    });
  }

  private async updateWindowBackground(newWindow: BrowserWindow): Promise<void> {
    if (await this.themeService.shouldUseDarkColors()) {
      newWindow.setBackgroundColor('#000000');
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
}
