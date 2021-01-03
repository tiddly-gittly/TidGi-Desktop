import { ipcMain } from 'electron';

import { container } from '@/services/container';
import { Window } from '@/services/windows';
import { WindowNames } from '@/services/windows/WindowProperties';
import { mainBindings } from './i18next-electron-fs-backend';

export default function bindI18nListener(): void {
  const windows = container.resolve(Window);
  const mainWindow = windows.get(WindowNames.main);
  mainBindings(ipcMain, mainWindow);
}
