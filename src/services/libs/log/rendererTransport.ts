/* eslint-disable global-require */
import Transport from 'winston-transport';

import { WikiChannel } from '@/constants/channels';
import { wikiOperations } from '@services/wiki/wikiOperations';

export interface IInfo {
  /** which method or handler function we are logging for */
  handler: WikiChannel.createProgress | WikiChannel.generalNotification | WikiChannel.syncProgress;
  /** workspace id */
  id: string;
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
    if (info.handler && info.handler in wikiOperations) {
      void wikiOperations[info.handler](info.id, info.message);
    }

    callback();
  }
}
