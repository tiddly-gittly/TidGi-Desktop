import path from 'path';
import { ipcMain } from 'electron';

ipcMain.handle(
  'get-constant',
  async (_event, key: string): Promise<any> => {
    const pathConstants: Record<string, any> = await import('@services/constants/paths');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return pathConstants[key];
  },
);
ipcMain.handle('get-basename', (event, pathString: string) => {
  return path.basename(pathString);
});
ipcMain.handle('get-dirname', (event, pathString: string) => {
  return path.dirname(pathString);
});
