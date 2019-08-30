const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

const sendToAllWindows = require('./send-to-all-windows');
const createMenu = require('./create-menu');

const mainWindow = require('../windows/main');

global.updateSilent = true;
global.updateAvailable = false;

autoUpdater.on('update-available', (info) => {
  if (!global.updateSilent) {
    dialog.showMessageBox(mainWindow.get(), {
      title: 'An Update is Available',
      message: 'There is an available update. It is being downloaded. We will let you know when it is ready',
    });
    global.updateSilent = true;
  }

  sendToAllWindows('log', info);
});

autoUpdater.on('update-not-available', (info) => {
  if (!global.updateSilent) {
    dialog.showMessageBox(mainWindow.get(), {
      title: 'No Updates',
      message: 'There are currently no updates available.',
    });
    global.updateSilent = true;
  }

  sendToAllWindows('log', info);
});

autoUpdater.on('error', (err) => {
  if (!global.updateSilent) {
    dialog.showMessageBox(mainWindow.get(), {
      title: 'Failed to Check for Updates',
      message: 'Failed to check for updates. Please check your Internet connection.',
    });
    global.updateSilent = true;
  }

  sendToAllWindows('log', err);
});

autoUpdater.on('update-downloaded', (info) => {
  global.updateDownloaded = true;

  createMenu();

  const dialogOpts = {
    type: 'info',
    buttons: ['Restart', 'Later'],
    title: 'Application Update',
    detail: `A new version (${info.version}) has been downloaded. Restart the application to apply the updates.`,
  };

  dialog.showMessageBox(mainWindow.get(), dialogOpts, (response) => {
    if (response === 0) {
      // Fix autoUpdater.quitAndInstall() does not quit immediately
      // https://github.com/electron/electron/issues/3583
      // https://github.com/electron-userland/electron-builder/issues/1604
      setImmediate(() => {
        app.removeAllListeners('window-all-closed');
        if (mainWindow.get() != null) {
          mainWindow.get().close();
        }
        autoUpdater.quitAndInstall(false);
      });
    }
  });
});

autoUpdater.checkForUpdates();
