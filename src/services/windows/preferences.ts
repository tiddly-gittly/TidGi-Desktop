import { BrowserWindow } from 'electron';
import path from 'path';
import { REACT_PATH, isDev as isDevelopment } from '../constants/paths';
import * as mainWindow from './main';
import { getPreference } from '../libs/preferences';
let win: any;
const get = () => win;
const create = (scrollTo: any) => {
  const attachToMenubar = getPreference('attachToMenubar');
  (global as any).preferencesScrollTo = scrollTo;
  win = new BrowserWindow({
    width: 820,
    height: 640,
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
      preload: path.join(__dirname, '..', 'preload', 'preferences.js'),
    },
    // @ts-expect-error ts-migrate(2322) FIXME: Type 'BrowserWindow | null | undefined' is not ass... Remove this comment to see the full error message
    parent: attachToMenubar ? null : mainWindow.get(),
  });
  win.setMenuBarVisibility(false);
  win.loadURL(REACT_PATH);
  win.on('closed', () => {
    win = null;
    (global as any).preferencesScrollTo = null;
  });
};
const show = (scrollTo: any) => {
  if (win == undefined) {
    create(scrollTo);
  } else if (scrollTo !== (global as any).preferencesScrollTo) {
    win.close();
    create(scrollTo);
  } else {
    win.show();
  }
};
export { get, create, show };
