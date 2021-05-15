/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/consistent-type-assertions */
import { BrowserWindow, ipcMain, dialog, app, clipboard, BrowserWindowConstructorOptions } from 'electron';
import { injectable } from 'inversify';
import { Menubar } from 'menubar';
import windowStateKeeper, { State as windowStateKeeperState } from 'electron-window-state';

import { IBrowserViewMetaData, WindowNames, windowDimension, WindowMeta } from '@services/windows/WindowProperties';
import serviceIdentifier from '@services/serviceIdentifier';

import type { IPreferenceService } from '@services/preferences/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import type { IMenuService } from '@services/menu/interface';
import { Channels, WindowChannel, MetaDataChannel, ViewChannel } from '@/constants/channels';

import i18n from '@services/libs/i18n';
import getViewBounds from '@services/libs/getViewBounds';
import getFromRenderer from '@services/libs/getFromRenderer';
import { lazyInject } from '@services/container';
import handleAttachToMenuBar from './handleAttachToMenuBar';
import { IWindowService } from './interface';
import { isDevelopmentOrTest, isTest } from '@/constants/environment';

@injectable()
export class Window implements IWindowService {
  private windows = {} as Partial<Record<WindowNames, BrowserWindow | undefined>>;
  private windowMeta = {} as Partial<WindowMeta>;
  private mainWindowMenuBar?: Menubar;

  @lazyInject(serviceIdentifier.Preference) private readonly preferenceService!: IPreferenceService;
  @lazyInject(serviceIdentifier.Workspace) private readonly workspaceService!: IWorkspaceService;
  @lazyInject(serviceIdentifier.WorkspaceView) private readonly workspaceViewService!: IWorkspaceViewService;
  @lazyInject(serviceIdentifier.MenuService) private readonly menuService!: IMenuService;

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

  public async requestShowRequireRestartDialog(): Promise<void> {
    const availableWindowToShowDialog = this.get(WindowNames.preferences) ?? this.get(WindowNames.main);
    if (availableWindowToShowDialog !== undefined) {
      await dialog
        .showMessageBox(availableWindowToShowDialog, {
          type: 'question',
          buttons: [i18n.t('Dialog.RestartNow'), i18n.t('Dialog.Later')],
          message: i18n.t('Dialog.RestartMessage'),
          cancelId: 1,
        })
        .then(({ response }) => {
          if (response === 0) {
            app.relaunch();
            app.quit();
          }
        })
        .catch(console.error);
    }
  }

  public get(windowName: WindowNames = WindowNames.main): BrowserWindow | undefined {
    return this.windows[windowName];
  }

  public async close(windowName: WindowNames): Promise<void> {
    this.get(windowName)?.close();
  }

