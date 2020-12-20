import { BrowserWindow, BrowserView, ipcMain } from 'electron';
import path from 'path';
import { REACT_PATH, isDev as isDevelopment } from '../constants/paths';
import { getPreference } from '../libs/preferences';
import * as mainWindow from './main';
let win: any;
const get = () => win;
const create = (viewId: any) => {
  const attachToMenubar = getPreference('attachToMenubar');
  (global as any).displayMediaRequestedViewId = viewId;
  win = new BrowserWindow({
    width: 400,
    height: 600,
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
      preload: path.join(__dirname, '..', 'preload', 'display-media.js'),
    },
    // @ts-expect-error ts-migrate(2322) FIXME: Type 'BrowserWindow | null | undefined' is not ass... Remove this comment to see the full error message
    parent: attachToMenubar ? null : mainWindow.get(),
  });
  win.setMenuBarVisibility(false);
  win.loadURL(REACT_PATH);
  const onClose = () => {
    (BrowserView as any).fromId((global as any).displayMediaRequestedViewId).webContents.send('display-media-id-received', null);
  };
  win.on('close', onClose);
  const onSelected = (e: any, displayMediaId: any) => {
    (BrowserView as any).fromId((global as any).displayMediaRequestedViewId).webContents.send('display-media-id-received', displayMediaId);
    ipcMain.removeListener('display-media-selected', onSelected);
    win.removeListener('close', onClose);
    win.close();
  };
  ipcMain.once('display-media-selected', onSelected);
  win.on('closed', () => {
    win = null;
  });
};
const show = (viewId: any) => {
  if (win == undefined) {
    create(viewId);
  } else if (viewId !== (global as any).displayMediaRequestedViewId) {
    win.close();
    create(viewId);
  } else {
    win.show();
  }
};
export { get, create, show };
