import { BrowserWindow } from 'electron';
import isDevelopment from 'electron-is-dev';
import { injectable } from 'inversify';

export enum WindowNames {
  main = 'main',
  view = 'view',
  addWorkspace = 'addWorkspace',
}

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

@injectable()
export class Window {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  private windows = {} as Record<WindowNames, BrowserWindow | undefined>;

  private get(name: WindowNames): BrowserWindow | undefined {
    return this.windows[name];
  }

  public async open(name: WindowNames): Promise<void> {
    const attachToMenubar = getPreference('attachToMenubar');

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
}
