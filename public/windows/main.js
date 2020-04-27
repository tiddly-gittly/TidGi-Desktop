const {
  BrowserWindow,
  Menu,
  app,
  ipcMain,
} = require('electron');
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

const createAsync = () => new Promise((resolve) => {
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
      tooltip: 'Singlebox',
      browserWindow: {
        x: menubarWindowState.x,
        y: menubarWindowState.y,
        width: menubarWindowState.width,
        height: menubarWindowState.height,
        minHeight: 100,
        minWidth: 250,
        webPreferences: {
          nodeIntegration: true,
          webSecurity: false,
          preload: path.join(__dirname, '..', 'preload', 'menubar.js'),
        },
      },
    });

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
        const registered = getPreference('registered');
        const updaterEnabled = process.env.SNAP == null
          && !process.mas && !process.windowsStore;

        const updaterMenuItem = {
          label: 'Check for Updates...',
          click: () => ipcMain.emit('request-check-for-updates'),
          visible: updaterEnabled,
        };
        if (global.updaterObj && global.updaterObj.status === 'update-downloaded') {
          updaterMenuItem.label = 'Restart to Apply Updates...';
        } else if (global.updaterObj && global.updaterObj.status === 'update-available') {
          updaterMenuItem.label = 'Downloading Updates...';
          updaterMenuItem.enabled = false;
        } else if (global.updaterObj && global.updaterObj.status === 'download-progress') {
          const { transferred, total, bytesPerSecond } = global.updaterObj.info;
          updaterMenuItem.label = `Downloading Updates (${formatBytes(transferred)}/${formatBytes(total)} at ${formatBytes(bytesPerSecond)}/s)...`;
          updaterMenuItem.enabled = false;
        } else if (global.updaterObj && global.updaterObj.status === 'checking-for-update') {
          updaterMenuItem.label = 'Checking for Updates...';
          updaterMenuItem.enabled = false;
        }

        const contextMenu = Menu.buildFromTemplate([
          {
            label: 'Open Singlebox',
            click: () => mb.showWindow(),
          },
          {
            type: 'separator',
          },
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

        mb.tray.popUpContextMenu(contextMenu);
      });

      resolve();
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
    minWidth: 350,
    title: 'Singlebox',
    titleBarStyle: 'hidden',
    show: false,
    // manually set dock icon for AppImage
    // Snap icon is set correct already so no need to intervene
    icon: process.platform === 'linux' && process.env.SNAP == null ? path.resolve(__dirname, '..', 'icon.png') : undefined,
    autoHideMenuBar: getPreference('hideMenuBar'),
    webPreferences: {
      nodeIntegration: true,
      webSecurity: false,
      preload: path.join(__dirname, '..', 'preload', 'main.js'),
    },
  });

  mainWindowState.manage(win);

  // Enable swipe to navigate
  const swipeToNavigate = getPreference('swipeToNavigate');
  if (swipeToNavigate) {
    win.on('swipe', (e, direction) => {
      const view = win.getBrowserView();
      if (view) {
        if (direction === 'left') {
          view.webContents.goForward();
        } else if (direction === 'right') {
          view.webContents.goBack();
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

  win.once('ready-to-show', () => {
    if (!wasOpenedAsHidden) {
      win.show();
    }
  });

  win.on('enter-full-screen', () => win.webContents.send('is-fullscreen-updated', true));
  win.on('leave-full-screen', () => win.webContents.send('is-fullscreen-updated', false));

  // ensure redux is loaded first
  // if not, redux might not be able catch changes sent from ipcMain
  win.webContents.once('did-stop-loading', () => {
    resolve();
  });

  win.loadURL(REACT_PATH);
});

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
