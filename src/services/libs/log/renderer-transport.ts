/* eslint-disable global-require */
import Transport from 'winston-transport';

import { container } from '@services/container';
import { View } from '@services/view';
import { Window } from '@services/windows';
import { WindowNames } from '@services/windows/WindowProperties';

const handlers = {
  createWikiProgress: (message: string) => {
    const windowService = container.resolve(Window);
    const createWorkspaceWindow = windowService.get(WindowNames.addWorkspace);
    createWorkspaceWindow?.webContents?.send('create-wiki-progress', message);
  },
  wikiSyncProgress: (message: string) => {
    const viewService = container.resolve(View);
    const browserView = viewService.getActiveBrowserView();
    browserView?.webContents?.send('wiki-sync-progress', message);
  },
};

export type IHandlers = typeof handlers;

export interface IInfo {
  /** which method or handler function we are logging for */
  handler: keyof IHandlers;
  /** the detailed massage for debugging */
  message: string;
}

export default class RendererTransport extends Transport {
  log(info: IInfo, callback: () => unknown): void {
    setImmediate(() => {
      this.emit('logged', info);
    });

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (info.handler && info.handler in handlers) {
      handlers[info.handler](info.message);
    }

    callback();
  }
}
