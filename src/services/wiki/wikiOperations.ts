/**
 * Can't use logger in this file:
 * ERROR in Circular dependency detected: src/services/libs/log/index.ts -> src/services/libs/log/rendererTransport.ts -> src/services/wiki/wikiOperations.ts -> src/services/libs/log/index.ts
 */

import { WikiChannel } from '@/constants/channels';
import { WikiStateKey } from '@/constants/wiki';
import { container } from '@services/container';
import { sendToMainWindowAndAwait, sendToMainWindowNoWait } from '@services/libs/sendToMainWindow';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import type { ITiddlerFields } from 'tiddlywiki';

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
  [WikiChannel.deleteTiddler]: (workspaceID: string, title: string): void => {
    sendToMainWindowNoWait(WikiChannel.deleteTiddler, workspaceID, [title]);
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
  [WikiChannel.getTiddlersAsJson]: async <T extends ITiddlerFields>(workspaceID: string, filterString: string): Promise<T | undefined> => {
    return await sendToMainWindowAndAwait<T>(WikiChannel.getTiddlersAsJson, workspaceID, [filterString]);
  },
  [WikiChannel.runFilter]: async <T extends string[]>(workspaceID: string, filterString: string): Promise<T | undefined> => {
    return await sendToMainWindowAndAwait<T>(WikiChannel.runFilter, workspaceID, [filterString]);
  },
  [WikiChannel.addTiddler]: async (
    workspaceID: string,
    title: string,
    text: string,
    meta?: Record<string, unknown>,
    options?: { timeout?: number; withDate?: boolean },
  ): Promise<void> => {
    const extraMeta = typeof meta === 'object' ? JSON.stringify(meta) : '{}';
    await sendToMainWindowAndAwait(WikiChannel.addTiddler, workspaceID, [title, text, extraMeta, JSON.stringify(options ?? {})], options);
  },
  [WikiChannel.setTiddlerText]: async (workspaceID: string, title: string, value: string, options?: { timeout?: number }): Promise<void> => {
    await sendToMainWindowAndAwait(WikiChannel.setTiddlerText, workspaceID, [title, value], options);
  },
};
export type IWikiOperations = typeof wikiOperations;
