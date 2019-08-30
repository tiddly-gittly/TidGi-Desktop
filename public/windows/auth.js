const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const { REACT_PATH } = require('../constants');
const { getPreference } = require('../libs/preferences');

const mainWindow = require('./main');

const wins = {};
const emitted = {};

const get = (id) => wins[id];

const create = (id) => {
  const attachToMenubar = getPreference('attachToMenubar');

  emitted[id] = false;

  wins[id] = new BrowserWindow({
    width: 400,
    height: 250,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      preload: path.join(__dirname, '..', 'preload', 'auth.js'),
    },
    parent: attachToMenubar ? null : mainWindow.get(),
  });

  wins[id].loadURL(REACT_PATH);

  const identityValidationListener = (e, windowId, username, password) => {
    if (windowId !== wins[id].id) return;

    if (!emitted[id]) {
      emitted[id] = true;
      ipcMain.emit('continue-auth', null, id, true, username, password);
    }
    wins[id].close();
  };

  wins[id].on('closed', () => {
    if (!emitted[id]) {
      emitted[id] = true;
      ipcMain.emit('continue-auth', null, id, false);
    }
    delete wins[id];
    ipcMain.removeListener('request-validate-auth-identity', identityValidationListener);
  });


  ipcMain.on('request-validate-auth-identity', identityValidationListener);
};

const show = (id) => {
  if (wins[id] == null) {
    create(id);
  } else {
    wins[id].show();
  }
};

module.exports = {
  get,
  create,
  show,
};
