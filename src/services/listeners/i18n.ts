// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'ipcMain'.
import { ipcMain } from 'electron';

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'mainWindow... Remove this comment to see the full error message
import * as mainWindow from '../windows/main';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'mainBindin... Remove this comment to see the full error message
import { mainBindings } from '../libs/i18next-electron-fs-backend';

export default function bindI18nListener() {
  mainBindings(ipcMain, mainWindow.get());
};
