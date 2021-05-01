/* eslint-disable global-require */
import Transport from 'winston-transport';

import { container } from '@services/container';
import type { IViewService } from '@services/view/interface';
import type { IWindowService } from '@services/windows/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { WindowNames } from '@services/windows/WindowProperties';
import { WikiChannel } from '@/constants/channels';

const handlers = {
  createWikiProgress: (message: string) => {
    const windowService = container.get<IWindowService>(serviceIdentifier.Window);
    const createWorkspaceWindow = windowService.get(WindowNames.addWorkspace);
    createWorkspaceWindow?.webContents?.send(WikiChannel.createProgress, message);
  },
  wikiSyncProgress: async (message: string) => {
    const viewService = container.get<IViewService>(serviceIdentifier.View);
    const browserView = await viewService.getActiveBrowserView();
    browserView?.webContents?.send(WikiChannel.syncProgress, message);
  },
};

export type IHandlers = typeof handlers;

export interface IInfo {
  /** which method or handler function we are logging for */
  handler: keyof IHandlers;
  /** the detailed massage for debugging */
  message: string;
}

/**
 * Send some log to renderer progress for user to read, for example, wiki creation progress.
 */
export default class RendererTransport extends Transport {
  log(info: IInfo, callback: () => unknown): void {
    setImmediate(() => {
      this.emit('logged', info);
    });

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (info.handler && info.handler in handlers) {
      void handlers[info.handler](info.message);
    }

    callback();
  }
}
