import { app, ipcMain, nativeTheme, shell } from 'electron';
import createMenu from '@services/libs/create-menu';

const loadListeners = (): void => {
  ipcMain.handle('request-open', (_event, uri: string, isDirectory: boolean) => {
    return isDirectory ? shell.showItemInFolder(uri) : shell.openExternal(uri);
  });
  ipcMain.handle('request-quit', () => {
    app.quit();
  });
  
  // Native Theme
  ipcMain.handle('get-should-use-dark-colors', (_event) => {
    return nativeTheme.shouldUseDarkColors;
  });

  // if global.forceNewWindow = true
  // the next external link request will be opened in new window
  ipcMain.handle('request-set-global-force-new-window', (_event, value) => {
    // FIXME: don't use untyped global.xx
    // (global as any).forceNewWindow = value;
  });
};
export default loadListeners;
