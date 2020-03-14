const { BrowserWindow } = require('electron');
const path = require('path');

const { REACT_PATH } = require('../constants/paths');

const mainWindow = require('./main');
const { getPreference } = require('../libs/preferences');

let win;

const get = () => win;

const create = (scrollTo) => {
  const attachToMenubar = getPreference('attachToMenubar');

  global.preferencesScrollTo = scrollTo;

  win = new BrowserWindow({
    width: 760,
    height: 600,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      preload: path.join(__dirname, '..', 'preload', 'preferences.js'),
    },
    parent: attachToMenubar ? null : mainWindow.get(),
  });

  win.loadURL(REACT_PATH);

  win.on('closed', () => {
    win = null;
    global.preferencesScrollTo = null;
  });
};

const show = (scrollTo) => {
  if (win == null) {
    create(scrollTo);
  } else if (scrollTo !== global.preferencesScrollTo) {
    win.close();
    create(scrollTo);
  } else {
    win.show();
  }
};

module.exports = {
  get,
  create,
  show,
};
