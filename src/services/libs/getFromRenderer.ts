import { Channels } from '@/constants/channels';
import { BrowserWindow, ipcMain, WebContentsView } from 'electron';

/**
 * Get data from a WebContentsView
 * @param channel
 * @param viewToGetData
 */
export default async function getFromRenderer<T>(channel: Channels, viewToGetData: WebContentsView | BrowserWindow): Promise<T> {
  // prevent several ipc happened together, and later return too early so first get the result that is for later one
  const ipcToken = String(Math.random());
  viewToGetData.webContents.send(channel, { ipcToken });
  return await new Promise((resolve) => {
    ipcMain.once(`${channel}-${ipcToken}`, (_event, data: T) => {
      resolve(data);
    });
  });
}
