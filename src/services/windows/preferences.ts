// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'BrowserWin... Remove this comment to see the full error message
import { BrowserWindow } from 'electron';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'path'.
import path from 'path';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'REACT_PATH... Remove this comment to see the full error message
import { REACT_PATH, isDev } from '../constants/paths';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'mainWindow... Remove this comment to see the full error message
import * as mainWindow from './main';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'getPrefere... Remove this comment to see the full error message
import { getPreference } from '../libs/preferences';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'win'.
let win;
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'get'.
const get = () => win;
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'create'.
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
      webSecurity: !isDev,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'preload', 'preferences.js'),
    },
    parent: attachToMenubar ? null : mainWindow.get(),
  });
  win.setMenuBarVisibility(false);
  win.loadURL(REACT_PATH);
  win.on('closed', () => {
    win = null;
    (global as any).preferencesScrollTo = null;
  });
};
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'show'.
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
