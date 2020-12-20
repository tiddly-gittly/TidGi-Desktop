import { BrowserWindow } from 'electron';
import path from 'path';
import { REACT_PATH, isDev as isDevelopment } from '../constants/paths';
import { getPreference } from '../libs/preferences';
import * as mainWindow from './main';
let win: any;
let activeType: any = null;
const get = () => win;
const create = (type: any) => {
  const attachToMenubar = getPreference('attachToMenubar');
  activeType = type;
  (global as any).codeInjectionType = type;
  win = new BrowserWindow({
    width: 640,
    height: 560,
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
      preload: path.join(__dirname, '..', 'preload', 'code-injection.js'),
    },
    // @ts-expect-error ts-migrate(2322) FIXME: Type 'BrowserWindow | null | undefined' is not ass... Remove this comment to see the full error message
    parent: attachToMenubar ? null : mainWindow.get(),
  });
  win.setMenuBarVisibility(false);
  win.loadURL(REACT_PATH);
  win.on('closed', () => {
    win = null;
  });
};
const show = (id: any) => {
  if (win == undefined) {
    create(id);
  } else if (id !== activeType) {
    win.close();
    create(id);
  } else {
    win.show();
  }
};
export { get, create, show };
