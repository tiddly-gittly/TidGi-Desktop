const { ipcMain } = require('electron');

const mainWindow = require('../windows/main');
const { mainBindings } = require('../libs/i18next-electron-fs-backend');

module.exports = function bindI18nListener() {
  mainBindings(ipcMain, mainWindow.get());
};
