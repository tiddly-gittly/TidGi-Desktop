/* eslint-disable @typescript-eslint/consistent-type-assertions */
import { BrowserWindow, ipcMain, dialog, app, App, remote } from 'electron';
import isDevelopment from 'electron-is-dev';
import { injectable, inject } from 'inversify';

import serviceIdentifiers from '@services/serviceIdentifier';
import { Preference } from '@services/preferences';
import { Workspace } from '@services/workspaces';
import { Channels, WindowChannel } from '@services/channels';
import { WindowNames, windowDimension, WindowMeta, CodeInjectionType } from '@services/windows/WindowProperties';
import i18n from '@services/libs/i18n';
import getViewBounds from '@services/libs/get-view-bounds';

@injectable()
export class Window {
  private windows = {} as Record<WindowNames, BrowserWindow | undefined>;
  private windowMeta = {} as WindowMeta;

  constructor(
    @inject(serviceIdentifiers.Preference) private readonly preferenceService: Preference,
    @inject(serviceIdentifiers.Workspace) private readonly workspaceService: Workspace,
  ) {
    this.init();
  }

  init(): void {
    ipcMain.handle('request-go-home', async (_event: Electron.IpcMainInvokeEvent, windowName: WindowNames) => {
      const win = this.get(windowName);
      const contents = win?.getBrowserView()?.webContents;
      const activeWorkspace = this.workspaceService.getActiveWorkspace();
      if (contents !== undefined && activeWorkspace !== undefined && win !== undefined) {
        await contents.loadURL(activeWorkspace.homeUrl);
        contents.send('update-can-go-back', contents.canGoBack());
        contents.send('update-can-go-forward', contents.canGoForward());
      }
    });
    ipcMain.handle('request-go-back', (_event: Electron.IpcMainInvokeEvent, windowName: WindowNames) => {
      const win = this.get(windowName);
      const contents = win?.getBrowserView()?.webContents;
      if (contents?.canGoBack() === true) {
        contents.goBack();
        contents.send('update-can-go-back', contents.canGoBack());
        contents.send('update-can-go-forward', contents.canGoForward());
      }
    });
    ipcMain.handle('request-go-forward', (_event: Electron.IpcMainInvokeEvent, windowName: WindowNames) => {
      const win = this.get(windowName);
      const contents = win?.getBrowserView()?.webContents;
      if (contents?.canGoForward() === true) {
        contents.goForward();
        contents.send('update-can-go-back', contents.canGoBack());
        contents.send('update-can-go-forward', contents.canGoForward());
      }
    });
    ipcMain.handle('request-reload', (_event: Electron.IpcMainInvokeEvent, windowName: WindowNames) => {
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

    ipcMain.handle('request-find-in-page', (_event, text: string, forward?: boolean) => {
      const mainWindow = this.get(WindowNames.main);
      const contents = mainWindow?.getBrowserView()?.webContents;
      if (contents !== undefined) {
        contents.findInPage(text, {
          forward,
        });
      }
    });
    ipcMain.handle('request-stop-find-in-page', (_event, close?: boolean) => {
      const mainWindow = this.get(WindowNames.main);
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

  public get(name: WindowNames): BrowserWindow | undefined {
    return this.windows[name];
  }

  public async open<N extends WindowNames>(name: N, meta: WindowMeta[N] = {}, recreate?: boolean | ((windowMeta: WindowMeta[N]) => boolean)): Promise<void> {
    const existedWindow = this.windows[name];
    const existedWindowMeta = this.windowMeta[name];
    if (existedWindow !== undefined) {
      if (recreate === true || (typeof recreate === 'function' && existedWindowMeta !== undefined && recreate(existedWindowMeta))) {
        existedWindow.close();
      } else {
        return existedWindow.show();
      }
    }
    const attachToMenubar: boolean = this.preferenceService.get('attachToMenubar');

    const newWindow = new BrowserWindow({
      ...windowDimension[name],
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
        additionalArguments: [name, JSON.stringify(meta)],
      },
      parent: name === WindowNames.main || attachToMenubar ? undefined : this.get(WindowNames.main),
    });
    newWindow.setMenuBarVisibility(false);

    newWindow.on('closed', () => {
      this.windows[name] = undefined;
    });
    this.windows[name] = newWindow;
    return newWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  }

  public setWindowMeta<N extends WindowNames>(windowName: N, meta: WindowMeta[N]): void {
    this.windowMeta[windowName] = meta;
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
}
