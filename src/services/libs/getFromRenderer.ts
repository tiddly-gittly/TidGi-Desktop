import { ipcMain, BrowserView, BrowserWindow } from 'electron';
import { v4 as uuid } from 'uuid';
import { Channels } from '@/constants/channels';

/**
 * Get data from a BrowserView
 * @param channel
 * @param viewToGetData
 */
export default async function getFromRenderer<T>(channel: Channels, viewToGetData: BrowserView | BrowserWindow): Promise<T> {
  // prevent several ipc happened together, and later return too early so first get the result that is for later one
  const ipcToken = uuid();
  viewToGetData.webContents.send(channel, { ipcToken });
  return await new Promise((resolve) => {
    ipcMain.once(`${channel}-${ipcToken}`, (_event, data: T) => resolve(data));
  });
}
