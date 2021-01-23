import { ipcMain } from 'electron';

import { container } from '@services/container';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import serviceIdentifier from '@services/serviceIdentifier';

export default async function bindI18nListener(): Promise<void> {
  const windows = container.get<IWindowService>(serviceIdentifier.Window);
  const mainWindow = windows.get(WindowNames.main);
  if (mainWindow === undefined) {
    throw new Error('Window is undefined in bindI18nListener()');
  }
  const { mainBindings } = await import('./i18next-electron-fs-backend');
  mainBindings(ipcMain, mainWindow);
}
