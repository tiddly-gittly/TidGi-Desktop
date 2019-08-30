const { BrowserWindow } = require('electron');
const path = require('path');

const { REACT_PATH } = require('../constants');
const { getPreference } = require('../libs/preferences');

const mainWindow = require('./main');

let win;

const get = () => win;

const create = (url) => {
  const attachToMenubar = getPreference('attachToMenubar');

  global.incomingUrl = url;

  win = new BrowserWindow({
    width: 400,
    height: 530,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      preload: path.join(__dirname, '..', 'preload', 'open-url-with.js'),
    },
    parent: attachToMenubar ? null : mainWindow.get(),
  });

  win.loadURL(REACT_PATH);

  win.on('closed', () => {
    win = null;
  });
};

const show = (url) => {
  if (win == null) {
    create(url);
  } else {
    win.close();
    create(url);
  }
};

module.exports = {
  get,
  create,
  show,
};
