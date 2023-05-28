/**
 * Can't use logger in this file:
 * ERROR in Circular dependency detected: src/services/libs/log/index.ts -> src/services/libs/log/rendererTransport.ts -> src/services/wiki/wikiOperations.ts -> src/services/libs/log/index.ts
 */
import { ipcMain } from 'electron';

import { WikiChannel } from '@/constants/channels';
import { container } from '@services/container';
import serviceIdentifier from '@services/serviceIdentifier';
import { IViewService } from '@services/view/interface';
import { WindowNames } from '@services/windows/WindowProperties';

/**
 * Send to main window renderer (preload script) and not wait for response (fire and forget)
 */
export function sendToMainWindowNoWait(type: WikiChannel, workspaceID: string, messages: string[]): void {
  const viewService = container.get<IViewService>(serviceIdentifier.View);
  const browserView = viewService.getView(workspaceID, WindowNames.main);
  browserView?.webContents?.send?.(type, ...messages);
}
/**
 * Send to main window renderer (preload script) and wait for response.
 *
 * Will throw error when on Windows and App is at background (BrowserView will disappear and not accessible.) https://github.com/tiddly-gittly/TidGi-Desktop/issues/398
 *
 * @param type The handler on renderer (preload script) side should implement `ipcRenderer.send(WikiChannel.xxx, nonceReceived, result);`, where `result` is usually `string[]` (the default type for `<T>` in function signature)
 * @returns undefined if main window webContents is not found
 */
export async function sendToMainWindowAndAwait<T = string[]>(type: WikiChannel, workspaceID: string, messages: string[], options?: { timeout?: number }): Promise<T | undefined> {
  const viewService = container.get<IViewService>(serviceIdentifier.View);
  const browserView = viewService.getView(workspaceID, WindowNames.main);
  if ((browserView?.webContents) === undefined) {
    throw new Error(`browserView.webContents is undefined in sendToMainWindowAndAwait ${workspaceID} when running ${type}`);
  }
  return await new Promise<T>((resolve, reject) => {
    const nonce = Math.random();
    browserView?.webContents?.send?.(type, nonce, ...messages);
    let timeoutHandle: NodeJS.Timeout;
    if (options?.timeout !== undefined) {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`${type} for ${workspaceID} in sendToMainWindowAndAwait Timeout after ${String(options.timeout)}ms`));
      }, options.timeout);
    }
    /**
     * Use nonce to prevent data racing
     */
    const listener = (_event: Electron.IpcMainEvent, nonceReceived: number, value: T): void => {
      if (nonce === nonceReceived) {
        clearTimeout(timeoutHandle);
        ipcMain.removeListener(type, listener);
        resolve(value);
      }
    };
    ipcMain.on(type, listener);
  });
}
