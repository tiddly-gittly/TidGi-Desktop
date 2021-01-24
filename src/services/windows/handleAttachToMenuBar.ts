/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { Menu, Tray, ipcMain, nativeImage } from 'electron';
import windowStateKeeper from 'electron-window-state';
import { menubar, Menubar } from 'menubar';
import path from 'path';
import isDevelopment from 'electron-is-dev';

import { REACT_PATH, buildResourcePath } from '@services/constants/paths';

export default async function handleAttachToMenuBar(): Promise<Menubar> {
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
  const iconPath = path.resolve(buildResourcePath, process.platform === 'darwin' ? 'menubarTemplate.png' : 'menubar.png');
  tray.setImage(iconPath);

  const menuBar = menubar({
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
        webSecurity: !isDevelopment,
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
        if (view?.webContents) {
          view.webContents.focus();
        }
      });
    }
  });

  return await new Promise<Menubar>((resolve) => {
    menuBar.on('ready', () => {
      menuBar.tray.on('right-click', () => {
        // TODO: restore updater options here
        const contextMenu = Menu.buildFromTemplate([
          {
            label: 'Open TiddlyGit',
            click: async () => await menuBar.showWindow(),
          },
          {
            type: 'separator',
          },
          {
            label: 'About TiddlyGit',
            click: () => ipcMain.emit('request-show-about-window'),
          },
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

      resolve(menuBar);
    });
  });
}
