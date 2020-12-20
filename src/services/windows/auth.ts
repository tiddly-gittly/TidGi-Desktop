// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'BrowserWin... Remove this comment to see the full error message
import { BrowserWindow, ipcMain } from 'electron';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'path'.
import path from 'path';

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'REACT_PATH... Remove this comment to see the full error message
import { REACT_PATH, isDev } from '../constants/paths';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'getPrefere... Remove this comment to see the full error message
import { getPreference } from '../libs/preferences';

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'mainWindow... Remove this comment to see the full error message
import * as mainWindow from './main';

const wins = {};
const emitted = {};

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'get'.
const get = (id: any) => wins[id];

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'create'.
const create = (id: any) => {
  const attachToMenubar = getPreference('attachToMenubar');

  // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  emitted[id] = false;

  // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  wins[id] = new BrowserWindow({
    width: 400,
    height: 220,
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
      preload: path.join(__dirname, '..', 'preload', 'auth.js'),
    },
    parent: attachToMenubar ? null : mainWindow.get(),
  });
  // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  wins[id].setMenuBarVisibility(false);

  // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  wins[id].loadURL(REACT_PATH);

  const identityValidationListener = (e: any, windowId: any, username: any, password: any) => {
    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    if (windowId !== wins[id].id) return;

    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    if (!emitted[id]) {
      // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      emitted[id] = true;
      ipcMain.emit('continue-auth', null, id, true, username, password);
    }
    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    wins[id].close();
  };

  // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  wins[id].on('closed', () => {
    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    if (!emitted[id]) {
      // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      emitted[id] = true;
      ipcMain.emit('continue-auth', null, id, false);
    }
    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    delete wins[id];
    ipcMain.removeListener('request-validate-auth-identity', identityValidationListener);
  });

  ipcMain.on('request-validate-auth-identity', identityValidationListener);
};

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'show'.
const show = (id: any) => {
  // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  if (wins[id] == undefined) {
    create(id);
  } else {
    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    wins[id].show();
  }
};

export { get, create, show };
