import { BrowserWindow } from 'electron';
import path from 'path';
import { REACT_PATH, isDev as isDevelopment } from '../constants/paths';
import { getPreference } from '../libs/preferences';
import * as mainWindow from './main';
let win: any;
const get = () => win;
const create = (url: any) => {
  const attachToMenubar = getPreference('attachToMenubar');
  (global as any).incomingUrl = url;
  win = new BrowserWindow({
    width: 400,
    height: 530,
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
      preload: path.join(__dirname, '..', 'preload', 'open-url-with.js'),
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
const show = (url: any) => {
  if (win == undefined) {
    create(url);
  } else {
    win.close();
    create(url);
  }
};
export { get, create, show };
