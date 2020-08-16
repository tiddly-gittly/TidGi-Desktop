const { BrowserWindow } = require('electron');
const path = require('path');

const { REACT_PATH, isDev } = require('../constants/paths');
const { getPreference } = require('../libs/preferences');

const mainWindow = require('./main');

let win;

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
      webSecurity: !isDev,
      contextIsolation: true,
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

module.exports = {
  get,
  create,
  show,
};
