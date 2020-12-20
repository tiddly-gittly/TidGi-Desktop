import { BrowserWindow } from 'electron';
import path from 'path';

import { REACT_PATH, isDev as isDevelopment } from '../constants/paths';
import { getPreference } from '../libs/preferences';

import * as mainWindow from './main';

let win: any;

const get = () => win;

const create = () => {
  const attachToMenubar = getPreference('attachToMenubar');

  win = new BrowserWindow({
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
      // @ts-expect-error ts-migrate(1117) FIXME: An object literal cannot have multiple properties ... Remove this comment to see the full error message
      enableRemoteModule: true,
      preload: path.join(__dirname, '..', 'preload', 'add-workspace.js'),
    },
    parent: attachToMenubar ? undefined : mainWindow.get(),
  });
  win.setMenuBarVisibility(false);

  win.loadURL(REACT_PATH);

  win.on('closed', () => {
    win = undefined;
  });
};

const show = () => {
  if (win === undefined) {
    create();
  } else {
    win.show();
  }
};

export { get, create, show };
