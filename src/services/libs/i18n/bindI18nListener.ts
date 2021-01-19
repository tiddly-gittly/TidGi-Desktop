import { ipcMain } from 'electron';

import { container } from '@services/container';
import type { IWindowService } from '@services/windows';
import { WindowNames } from '@services/windows/WindowProperties';
import { mainBindings } from './i18next-electron-fs-backend';
import serviceIdentifier from '@services/serviceIdentifier';

export default function bindI18nListener(): void {
  const windows = container.get<IWindowService>(serviceIdentifier.Window);
  const mainWindow = windows.get(WindowNames.main);
  if (mainWindow === undefined) {
    throw new Error('Window is undefined in bindI18nListener()');
  }
  mainBindings(ipcMain, mainWindow);
}
