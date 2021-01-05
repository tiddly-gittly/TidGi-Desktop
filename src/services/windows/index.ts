import { BrowserWindow, ipcMain, dialog, app, App, remote } from 'electron';
import isDevelopment from 'electron-is-dev';
import { injectable, inject } from 'inversify';

import serviceIdentifiers from '@services/serviceIdentifier';
import { Preference } from '@services/preferences';
import { Channels, WindowChannel } from '@services/channels';
import { WindowNames, windowDimension } from '@services/windows/WindowProperties';
import i18n from '@services/libs/i18n';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

@injectable()
export class Window {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  private windows = {} as Record<WindowNames, BrowserWindow | undefined>;

  constructor(@inject(serviceIdentifiers.Preference) private readonly preferenceService: Preference) {
    this.init();
  }

  init(): void {
    ipcMain.on(WindowChannel.requestShowRequireRestartDialog, () => {
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

    ipcMain.on(WindowChannel.requestShowCodeInjectionWindow, (_, codeInjectionType: string) => {
      // FIXME: make codeInjectionType enum, and find places use this codeInjectionType
      void this.open(WindowNames.codeInjection, { codeInjectionType });
    });
    ipcMain.on(WindowChannel.requestShowCustomUserAgentWindow, () => {
      void this.open(WindowNames.userAgent);
    });

    ipcMain.on(WindowChannel.requestShowAboutWindow, () => {
      void this.open(WindowNames.about);
    });
    ipcMain.on(WindowChannel.requestShowPreferencesWindow, (_, scrollTo: string) => {
      // FIXME: make scrollTo enum, and find places use this scrollTo
      void this.open(WindowNames.preferences, { scrollTo });
    });
    ipcMain.on(WindowChannel.requestShowEditWorkspaceWindow, (_, workspaceID: string) => {
      void this.open(WindowNames.editWorkspace, { workspaceID });
    });
    ipcMain.on(WindowChannel.requestShowAddWorkspaceWindow, () => {
      void this.open(WindowNames.addWorkspace);
    });
    ipcMain.on(WindowChannel.requestShowNotificationsWindow, () => {
      void this.open(WindowNames.notification);
    });
    ipcMain.on(WindowChannel.requestShowProxyWindow, () => {
      void this.open(WindowNames.proxy);
    });
    ipcMain.on(WindowChannel.requestShowSpellcheckLanguagesWindow, () => {
      void this.open(WindowNames.spellcheck);
    });
  }

  public get(name: WindowNames): BrowserWindow | undefined {
    return this.windows[name];
  }

  public async open(name: WindowNames, meta: Record<string, string> = {}): Promise<void> {
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

  /**
   * BroadCast message to all opened windows
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
