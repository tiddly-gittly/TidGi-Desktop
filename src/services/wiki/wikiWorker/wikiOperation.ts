/* eslint-disable @typescript-eslint/promise-function-async */
/* eslint-disable no-new-func */
/* eslint-disable @typescript-eslint/no-implied-eval */
/**
 * Run some wiki operations on server side, so it works even when the wiki browser view is not visible.
 */

import type { ITiddlyWiki } from 'tiddlywiki';
import { IWikiOperations } from '../wikiOperations';

export class IpcServerRoutes {
  private wikiInstance!: ITiddlyWiki;
  private readonly pendingIpcServerRoutesRequests: Array<(value: void | PromiseLike<void>) => void> = [];

  setWikiInstance(wikiInstance: ITiddlyWiki) {
    this.wikiInstance = wikiInstance;
    this.pendingIpcServerRoutesRequests.forEach((resolve) => {
      resolve();
    });
  }

  private async waitForIpcServerRoutesAvailable() {
    if (this.wikiInstance !== undefined) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.pendingIpcServerRoutesRequests.push(resolve);
    });
  }

  private executeTWJavaScriptWhenIdle(script: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          const result = new Function(`const $tw = arguments[0];return ${script}`)(this.wikiInstance) as unknown;
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, 1);
    });
  }

  //  ██████  ██████  ███████ ██████   █████  ████████ ██  ██████  ███    ██ ███████
  // ██    ██ ██   ██ ██      ██   ██ ██   ██    ██    ██ ██    ██ ████   ██ ██
  // ██    ██ ██████  █████   ██████  ███████    ██    ██ ██    ██ ██ ██  ██ ███████
  // ██    ██ ██      ██      ██   ██ ██   ██    ██    ██ ██    ██ ██  ██ ██      ██
  //  ██████  ██      ███████ ██   ██ ██   ██    ██    ██  ██████  ██   ████ ███████
  public wikiOperation<OP extends keyof IWikiOperations, T = string[]>(
    operationType: OP,
    ...arguments_: Parameters<IWikiOperations[OP]>
  ): undefined | ReturnType<IWikiOperations[OP]> {
    if (typeof wikiOperations[operationType] !== 'function') {
      throw new TypeError(`${operationType} gets no useful handler`);
    }
    if (!Array.isArray(arguments_)) {
      // TODO: better type handling here
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/restrict-template-expressions
      throw new TypeError(`${(arguments_ as any) ?? ''} (${typeof arguments_}) is not a good argument array for ${operationType}`);
    }
    // @ts-expect-error A spread argument must either have a tuple type or be passed to a rest parameter.ts(2556) this maybe a bug of ts... try remove this comment after upgrade ts. And the result become void is weird too.
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    return wikiOperations[operationType]<T>(...arguments_) as unknown as ReturnType<IWikiOperations[OP]>;
  }
}

export const ipcServerRoutes: IpcServerRoutes = new IpcServerRoutes();
