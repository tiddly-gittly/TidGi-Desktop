/* eslint-disable @typescript-eslint/no-implied-eval */
/**
 * Run some wiki operations on server side, so it works even when the wiki browser view is not visible.
 */

import { WikiChannel } from '@/constants/channels';
import type { ITiddlerFields, ITiddlyWiki, Tiddler } from 'tiddlywiki';
import { wikiOperationScripts } from './scripts/common';

export type IWorkerWikiOperations = typeof wikiOperationsInWikiWorker.wikiOperationsInServer;

/**
 * Similar to src/preload/wikiOperation.ts , but runs on the server side.
 */
export class WikiOperationsInWikiWorker {
  private wikiInstance!: ITiddlyWiki;
  private readonly pendingWikiOperationsInWikiWorkerRequests: Array<(value: void | PromiseLike<void>) => void> = [];

  setWikiInstance(wikiInstance: ITiddlyWiki) {
    this.wikiInstance = wikiInstance;
    this.pendingWikiOperationsInWikiWorkerRequests.forEach((resolve) => {
      resolve();
    });
  }

  private async waitForWikiOperationsInWikiWorkerAvailable() {
    if (this.wikiInstance !== undefined) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.pendingWikiOperationsInWikiWorkerRequests.push(resolve);
    });
  }

  private async executeTWJavaScriptWhenIdle(script: string): Promise<unknown> {
    await this.waitForWikiOperationsInWikiWorkerAvailable();
    return await new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          const result = new Function('$tw', script)(this.wikiInstance) as unknown;
          resolve(result);
        } catch (error_: unknown) {
          const error = error_ as Error;
          reject(error);
        }
      }, 1);
    });
  }

  public readonly wikiOperationsInServer = {
    [WikiChannel.setState]: async (stateKey: string, content: string) => {
      await this.executeTWJavaScriptWhenIdle(
        wikiOperationScripts[WikiChannel.setState](stateKey, content),
      );
    },
    [WikiChannel.addTiddler]: async (title: string, text: string, extraMeta = '{}', optionsString = '{}') => {
      await this.executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.addTiddler](title, text, extraMeta, optionsString));
    },
    [WikiChannel.getTiddlerText]: async (title: string) => {
      const tiddlerText: string = await (this.executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.getTiddlerText](title)) as Promise<string>);
      return tiddlerText;
    },
    [WikiChannel.getTiddler]: async (title: string) => {
      const tiddler: Tiddler = await (this.executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.getTiddler](title)) as Promise<Tiddler>);
      return tiddler;
    },
    [WikiChannel.runFilter]: async (filter: string) => {
      const filterResult: string[] = await (this.executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.runFilter](filter)) as Promise<string[]>);
      return filterResult;
    },
    [WikiChannel.getTiddlersAsJson]: async (filter: string) => {
      const filterResult: ITiddlerFields[] = await (this.executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.getTiddlersAsJson](filter)) as Promise<ITiddlerFields[]>);
      return filterResult;
    },
    [WikiChannel.setTiddlerText]: async (title: string, value: string) => {
      await this.executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.setTiddlerText](title, value));
    },
    [WikiChannel.renderWikiText]: async (content: string) => {
      const renderResult = await (this.executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.renderWikiText](content)) as Promise<string>);
      return renderResult;
    },
    [WikiChannel.dispatchEvent]: async (actionMessage: string) => {
      await this.executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.dispatchEvent](actionMessage));
    },
    [WikiChannel.invokeActionsByTag]: async (tag: string, data: Record<string, unknown>) => {
      await this.executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.invokeActionsByTag](tag, JSON.stringify(data)));
    },
    [WikiChannel.deleteTiddler]: async (title: string) => {
      await this.executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.deleteTiddler](title));
    },
    // web only methods from src/services/wiki/wikiOperations/web.ts
    // are not included here. Only in `src/preload/wikiOperation.ts` which runs in browser side.
  };

  //  ██████  ██████  ███████ ██████   █████  ████████ ██  ██████  ███    ██ ███████
  // ██    ██ ██   ██ ██      ██   ██ ██   ██    ██    ██ ██    ██ ████   ██ ██
  // ██    ██ ██████  █████   ██████  ███████    ██    ██ ██    ██ ██ ██  ██ ███████
  // ██    ██ ██      ██      ██   ██ ██   ██    ██    ██ ██    ██ ██  ██ ██      ██
  //  ██████  ██      ███████ ██   ██ ██   ██    ██    ██  ██████  ██   ████ ███████
  public wikiOperation<OP extends keyof typeof this.wikiOperationsInServer>(
    operationType: OP,
    ...arguments_: Parameters<IWorkerWikiOperations[OP]>
  ): undefined | ReturnType<IWorkerWikiOperations[OP]> {
    if (typeof this.wikiOperationsInServer[operationType] !== 'function') {
      throw new TypeError(`${operationType} gets no useful handler`);
    }
    if (!Array.isArray(arguments_)) {
      throw new TypeError(`${JSON.stringify((arguments_ as unknown) ?? '')} (${typeof arguments_}) is not a good argument array for ${operationType}`);
    }
    // @ts-expect-error A spread argument must either have a tuple type or be passed to a rest parameter.ts(2556) this maybe a bug of ts... try remove this comment after upgrade ts. And the result become void is weird too.

    return this.wikiOperationsInServer[operationType]<T>(...arguments_) as unknown as ReturnType<IWorkerWikiOperations[OP]>;
  }
}

export const wikiOperationsInWikiWorker = new WikiOperationsInWikiWorker();
