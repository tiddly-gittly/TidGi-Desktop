/* eslint-disable @typescript-eslint/consistent-type-assertions */
import { BrowserWindow, ipcMain, dialog, app, App, remote, clipboard } from 'electron';
import isDevelopment from 'electron-is-dev';
import { injectable, inject } from 'inversify';

import { IBrowserViewMetaData, WindowNames, windowDimension, WindowMeta, CodeInjectionType } from '@services/windows/WindowProperties';
import serviceIdentifiers from '@services/serviceIdentifier';
import { Preference } from '@services/preferences';
import { Workspace } from '@services/workspaces';
import { MenuService } from '@services/menu';
import { Channels, WindowChannel, MetaDataChannel } from '@/constants/channels';

import i18n from '@services/libs/i18n';
import getViewBounds from '@services/libs/get-view-bounds';
import getFromRenderer from '@services/libs/getFromRenderer';

@injectable()
export class Window {
  private windows = {} as Record<WindowNames, BrowserWindow | undefined>;
  private windowMeta = {} as WindowMeta;

  constructor(
    @inject(serviceIdentifiers.Preference) private readonly preferenceService: Preference,
    @inject(serviceIdentifiers.Workspace) private readonly workspaceService: Workspace,
    @inject(serviceIdentifiers.MenuService) private readonly menuService: MenuService,
  ) {
    this.initIPCHandlers();
    this.registerMenu();
  }

