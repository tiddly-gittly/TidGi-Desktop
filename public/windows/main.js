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

const { REACT_PATH } = require('../constants/paths');
const { getPreference } = require('../libs/preferences');
const formatBytes = require('../libs/format-bytes');

let win;
let mb = {};
let attachToMenubar;

const get = () => {
  if (attachToMenubar) return mb.window;
  return win;
};

const createAsync = () => {
  attachToMenubar = getPreference('attachToMenubar');
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
          webSecurity: false,
          preload: path.join(__dirname, '..', 'preload', 'menubar.js'),
        },
      },
    });

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
          const registered = getPreference('registered');
          const updaterEnabled = process.env.SNAP == null && !process.mas && !process.windowsStore;

          const updaterMenuItem = {
            label: 'Check for Updates...',
            click: () => {
              global.updateSilent = false;
              autoUpdater.checkForUpdates();
            },
            visible: updaterEnabled,
          };
          if (global.updateDownloaded) {
            updaterMenuItem.label = 'Restart to Apply Updates...';
            updaterMenuItem.click = () => {
              setImmediate(() => {
                app.removeAllListeners('window-all-closed');
                if (get() != null) {
                  get().forceClose = true;
                  get().close();
                }
                autoUpdater.quitAndInstall(false);
              });
            };
          } else if (global.updaterProgressObj) {
            const { transferred, total, bytesPerSecond } = global.updaterProgressObj;
            updaterMenuItem.label = `Downloading Updates (${formatBytes(transferred)}/${formatBytes(total)} at ${formatBytes(bytesPerSecond)}/s)...`;
            updaterMenuItem.enabled = false;
          }

          const contextMenu = Menu.buildFromTemplate([
            {
              label: 'About Singlebox',
              click: () => ipcMain.emit('request-show-about-window'),
            },
            { type: 'separator' },
            {
              label: registered ? 'Registered' : 'Registration...',
              enabled: !registered,
              click: registered ? null : () => ipcMain.emit('request-show-license-registration-window'),
            },
            { type: 'separator' },
            updaterMenuItem,
            { type: 'separator' },
            {
              label: 'Preferences...',
              click: () => ipcMain.emit('request-show-preferences-window'),
            },
            { type: 'separator' },
            {
              label: 'Notifications...',
              click: () => ipcMain.emit('request-show-notifications-window'),
            },
            { type: 'separator' },
            {
              label: 'Clear Browsing Data...',
              click: () => ipcMain.emit('request-clear-browsing-data'),
            },
            { type: 'separator' },
            {
              role: 'quit',
              click: () => {
                mb.app.quit();
              },
            },
          ]);

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
    icon: process.platform === 'linux' ? path.resolve(__dirname, '..', 'icon.png') : null,
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
