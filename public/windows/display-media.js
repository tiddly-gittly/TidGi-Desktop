const { BrowserWindow, BrowserView, ipcMain } = require('electron');
const path = require('path');

const { REACT_PATH } = require('../constants/paths');
const { getPreference } = require('../libs/preferences');

const mainWindow = require('./main');

let win;

const get = () => win;

const create = (viewId) => {
  const attachToMenubar = getPreference('attachToMenubar');

  global.displayMediaRequestedViewId = viewId;

  win = new BrowserWindow({
    width: 400,
    height: 600,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      preload: path.join(__dirname, '..', 'preload', 'display-media.js'),
    },
    parent: attachToMenubar ? null : mainWindow.get(),
  });

  win.loadURL(REACT_PATH);

  const onClose = () => {
    BrowserView.fromId(global.displayMediaRequestedViewId).webContents.send('display-media-id-received', null);
  };
  win.on('close', onClose);

  const onSelected = (e, displayMediaId) => {
    BrowserView.fromId(global.displayMediaRequestedViewId).webContents.send('display-media-id-received', displayMediaId);
    ipcMain.removeListener('display-media-selected', onSelected);
    win.removeListener('close', onClose);
    win.close();
  };
  ipcMain.once('display-media-selected', onSelected);

  win.on('closed', () => {
    win = null;
  });
};

const show = (viewId) => {
  if (win == null) {
    create(viewId);
  } else if (viewId !== global.displayMediaRequestedViewId) {
    win.close();
    create(viewId);
  } else {
    win.show();
  }
};

module.exports = {
  get,
  create,
  show,
};