  public async open<N extends WindowNames>(
    windowName: N,
    meta: WindowMeta[N] = {} as WindowMeta[N],
    recreate?: boolean | ((windowMeta: WindowMeta[N]) => boolean),
  ): Promise<void> {
    const existedWindow = this.get(windowName);
    // update window meta
    await this.setWindowMeta(windowName, meta);
    const existedWindowMeta = await this.getWindowMeta(windowName);
    const attachToMenubar: boolean = await this.preferenceService.get('attachToMenubar');
    const titleBar: boolean = await this.preferenceService.get('titleBar');

    // handle existed window, bring existed window to the front and return.
    if (existedWindow !== undefined) {
      if (recreate === true || (typeof recreate === 'function' && existedWindowMeta !== undefined && recreate(existedWindowMeta))) {
        existedWindow.close();
      } else {
        return existedWindow.show();
      }
    }
    if (this.mainWindowMenuBar !== undefined && attachToMenubar) {
      this.mainWindowMenuBar.on('ready', () => {
        if (this.mainWindowMenuBar !== undefined) {
          void this.mainWindowMenuBar.showWindow();
        }
      });
      return;
    }

    // create new window
    let mainWindowConfig: Partial<BrowserWindowConstructorOptions> = {};
    let mainWindowState: windowStateKeeperState | undefined;
    const isMainWindow = windowName === WindowNames.main;
    if (isMainWindow) {
      if (attachToMenubar) {
        this.mainWindowMenuBar = await handleAttachToMenuBar();
        return;
      }

      mainWindowState = windowStateKeeper({
        defaultWidth: windowDimension[WindowNames.main].width,
        defaultHeight: windowDimension[WindowNames.main].height,
      });
      mainWindowConfig = {
        x: mainWindowState.x,
        y: mainWindowState.y,
        width: mainWindowState.width,
        height: mainWindowState.height,
      };
    }

    const newWindow = new BrowserWindow({
      ...windowDimension[windowName],
      ...mainWindowConfig,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      autoHideMenuBar: false,
      titleBarStyle: titleBar ? 'default' : 'hidden',
      webPreferences: {
        devTools: !isTest,
        nodeIntegration: false,
        enableRemoteModule: false,
        webSecurity: !isDevelopmentOrTest,
        allowRunningInsecureContent: false,
        contextIsolation: true,
        preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
        additionalArguments: [windowName, JSON.stringify(meta)],
      },
      parent: windowName === WindowNames.main || attachToMenubar ? undefined : this.get(WindowNames.main),
    });

    this.windows[windowName] = newWindow;
    if (isMainWindow) {
      mainWindowState?.manage(newWindow);
      this.registerMainWindowListeners(newWindow);
    } else {
      newWindow.setMenuBarVisibility(false);
    }
    const unregisterContextMenu = await this.menuService.initContextMenuForWindowWebContents(newWindow.webContents);
    newWindow.on('closed', () => {
      this.windows[windowName] = undefined;
      unregisterContextMenu();
    });
    let webContentLoadingPromise: Promise<void> | undefined;
    if (isMainWindow) {
      // handle window show and Webview/browserView show
      webContentLoadingPromise = new Promise<void>((resolve) => {
        newWindow.once('ready-to-show', async () => {
          const mainWindow = this.get(WindowNames.main);
          if (mainWindow === undefined) return;
          const { wasOpenedAsHidden } = app.getLoginItemSettings();
          if (!wasOpenedAsHidden) {
            mainWindow.show();
          }
          // calling this to redundantly setBounds BrowserView
          // after the UI is fully loaded
          // if not, BrowserView mouseover event won't work correctly
          // https://github.com/atomery/webcatalog/issues/812
          await this.workspaceViewService.realignActiveWorkspace();
          // ensure redux is loaded first
          // if not, redux might not be able catch changes sent from ipcMain
          if (!mainWindow.webContents.isLoading()) {
            return resolve();
          }
          mainWindow.webContents.once('did-stop-loading', () => {
            resolve();
          });
        });
      });
    }
    // This loading will wait for a while
    await newWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
    await webContentLoadingPromise;
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
      const mainWindow = this.get(WindowNames.main);
      if (mainWindow === undefined) return;
      if (process.platform === 'darwin' && (await this.getWindowMeta(WindowNames.main))?.forceClose !== true) {
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
      await contents.loadURL(activeWorkspace.homeUrl);
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
    await this.menuService.insertMenu('View', [
      { role: 'reload' },
      { role: 'forceReload' },
      // `role: 'zoom'` is only supported on macOS
      process.platform === 'darwin'
        ? {
            role: 'zoom',
          }
        : {
            label: 'Zoom',
            click: () => {
              const mainWindow = this.get(WindowNames.main);
              if (mainWindow !== undefined) {
                mainWindow.maximize();
              }
            },
          },
      { role: 'resetZoom' },
      { role: 'togglefullscreen' },
      { role: 'close' },
    ]);

    await this.menuService.insertMenu('View', [
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
    ]);

    await this.menuService.insertMenu('History', [
      {
        label: () => i18n.t('Menu.Home'),
        accelerator: 'Shift+CmdOrCtrl+H',
        click: async () => await this.goHome(),
        enabled: async () => (await this.workspaceService.countWorkspaces()) > 0,
      },
      {
        label: () => i18n.t('Menu.Back'),
        accelerator: 'CmdOrCtrl+[',
        click: async (_menuItem, browserWindow) => {
          // if back is called in popup window
          // navigate in the popup window instead
          if (browserWindow !== undefined) {
            // TODO: test if we really can get this isPopup value
            const { isPopup } = await getFromRenderer<IBrowserViewMetaData>(MetaDataChannel.getViewMetaData, browserWindow);
            if (isPopup === true) {
              browserWindow.webContents.goBack();
              return;
            }
          }
          ipcMain.emit('request-go-back');
        },
        enabled: async () => (await this.workspaceService.countWorkspaces()) > 0,
      },
      {
        label: () => i18n.t('Menu.Forward'),
        accelerator: 'CmdOrCtrl+]',
        click: async (_menuItem, browserWindow) => {
          // if back is called in popup window
          // navigate in the popup window instead
          if (browserWindow !== undefined) {
            const { isPopup } = await getFromRenderer<IBrowserViewMetaData>(MetaDataChannel.getViewMetaData, browserWindow);
            if (isPopup === true) {
              browserWindow.webContents.goBack();
              return;
            }
          }
          ipcMain.emit('request-go-forward');
        },
        enabled: async () => (await this.workspaceService.countWorkspaces()) > 0,
      },
      { type: 'separator' },
      {
        label: () => i18n.t('ContextMenu.CopyLink'),
        accelerator: 'CmdOrCtrl+L',
        click: async (_menuItem, browserWindow) => {
          // if back is called in popup window
          // copy the popup window URL instead
          if (browserWindow !== undefined) {
            const { isPopup } = await getFromRenderer<IBrowserViewMetaData>(MetaDataChannel.getViewMetaData, browserWindow);
            if (isPopup === true) {
              const url = browserWindow.webContents.getURL();
              clipboard.writeText(url);
              return;
            }
          }
          const mainWindow = this.get(WindowNames.main);
          const url = mainWindow?.getBrowserView()?.webContents?.getURL();
          if (typeof url === 'string') {
            clipboard.writeText(url);
          }
        },
        enabled: async () => (await this.workspaceService.countWorkspaces()) > 0,
      },
    ]);
  }
}
