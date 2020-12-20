// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'BrowserWin... Remove this comment to see the full error message
import { BrowserWindow, BrowserView, ipcMain } from 'electron';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'path'.
import path from 'path';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'REACT_PATH... Remove this comment to see the full error message
import { REACT_PATH, isDev } from '../constants/paths';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'getPrefere... Remove this comment to see the full error message
import { getPreference } from '../libs/preferences';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'mainWindow... Remove this comment to see the full error message
import * as mainWindow from './main';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'win'.
let win;
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'get'.
const get = () => win;
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'create'.
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
      webSecurity: !isDev,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'preload', 'display-media.js'),
    },
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
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'show'.
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
