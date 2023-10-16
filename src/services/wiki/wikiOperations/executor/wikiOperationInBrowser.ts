/* eslint-disable @typescript-eslint/promise-function-async */
/* eslint-disable @typescript-eslint/no-inferrable-types */
/* eslint-disable @typescript-eslint/no-misused-promises */
/**
 * Call tiddlywiki api from electron
 * This file should be required by view.ts preload script to work
 *
 * You can use wrapped method in `services/wiki/index.ts` 's `wikiOperation()` instead. Available operations are registered in `src/services/wiki/wikiOperations.ts`
 */
import { WikiChannel } from '@/constants/channels';
import { wikiOperationScripts } from '@services/wiki/wikiOperations/executor/scripts/web';
import { ipcRenderer, webFrame } from 'electron';
import type { ITiddlerFields } from 'tiddlywiki';

// use scripts from wikiOperationScripts
export const wikiOperations = {
  [WikiChannel.setState]: async (stateKey: string, content: string) => {
    await executeTWJavaScriptWhenIdle(
      wikiOperationScripts[WikiChannel.setState](stateKey, content),
    );
  },
  [WikiChannel.addTiddler]: async (nonceReceived: number, title: string, text: string, extraMeta: string = '{}', optionsString: string = '{}') => {
    await executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.addTiddler](title, text, extraMeta, optionsString));
    ipcRenderer.send(WikiChannel.addTiddler, nonceReceived);
  },
  [WikiChannel.getTiddlerText]: async (nonceReceived: number, title: string) => {
    const tiddlerText: string = await (webFrame.executeJavaScript(wikiOperationScripts[WikiChannel.getTiddlerText](title)) as Promise<string>);
    ipcRenderer.send(WikiChannel.getTiddlerTextDone, nonceReceived, tiddlerText);
  },
  [WikiChannel.runFilter]: async (nonceReceived: number, filter: string) => {
    const filterResult: string[] = await (webFrame.executeJavaScript(wikiOperationScripts[WikiChannel.runFilter](filter)) as Promise<string[]>);
    ipcRenderer.send(WikiChannel.runFilter, nonceReceived, filterResult);
  },
  [WikiChannel.getTiddlersAsJson]: async (nonceReceived: number, filter: string) => {
    const filterResult: ITiddlerFields[] = await (webFrame.executeJavaScript(wikiOperationScripts[WikiChannel.getTiddlersAsJson](filter)) as Promise<ITiddlerFields[]>);
    ipcRenderer.send(WikiChannel.getTiddlersAsJson, nonceReceived, filterResult);
  },
  [WikiChannel.setTiddlerText]: async (nonceReceived: number, title: string, value: string) => {
    await executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.setTiddlerText](title, value));
    ipcRenderer.send(WikiChannel.setTiddlerText, nonceReceived);
  },
  [WikiChannel.renderWikiText]: async (nonceReceived: number, content: string) => {
    const renderResult = await (webFrame.executeJavaScript(wikiOperationScripts[WikiChannel.renderWikiText](content)) as Promise<string>);
    ipcRenderer.send(WikiChannel.renderWikiText, nonceReceived, renderResult);
  },
  [WikiChannel.openTiddler]: async (tiddlerName: string) => {
    await executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.openTiddler](tiddlerName));
  },
  [WikiChannel.sendActionMessage]: async (actionMessage: string) => {
    await executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.sendActionMessage](actionMessage));
  },
  [WikiChannel.deleteTiddler]: async (title: string) => {
    await executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.deleteTiddler](title));
  },
  // web only methods from src/services/wiki/wikiOperations/web.ts
  [WikiChannel.syncProgress]: async (message: string) => {
    await executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.syncProgress](message));
  },
  [WikiChannel.generalNotification]: async (message: string) => {
    await executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.generalNotification](message));
  },
  [WikiChannel.printTiddler]: async (tiddlerName: string) => {
    const printScript = await wikiOperationScripts[WikiChannel.printTiddler](tiddlerName);
    await executeTWJavaScriptWhenIdle(printScript);
  },
};

/**
 * Execute statement with $tw when idle, so there won't be significant lagging.
 * Will retry till $tw is not undefined.
 * @param script js statement to be executed, nothing will be returned
 */
async function executeTWJavaScriptWhenIdle(script: string, options?: { onlyWhenVisible?: boolean }): Promise<void> {
  const executeHandlerCode = options?.onlyWhenVisible === true
    ? `
        if (document.visibilityState === 'visible') {
          handler();
        }`
    : `handler();`;
  // requestIdleCallback won't execute when wiki browser view is invisible https://eric-schaefer.com/til/2023/03/11/the-dark-side-of-requestidlecallback/
  const idleCallbackOptions = options?.onlyWhenVisible === true ? '' : `{ timeout: 500 }`;
  await webFrame.executeJavaScript(`
    new Promise((resolve, reject) => {
      const handler = () => {
        requestIdleCallback(() => {
          if (typeof $tw !== 'undefined') {
            try {
              ${script}
              resolve();
            } catch (error) {
              reject(error);
            }
          } else {
            // wait till $tw is not undefined.
            setTimeout(handler, 500);
          }
        }, ${idleCallbackOptions});
      };
      ${executeHandlerCode}
    })
  `);
}

// Attaching the ipcRenderer listeners
for (const [channel, operation] of Object.entries(wikiOperations)) {
  ipcRenderer.on(channel, async (event, ...arguments_) => {
    // @ts-expect-error A spread argument must either have a tuple type or be passed to a rest parameter.ts(2556) this maybe a bug of ts... try remove this comment after upgrade ts. And the result become void is weird too.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    await operation(...arguments_);
  });
}
