import { app, ipcMain, nativeTheme, shell } from 'electron';

const loadListeners = (): void => {
  ipcMain.handle('request-open', (_event, uri: string, isDirectory: boolean) => {
    return isDirectory ? shell.showItemInFolder(uri) : shell.openExternal(uri);
  });
  ipcMain.handle('request-quit', () => {
    app.quit();
  });
};
export default loadListeners;
