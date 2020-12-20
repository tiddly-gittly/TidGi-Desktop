import { ipcMain } from 'electron';

import * as mainWindow from '../windows/main';
import { mainBindings } from '../libs/i18next-electron-fs-backend';

export default function bindI18nListener() {
  mainBindings(ipcMain, mainWindow.get());
}
