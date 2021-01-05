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
ipcMain.on('get-basename', (event, pathString: string) => {
  event.returnValue = path.basename(pathString);
});
ipcMain.on('get-dirname', (event, pathString: string) => {
  event.returnValue = path.dirname(pathString);
});
