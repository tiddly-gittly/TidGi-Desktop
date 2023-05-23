import { ipcMain } from 'electron';

import { WikiChannel } from '@/constants/channels';
import { WikiStateKey } from '@/constants/wiki';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { IViewService } from '@services/view/interface';
import { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';

/**
 * Send to main window renderer (preload script) and not wait for response (fire and forget)
 */
function sendToMainWindowNoWait(type: WikiChannel, workspaceID: string, messages: string[]): void {
  const viewService = container.get<IViewService>(serviceIdentifier.View);
  const browserView = viewService.getView(workspaceID, WindowNames.main);
  browserView?.webContents?.send?.(type, ...messages);
}
/**
 * Send to main window renderer (preload script) and wait for response
 * @param type The handler on renderer (preload script) side should implement `ipcRenderer.send(WikiChannel.xxx, nonceReceived, result);`, where `result` is usually `string[]` (the default type for `<T>` in function signature)
 * @returns undefined if main window webContents is not found
 */
async function sendToMainWindowAndAwait<T = string[]>(type: WikiChannel, workspaceID: string, messages: string[], options?: { timeout?: number }): Promise<T | undefined> {
  const viewService = container.get<IViewService>(serviceIdentifier.View);
  const browserView = viewService.getView(workspaceID, WindowNames.main);
  if ((browserView?.webContents) === undefined) {
    logger.error(`browserView.webContents is undefined in sendToMainWindowAndAwait ${workspaceID} when running ${type}`);
    return;
  }
  return await new Promise<T>((resolve, reject) => {
    browserView?.webContents?.send?.(type, ...messages);
    let timeoutHandle: NodeJS.Timeout;
    if (options?.timeout !== undefined) {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`${type} for ${workspaceID} in sendToMainWindowAndAwait Timeout after ${String(options.timeout)}ms`));
      }, options.timeout);
    }
    /**
     * Use nonce to prevent data racing
     */
    const nonce = Math.random();
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
/**
 * Handle sending message to trigger operations defined in `src/preload/wikiOperation.ts`
 */
export const wikiOperations = {
  [WikiChannel.createProgress]: (workspaceID: string, message: string): void => {
    const windowService = container.get<IWindowService>(serviceIdentifier.Window);
    const createWorkspaceWindow = windowService.get(WindowNames.addWorkspace);
    createWorkspaceWindow?.webContents?.send(WikiChannel.createProgress, message);
  },
  [WikiChannel.syncProgress]: (workspaceID: string, message: string): void => {
    sendToMainWindowNoWait(WikiChannel.syncProgress, workspaceID, [message]);
  },
  [WikiChannel.generalNotification]: (workspaceID: string, message: string): void => {
    sendToMainWindowNoWait(WikiChannel.generalNotification, workspaceID, [message]);
  },
  [WikiChannel.openTiddler]: (workspaceID: string, tiddlerName: string): void => {
    sendToMainWindowNoWait(WikiChannel.openTiddler, workspaceID, [tiddlerName]);
  },
  [WikiChannel.setState]: (workspaceID: string, stateKey: WikiStateKey, content: string): void => {
    sendToMainWindowNoWait(WikiChannel.setState, workspaceID, [stateKey, content]);
  },
  [WikiChannel.runFilter]: async <T extends string[]>(workspaceID: string, filterString: string): Promise<T | undefined> => {
    return await sendToMainWindowAndAwait<T>(WikiChannel.runFilter, workspaceID, [filterString]);
  },
  [WikiChannel.setTiddlerText]: async (workspaceID: string, title: string, value: string, options?: { timeout?: number }): Promise<void> => {
    await sendToMainWindowAndAwait(WikiChannel.setTiddlerText, workspaceID, [title, value], options);
  },
};
export type IWikiOperations = typeof wikiOperations;
