import { BrowserWindow } from 'electron';
import path from 'path';
import { REACT_PATH, isDev as isDevelopment } from '../constants/paths';
import { getPreference } from '../libs/preferences';
import * as mainWindow from './main';
let win: any;
const get = () => win;
const create = (id: any) => {
  const attachToMenubar = getPreference('attachToMenubar');
  (global as any).editWorkspaceId = id;
  win = new BrowserWindow({
    width: 420,
    height: 700,
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
      preload: path.join(__dirname, '..', 'preload', 'edit-workspace.js'),
    },
    // @ts-expect-error ts-migrate(2322) FIXME: Type 'BrowserWindow | null | undefined' is not ass... Remove this comment to see the full error message
    parent: attachToMenubar ? null : mainWindow.get(),
  });
  win.setMenuBarVisibility(false);
  win.loadURL(REACT_PATH);
  win.on('closed', () => {
    win = null;
    (global as any).editWorkspaceId = null;
  });
};
const show = (id: any) => {
  if (win == undefined) {
    create(id);
  } else if (id !== (global as any).editWorkspaceId) {
    win.close();
    create(id);
  } else {
    win.show();
  }
};
export { get, create, show };