  initIPCHandlers(): void {
    ipcMain.handle('request-go-home', async (_event: Electron.IpcMainInvokeEvent, windowName: WindowNames = WindowNames.main) => {
      const win = this.get(windowName);
      const contents = win?.getBrowserView()?.webContents;
      const activeWorkspace = this.workspaceService.getActiveWorkspace();
      if (contents !== undefined && activeWorkspace !== undefined && win !== undefined) {
        await contents.loadURL(activeWorkspace.homeUrl);
        contents.send('update-can-go-back', contents.canGoBack());
        contents.send('update-can-go-forward', contents.canGoForward());
      }
    });
    ipcMain.handle('request-go-back', (_event: Electron.IpcMainInvokeEvent, windowName: WindowNames = WindowNames.main) => {
      const win = this.get(windowName);
      const contents = win?.getBrowserView()?.webContents;
      if (contents?.canGoBack() === true) {
        contents.goBack();
        contents.send('update-can-go-back', contents.canGoBack());
        contents.send('update-can-go-forward', contents.canGoForward());
      }
    });
    ipcMain.handle('request-go-forward', (_event: Electron.IpcMainInvokeEvent, windowName: WindowNames = WindowNames.main) => {
      const win = this.get(windowName);
      const contents = win?.getBrowserView()?.webContents;
      if (contents?.canGoForward() === true) {
        contents.goForward();
        contents.send('update-can-go-back', contents.canGoBack());
        contents.send('update-can-go-forward', contents.canGoForward());
      }
    });
    ipcMain.handle('request-reload', (_event: Electron.IpcMainInvokeEvent, windowName: WindowNames = WindowNames.main) => {
      const win = this.get(windowName);
      win?.getBrowserView()?.webContents?.reload();
    });
    ipcMain.handle('request-show-message-box', (_event, message: Electron.MessageBoxOptions['message'], type?: Electron.MessageBoxOptions['type']) => {
      const mainWindow = this.get(WindowNames.main);
      if (mainWindow !== undefined) {
        dialog
          .showMessageBox(mainWindow, {
            type: type ?? 'error',
            message,
            buttons: ['OK'],
            cancelId: 0,
            defaultId: 0,
          })
          .catch(console.log);
      }
    });

    ipcMain.handle(WindowChannel.requestShowRequireRestartDialog, () => {
      const availableWindowToShowDialog = this.get(WindowNames.preferences) ?? this.get(WindowNames.main);
      if (availableWindowToShowDialog !== undefined) {
        dialog
          .showMessageBox(availableWindowToShowDialog, {
            type: 'question',
            buttons: [i18n.t('Dialog.RestartNow'), i18n.t('Dialog.Later')],
            message: i18n.t('Dialog.RestartMessage'),
            cancelId: 1,
          })
          .then(({ response }) => {
            if (response === 0) {
              const availableApp = (app as App | undefined) === undefined ? remote.app : app;
              availableApp.relaunch();
              availableApp.quit();
            }
          })
          .catch(console.error);
      }
    });

    ipcMain.handle(WindowChannel.requestShowCodeInjectionWindow, (_event, codeInjectionType: CodeInjectionType) => {
      void this.open(WindowNames.codeInjection, { codeInjectionType }, (windowMeta: WindowMeta[WindowNames.codeInjection]) => {
        return codeInjectionType !== windowMeta.codeInjectionType;
      });
    });
    ipcMain.handle(WindowChannel.requestShowCustomUserAgentWindow, () => {
      void this.open(WindowNames.userAgent);
    });

    ipcMain.handle(WindowChannel.requestShowAboutWindow, () => {
      void this.open(WindowNames.about);
    });
    ipcMain.handle(WindowChannel.requestShowPreferencesWindow, (_event, scrollTo: string) => {
      // FIXME: make scrollTo enum, and find places use this scrollTo
      void this.open(WindowNames.preferences, { scrollTo });
    });
    ipcMain.handle(WindowChannel.requestShowEditWorkspaceWindow, (_event, workspaceID: string) => {
      void this.open(WindowNames.editWorkspace, { workspaceID }, (windowMeta: WindowMeta[WindowNames.editWorkspace]) => {
        return workspaceID !== windowMeta.workspaceID;
      });
    });
    ipcMain.handle(WindowChannel.requestShowAddWorkspaceWindow, () => {
      void this.open(WindowNames.addWorkspace);
    });
    ipcMain.handle(WindowChannel.requestShowNotificationsWindow, () => {
      void this.open(WindowNames.notifications);
    });
    ipcMain.handle(WindowChannel.requestShowProxyWindow, () => {
      void this.open(WindowNames.proxy);
    });
    ipcMain.handle(WindowChannel.requestShowSpellcheckLanguagesWindow, () => {
      void this.open(WindowNames.spellcheck);
    });

    ipcMain.handle('request-find-in-page', (_event, text: string, forward?: boolean, windowName: WindowNames = WindowNames.main) => {
      const mainWindow = this.get(windowName);
      const contents = mainWindow?.getBrowserView()?.webContents;
      if (contents !== undefined) {
        contents.findInPage(text, {
          forward,
        });
      }
    });
    ipcMain.handle('request-stop-find-in-page', (_event, close?: boolean, windowName: WindowNames = WindowNames.main) => {
      const mainWindow = this.get(windowName);
      const view = mainWindow?.getBrowserView();
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (view) {
        const contents = view.webContents;
        if (contents !== undefined) {
          contents.stopFindInPage('clearSelection');
          contents.send('update-find-in-page-matches', 0, 0);
          // adjust bounds to hide the gap for find in page
          if (close === true && mainWindow !== undefined) {
            const contentSize = mainWindow.getContentSize();
            view.setBounds(getViewBounds(contentSize as [number, number]));
          }
        }
      }
    });

    ipcMain.handle('request-show-display-media-window', (_event: Electron.IpcMainInvokeEvent) => {
      const viewID = BrowserWindow.fromWebContents(_event.sender)?.id;
      if (viewID !== undefined) {
        return this.open(WindowNames.displayMedia, { displayMediaRequestedViewID: viewID }, (windowMeta: WindowMeta[WindowNames.displayMedia]) => {
          return viewID !== windowMeta.displayMediaRequestedViewID;
        });
      }
    });
  }

  public get(windowName: WindowNames = WindowNames.main): BrowserWindow | undefined {
    return this.windows[windowName];
  }

  public async open<N extends WindowNames>(
    windowName: N,
    meta: WindowMeta[N] = {},
    recreate?: boolean | ((windowMeta: WindowMeta[N]) => boolean),
  ): Promise<void> {
    const existedWindow = this.windows[windowName];
    const existedWindowMeta = this.windowMeta[windowName];
    if (existedWindow !== undefined) {
      if (recreate === true || (typeof recreate === 'function' && existedWindowMeta !== undefined && recreate(existedWindowMeta))) {
        existedWindow.close();
      } else {
        return existedWindow.show();
      }
    }
    const attachToMenubar: boolean = this.preferenceService.get('attachToMenubar');

    const newWindow = new BrowserWindow({
      ...windowDimension[windowName],
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      autoHideMenuBar: false,
      webPreferences: {
        nodeIntegration: false,
        enableRemoteModule: true,
        webSecurity: !isDevelopment,
        contextIsolation: true,
        preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
        additionalArguments: [windowName, JSON.stringify(meta)],
      },
      parent: windowName === WindowNames.main || attachToMenubar ? undefined : this.get(WindowNames.main),
    });
    newWindow.setMenuBarVisibility(false);

    newWindow.on('closed', () => {
      this.windows[windowName] = undefined;
    });
    this.windows[windowName] = newWindow;
    return newWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  }

