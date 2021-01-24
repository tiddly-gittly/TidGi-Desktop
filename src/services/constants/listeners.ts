import path from 'path';
import { ipcMain } from 'electron';

ipcMain.handle('get-basename', (event, pathString: string) => {
  return path.basename(pathString);
});
ipcMain.handle('get-dirname', (event, pathString: string) => {
  return path.dirname(pathString);
});
