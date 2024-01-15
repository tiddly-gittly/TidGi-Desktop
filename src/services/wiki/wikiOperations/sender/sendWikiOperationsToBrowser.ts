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

const sendNoWait = sendToMainWindowNoWait;
const sendAndWait = sendToMainWindowAndAwait;
/**
 * Handle sending message to trigger operations defined in `src/services/wiki/wikiOperations/executor/wikiOperationInBrowser.ts`
 */
export const getSendWikiOperationsToBrowser = (workspaceID: string) =>
  ({
    [WikiChannel.createProgress]: (message: string): void => {
      const windowService = container.get<IWindowService>(serviceIdentifier.Window);
      const createWorkspaceWindow = windowService.get(WindowNames.addWorkspace);
      createWorkspaceWindow?.webContents?.send(WikiChannel.createProgress, message);
    },
    [WikiChannel.syncProgress]: (message: string): void => {
      sendNoWait(WikiChannel.syncProgress, workspaceID, [message]);
    },
    [WikiChannel.deleteTiddler]: (title: string): void => {
      sendNoWait(WikiChannel.deleteTiddler, workspaceID, [title]);
    },
    [WikiChannel.generalNotification]: (message: string): void => {
      sendNoWait(WikiChannel.generalNotification, workspaceID, [message]);
    },
    [WikiChannel.openTiddler]: (tiddlerName: string): void => {
      sendNoWait(WikiChannel.openTiddler, workspaceID, [tiddlerName]);
    },
    [WikiChannel.setState]: (stateKey: WikiStateKey, content: string): void => {
      sendNoWait(WikiChannel.setState, workspaceID, [stateKey, content]);
    },
    [WikiChannel.getTiddlersAsJson]: async <T extends ITiddlerFields>(filterString: string): Promise<T | undefined> => {
      return await sendAndWait<T>(WikiChannel.getTiddlersAsJson, workspaceID, [filterString]);
    },
    [WikiChannel.runFilter]: async <T extends string[]>(filterString: string): Promise<T | undefined> => {
      return await sendAndWait<T>(WikiChannel.runFilter, workspaceID, [filterString]);
    },
    [WikiChannel.addTiddler]: async (
      title: string,
      text: string,
      meta?: Record<string, unknown>,
      options?: { timeout?: number; withDate?: boolean },
    ): Promise<void> => {
      const extraMeta = typeof meta === 'object' ? JSON.stringify(meta) : '{}';
      await sendAndWait(WikiChannel.addTiddler, workspaceID, [title, text, extraMeta, JSON.stringify(options ?? {})], options);
    },
    [WikiChannel.setTiddlerText]: async (title: string, value: string, options?: { timeout?: number }): Promise<void> => {
      await sendAndWait(WikiChannel.setTiddlerText, workspaceID, [title, value], options);
    },
    [WikiChannel.getTiddlerText]: async (title: string): Promise<void> => {
      return await sendAndWait(WikiChannel.getTiddlerText, workspaceID, [title]);
    },
    [WikiChannel.getTiddler]: async (title: string): Promise<void> => {
      return await sendAndWait(WikiChannel.getTiddler, workspaceID, [title]);
    },
    [WikiChannel.renderWikiText]: async (content: string): Promise<string | undefined> => {
      return await sendAndWait(WikiChannel.renderWikiText, workspaceID, [content]);
    },
  }) as const;
export type ISendWikiOperationsToBrowser = ReturnType<typeof getSendWikiOperationsToBrowser>;
