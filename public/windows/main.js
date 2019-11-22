const {
  BrowserWindow,
  Menu,
  app,
  ipcMain,
} = require('electron');
const { autoUpdater } = require('electron-updater');
const windowStateKeeper = require('electron-window-state');
const { menubar } = require('menubar');
const path = require('path');

const { REACT_PATH } = require('../constants');
const { getPreference } = require('../libs/preferences');

let win;
let mb = {};

const get = () => {
  const attachToMenubar = getPreference('attachToMenubar');
  if (attachToMenubar) return mb.window;
  return win;
};

const createAsync = () => {
  const updaterEnabled = process.env.SNAP == null && !process.mas && !process.windowsStore;
  const attachToMenubar = getPreference('attachToMenubar');
  if (attachToMenubar) {
    const menubarWindowState = windowStateKeeper({
      file: 'window-state-menubar.json',
      defaultWidth: 400,
      defaultHeight: 400,
    });

    mb = menubar({
      index: REACT_PATH,
      icon: path.resolve(__dirname, '..', 'menubarTemplate.png'),
      preloadWindow: true,
      browserWindow: {
        x: menubarWindowState.x,
        y: menubarWindowState.y,
        width: menubarWindowState.width,
        height: menubarWindowState.height,
        webPreferences: {
          nodeIntegration: true,
        },
      },
    });

    const contextMenu = Menu.buildFromTemplate([
      { role: 'about' },
      {
        label: 'Check for Updates...',
        click: () => {
          global.updateSilent = false;
          autoUpdater.checkForUpdates();
        },
        visible: updaterEnabled,
      },
      { type: 'separator' },
      {
        label: 'Preferences...',
        click: () => ipcMain.emit('request-show-preferences-window'),
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          mb.app.quit();
        },
      },
    ]);

    return new Promise((resolve, reject) => {
      try {
        mb.on('after-create-window', () => {
          menubarWindowState.manage(mb.window);

          mb.window.on('focus', () => {
            const view = mb.window.getBrowserView();
            if (view && view.webContents) {
              view.webContents.focus();
            }
          });
        });

        mb.on('ready', () => {
          mb.tray.on('right-click', () => {
            mb.tray.popUpContextMenu(contextMenu);
          });

          resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  }


  const { wasOpenedAsHidden } = app.getLoginItemSettings();

  const mainWindowState = windowStateKeeper({
    defaultWidth: 800,
    defaultHeight: 768,
  });

  win = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    minHeight: 100,
    title: 'Singlebox',
    titleBarStyle: 'hidden',
    show: !wasOpenedAsHidden,
    webPreferences: {
      nodeIntegration: true,
      webSecurity: false,
    },
  });

  mainWindowState.manage(win);

  win.loadURL(REACT_PATH);

  // Enable swipe to navigate
  const swipeToNavigate = getPreference('swipeToNavigate');
  if (swipeToNavigate) {
    win.on('swipe', (e, direction) => {
      const view = win.getBrowserView();
      if (view) {
        if (direction === 'left') {
          view.webContents.goBack();
        } else if (direction === 'right') {
          view.webContents.goForward();
        }
      }
    });
  }

  // Hide window instead closing on macos
  win.on('close', (e) => {
    if (process.platform === 'darwin' && !win.forceClose) {
      e.preventDefault();
      win.hide();
    }
  });

  win.on('closed', () => {
    win = null;
  });

  win.on('focus', () => {
    const view = win.getBrowserView();
    if (view && view.webContents) {
      view.webContents.focus();
    }
  });

  return Promise.resolve();
};

const show = () => {
  const attachToMenubar = getPreference('attachToMenubar');

  if (attachToMenubar) {
    if (mb == null) {
      createAsync();
    } else {
      mb.on('ready', () => {
        mb.showWindow();
      });
    }
  } else if (win == null) {
    createAsync();
  } else {
    win.show();
  }
};

const send = (...args) => {
  if (win !== null) {
    win.webContents.send(...args);
  }
};

module.exports = {
  createAsync,
  get,
  send,
  show,
};