  public setWindowMeta<N extends WindowNames>(windowName: N, meta: WindowMeta[N]): void {
    this.windowMeta[windowName] = meta;
  }

  public updateWindowMeta<N extends WindowNames>(windowName: N, meta: WindowMeta[N]): void {
    this.windowMeta[windowName] = { ...this.windowMeta[windowName], ...meta };
  }

  public getWindowMeta<N extends WindowNames>(windowName: N): WindowMeta[N] {
    return this.windowMeta[windowName];
  }

  /**
   * BroadCast message to all opened windows, so we can sync state to redux and make them take effect immediately
   * @param channel ipc channel to send
   * @param arguments_ any messages
   */
  public sendToAllWindows = (channel: Channels, ...arguments_: unknown[]): void => {
    const wins = BrowserWindow.getAllWindows();
    wins.forEach((win) => {
      win.webContents.send(channel, ...arguments_);
    });
  };

  private registerMenu(): void {
    this.menuService.insertMenu(
      'window',
      [
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
      ],
      'close',
    );

    this.menuService.insertMenu(
      'Edit',
      [
        {
          label: 'Find',
          accelerator: 'CmdOrCtrl+F',
          click: () => {
            const mainWindow = this.get(WindowNames.main);
            if (mainWindow !== undefined) {
              mainWindow.webContents.focus();
              mainWindow.webContents.send('open-find-in-page');
              const contentSize = mainWindow.getContentSize();
              const view = mainWindow.getBrowserView();
              view?.setBounds(getViewBounds(contentSize as [number, number], true));
            }
          },
          enabled: () => this.workspaceService.countWorkspaces() > 0,
        },
        {
          label: 'Find Next',
          accelerator: 'CmdOrCtrl+G',
          click: () => {
            const mainWindow = this.get(WindowNames.main);
            mainWindow?.webContents?.send('request-back-find-in-page', true);
          },
          enabled: () => this.workspaceService.countWorkspaces() > 0,
        },
        {
          label: 'Find Previous',
          accelerator: 'Shift+CmdOrCtrl+G',
          click: () => {
            const mainWindow = this.get(WindowNames.main);
            mainWindow?.webContents?.send('request-back-find-in-page', false);
          },
          enabled: () => this.workspaceService.countWorkspaces() > 0,
        },
      ],
      'close',
    );

    this.menuService.insertMenu('History', [
      {
        label: 'Home',
        accelerator: 'Shift+CmdOrCtrl+H',
        click: () => ipcMain.emit('request-go-home'),
        enabled: () => this.workspaceService.countWorkspaces() > 0,
      },
      {
        label: 'Back',
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
        enabled: () => this.workspaceService.countWorkspaces() > 0,
      },
      {
        label: 'Forward',
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
        enabled: () => this.workspaceService.countWorkspaces() > 0,
      },
      { type: 'separator' },
      {
        label: 'Copy URL',
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
        enabled: () => this.workspaceService.countWorkspaces() > 0,
      },
    ]);

    if (process.platform === 'darwin') {
      this.menuService.insertMenu('TiddlyGit', [
        {
          label: i18n.t('ContextMenu.About'),
          click: async () => await this.open(WindowNames.about),
        },
        { type: 'separator' },
        {
          label: i18n.t('ContextMenu.Preferences'),
          click: async () => await this.open(WindowNames.preferences),
          accelerator: 'CmdOrCtrl+,',
        },
        { type: 'separator' },
        {
          label: i18n.t('ContextMenu.Notifications'),
          click: async () => await this.open(WindowNames.notifications),
          accelerator: 'CmdOrCtrl+Shift+N',
        },
        { type: 'separator' },
        {
          label: i18n.t('Preference.ClearBrowsingData'),
          click: () => ipcMain.emit('request-clear-browsing-data'),
        },
        { type: 'separator' },
        { role: 'services', submenu: [] },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ]);
    }
  }
}
