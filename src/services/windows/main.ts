import { BrowserWindow, Menu, Tray, app, ipcMain, nativeImage } from 'electron';
import windowStateKeeper from 'electron-window-state';
import { menubar, Menubar } from 'menubar';
import path from 'path';

import { REACT_PATH, isDev } from '../constants/paths';
import { getPreference } from '../libs/preferences';
import formatBytes from '../libs/format-bytes';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

let win: BrowserWindow | undefined;
let menuBar: Menubar;
let attachToMenubar: boolean = false;

export const get = (): BrowserWindow | undefined => {
  if (attachToMenubar && menuBar) return menuBar.window;
  return win;
};

export const createAsync = () =>
  new Promise<void>((resolve) => {
    attachToMenubar = getPreference('attachToMenubar');
    if (attachToMenubar) {
      const menubarWindowState = windowStateKeeper({
        file: 'window-state-menubar.json',
        defaultWidth: 400,
        defaultHeight: 400,
      });

      // setImage after Tray instance is created to avoid
      // "Segmentation fault (core dumped)" bug on Linux
      // https://github.com/electron/electron/issues/22137#issuecomment-586105622
      // https://github.com/atomery/translatium/issues/164
      const tray = new Tray(nativeImage.createEmpty());
      // icon template is not supported on Windows & Linux
      const iconPath = path.resolve(__dirname, '..', process.platform === 'darwin' ? 'menubarTemplate.png' : 'menubar.png');
      tray.setImage(iconPath);

      menuBar = menubar({
        index: REACT_PATH,
        tray,
        preloadWindow: true,
        tooltip: 'TiddlyGit',
        browserWindow: {
          x: menubarWindowState.x,
          y: menubarWindowState.y,
          width: menubarWindowState.width,
          height: menubarWindowState.height,
          minHeight: 100,
          minWidth: 250,
          webPreferences: {
            nodeIntegration: false,
            enableRemoteModule: true,
            webSecurity: !isDev,
            contextIsolation: true,
            preload: path.join(__dirname, '..', 'preload', 'menubar.js'),
          },
        },
      });

      menuBar.on('after-create-window', () => {
        if (menuBar.window) {
          menubarWindowState.manage(menuBar.window);

          menuBar.window.on('focus', () => {
            const view = menuBar.window?.getBrowserView();
            if (view && view.webContents) {
              view.webContents.focus();
            }
          });
        }
      });

      menuBar.on('ready', () => {
        menuBar.tray.on('right-click', () => {
          const updaterEnabled = process.env.SNAP == null && !process.mas && !process.windowsStore;

          const updaterMenuItem = {
            label: 'Check for Updates...',
            click: () => ipcMain.emit('request-check-for-updates'),
            visible: updaterEnabled,
            enabled: true,
          };
          if (global.updaterObj && global.updaterObj.status === 'update-downloaded') {
            updaterMenuItem.label = 'Restart to Apply Updates...';
          } else if (global.updaterObj && global.updaterObj.status === 'update-available') {
            updaterMenuItem.label = 'Downloading Updates...';
            updaterMenuItem.enabled = false;
          } else if (global.updaterObj && global.updaterObj.status === 'download-progress') {
            const { transferred, total, bytesPerSecond } = global.updaterObj.info;
            updaterMenuItem.label = `Downloading Updates (${formatBytes(transferred)}/${formatBytes(total)} at ${formatBytes(
              bytesPerSecond,
            )}/s)...`;
            updaterMenuItem.enabled = false;
          } else if (global.updaterObj && global.updaterObj.status === 'checking-for-update') {
            updaterMenuItem.label = 'Checking for Updates...';
            updaterMenuItem.enabled = false;
          }

          const contextMenu = Menu.buildFromTemplate([
            {
              label: 'Open TiddlyGit',
              click: () => menuBar.showWindow(),
            },
            {
              type: 'separator',
            },
            {
              label: 'About TiddlyGit',
              click: () => ipcMain.emit('request-show-about-window'),
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
                menuBar.app.quit();
              },
            },
          ]);

          menuBar.tray.popUpContextMenu(contextMenu);
        });

        resolve();
      });
      return;
    }

    const { wasOpenedAsHidden } = app.getLoginItemSettings();

    const mainWindowState = windowStateKeeper({
      defaultWidth: 1000,
      defaultHeight: 768,
    });

    win = new BrowserWindow({
      x: mainWindowState.x,
      y: mainWindowState.y,
      width: mainWindowState.width,
      height: mainWindowState.height,
      minHeight: 100,
      minWidth: 350,
      title: 'TiddlyGit',
      titleBarStyle: 'hidden',
      show: false,
      // manually set dock icon for AppImage
      // Snap icon is set correct already so no need to intervene
      icon: process.platform === 'linux' && process.env.SNAP == null ? path.resolve(__dirname, '..', 'icon.png') : undefined,
      webPreferences: {
        nodeIntegration: false,
        enableRemoteModule: true,
        webSecurity: !isDev,
        contextIsolation: true,
        preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      },
    });
    if (getPreference('hideMenuBar')) {
      win.setMenuBarVisibility(false);
    }

    mainWindowState.manage(win);

    // Enable swipe to navigate
    const swipeToNavigate = getPreference('swipeToNavigate');
    if (swipeToNavigate) {
      win.on('swipe', (e, direction) => {
        const view = win?.getBrowserView();
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
      // FIXME: use custom property
      if (win && process.platform === 'darwin' && !(win as any).forceClose) {
        e.preventDefault();
        // https://github.com/electron/electron/issues/6033#issuecomment-242023295
        if (win.isFullScreen()) {
          win.once('leave-full-screen', () => {
            if (win) {
              win.hide();
            }
          });
          win.setFullScreen(false);
        } else {
          win.hide();
        }
      }
    });

    win.on('closed', () => {
      win = undefined;
    });

    win.on('focus', () => {
      const view = win?.getBrowserView();
      if (view && view.webContents) {
        view.webContents.focus();
      }
    });

    win.once('ready-to-show', () => {
      if (win && !wasOpenedAsHidden) {
        win.show();
      }

      // calling this to redundantly setBounds BrowserView
      // after the UI is fully loaded
      // if not, BrowserView mouseover event won't work correctly
      // https://github.com/atomery/webcatalog/issues/812
      ipcMain.emit('request-realign-active-workspace');
    });

    win.on('enter-full-screen', () => {
      win?.webContents.send('is-fullscreen-updated', true);
      ipcMain.emit('request-realign-active-workspace');
    });
    win.on('leave-full-screen', () => {
      win?.webContents.send('is-fullscreen-updated', false);
      ipcMain.emit('request-realign-active-workspace');
    });

    // ensure redux is loaded first
    // if not, redux might not be able catch changes sent from ipcMain
    win.webContents.once('did-stop-loading', () => {
      resolve();
    });

    win.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  });

export const show = () => {
  if (attachToMenubar) {
    if (menuBar == null) {
      createAsync();
    } else {
      menuBar.on('ready', () => {
        menuBar.showWindow();
      });
    }
  } else if (win == null) {
    createAsync();
  } else {
    win.show();
  }
};
