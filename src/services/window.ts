import { BrowserWindow } from 'electron';
import isDevelopment from 'electron-is-dev';
import { injectable, inject } from 'inversify';

import serviceIdentifiers from '@services/serviceIdentifier';
import { Preference } from '@services/preferences';
import { Channels } from '@/services/channels';

export enum WindowNames {
  main = 'main',
  view = 'view',
  addWorkspace = 'addWorkspace',
}

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

@injectable()
export class Window {
  preferenceService: Preference;

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  private windows = {} as Record<WindowNames, BrowserWindow | undefined>;

  constructor(@inject(serviceIdentifiers.Preference) preferenceService: Preference) {
    this.preferenceService = preferenceService;
  }

  private get(name: WindowNames): BrowserWindow | undefined {
    return this.windows[name];
  }

  public async open(name: WindowNames): Promise<void> {
    const attachToMenubar: boolean = this.preferenceService.get('attachToMenubar');

    const newWindow = new BrowserWindow({
      width: 600,
      height: 800,
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
      },
      parent: attachToMenubar ? undefined : this.get(WindowNames.main),
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
