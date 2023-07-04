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
import { IWindowService } from './interface';

@injectable()
export class Window implements IWindowService {
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
          view.setBounds(await getViewBounds(contentSize as [number, number]));
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

  public async open<N extends WindowNames>(
    windowName: N,
    meta: WindowMeta[N] = {} as WindowMeta[N],
    config?: {
      recreate?: boolean | ((windowMeta: WindowMeta[N]) => boolean);
    },
  ): Promise<void> {
    const { recreate = false } = config ?? {};
    const existedWindow = this.get(windowName);
    // update window meta
    await this.setWindowMeta(windowName, meta);
    const existedWindowMeta = await this.getWindowMeta(windowName);

    if (existedWindow !== undefined) {
      if (recreate === true || (typeof recreate === 'function' && existedWindowMeta !== undefined && recreate(existedWindowMeta))) {
        existedWindow.close();
      } else {
        existedWindow.show();
        return;
      }
    }

    // create new window
    let windowWithBrowserViewConfig: Partial<BrowserWindowConstructorOptions> = {};
    let windowWithBrowserViewState: windowStateKeeperState | undefined;
    const isWindowWithBrowserView = windowName === WindowNames.main || windowName === WindowNames.menuBar;
    if (isWindowWithBrowserView) {
      windowWithBrowserViewState = windowStateKeeper({
        file: windowName === WindowNames.main ? 'window-state-main-window.json' : 'window-state-menubar.json',
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
      autoHideMenuBar: false,
      // hide titleBar should not take effect on setting window
      titleBarStyle: ![WindowNames.main, WindowNames.menuBar].includes(windowName) || (await this.preferenceService.get('titleBar')) ? 'default' : 'hidden',
      alwaysOnTop: windowName === WindowNames.menuBar ? await this.preferenceService.get('menuBarAlwaysOnTop') : await this.preferenceService.get('alwaysOnTop'),
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
      newWindow = await this.handleCreateBasicWindow(windowName, windowConfig);
      if (isWindowWithBrowserView) {
        this.registerMainWindowListeners(newWindow);
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
  }

  private async handleCreateBasicWindow(windowName: WindowNames, windowConfig: BrowserWindowConstructorOptions): Promise<BrowserWindow> {
    const newWindow = new BrowserWindow(windowConfig);

    this.windows[windowName] = newWindow;

    const unregisterContextMenu = await this.menuService.initContextMenuForWindowWebContents(newWindow.webContents);
    newWindow.on('closed', () => {
      this.windows[windowName] = undefined;
      unregisterContextMenu();
    });
    let webContentLoadingPromise: Promise<void> | undefined;
    if (windowName === WindowNames.main) {
      // handle window show and Webview/browserView show
      webContentLoadingPromise = new Promise<void>((resolve) => {
        newWindow.once('ready-to-show', async () => {
          const mainWindow = this.get(WindowNames.main);
          if (mainWindow === undefined) return;
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
    // This loading will wait for a while
    await newWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
    await webContentLoadingPromise;
    return newWindow;
  }

  private registerMainWindowListeners(newWindow: BrowserWindow): void {
    // Enable swipe to navigate
    void this.preferenceService.get('swipeToNavigate').then((swipeToNavigate) => {
      if (swipeToNavigate) {
        const mainWindow = this.get(WindowNames.main);
        if (mainWindow === undefined) return;
        mainWindow.on('swipe', (_event, direction) => {
          const view = mainWindow?.getBrowserView();
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
      const mainWindow = this.get(WindowNames.main);
      if (mainWindow === undefined) return;
      if (isMac && windowMeta?.forceClose !== true) {
        event.preventDefault();
        // https://github.com/electron/electron/issues/6033#issuecomment-242023295
        if (mainWindow.isFullScreen()) {
          mainWindow.once('leave-full-screen', () => {
            const mainWindow = this.get(WindowNames.main);
            if (mainWindow !== undefined) {
              mainWindow.hide();
            }
          });
          mainWindow.setFullScreen(false);
        } else {
          mainWindow.hide();
        }
      }
    });

    newWindow.on('focus', () => {
      const mainWindow = this.get(WindowNames.main);
      if (mainWindow === undefined) return;
      const view = mainWindow?.getBrowserView();
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      view?.webContents?.focus();
    });

    newWindow.on('enter-full-screen', async () => {
      const mainWindow = this.get(WindowNames.main);
      if (mainWindow === undefined) return;
      mainWindow?.webContents.send('is-fullscreen-updated', true);
      await this.workspaceViewService.realignActiveWorkspace();
    });
    newWindow.on('leave-full-screen', async () => {
      const mainWindow = this.get(WindowNames.main);
      if (mainWindow === undefined) return;
      mainWindow?.webContents.send('is-fullscreen-updated', false);
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
    this.windowMeta[windowName] = { ...this.windowMeta[windowName], ...meta };
  }

  public async getWindowMeta<N extends WindowNames>(windowName: N): Promise<WindowMeta[N] | undefined> {
    return this.windowMeta[windowName] as WindowMeta[N];
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
    win?.getBrowserView()?.webContents?.reload();
  }

  async loadURL(windowName: WindowNames, newUrl: string): Promise<void> {
    const win = this.get(windowName);
    await win?.loadURL(newUrl);
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
              view?.setBounds(await getViewBounds(contentSize as [number, number], true));
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
