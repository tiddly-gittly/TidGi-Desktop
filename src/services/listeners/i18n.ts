// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'ipcMain'.
const { ipcMain } = require('electron');

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'mainWindow... Remove this comment to see the full error message
const mainWindow = require('../windows/main');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'mainBindin... Remove this comment to see the full error message
const { mainBindings } = require('../libs/i18next-electron-fs-backend');

module.exports = function bindI18nListener() {
  mainBindings(ipcMain, mainWindow.get());
};
