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
import type { ITiddlerFields, Tiddler } from 'tiddlywiki';

/**
 * Use scripts from wikiOperationScripts.
 *
 * Also need to modify `src/services/wiki/wikiOperations/sender/sendWikiOperationsToBrowser.ts`
 */
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
    const tiddlerText: string = await (executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.getTiddlerText](title)));
    ipcRenderer.send(WikiChannel.getTiddlerText, nonceReceived, tiddlerText);
  },
  [WikiChannel.getTiddler]: async (nonceReceived: number, title: string) => {
    const tiddler: Tiddler = await (executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.getTiddler](title)));
    ipcRenderer.send(WikiChannel.getTiddler, nonceReceived, tiddler);
  },
  [WikiChannel.runFilter]: async (nonceReceived: number, filter: string) => {
    const filterResult: string[] = await (executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.runFilter](filter)));
    ipcRenderer.send(WikiChannel.runFilter, nonceReceived, filterResult);
  },
  [WikiChannel.getTiddlersAsJson]: async (nonceReceived: number, filter: string) => {
    const filterResult: ITiddlerFields[] = await (executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.getTiddlersAsJson](filter)));
    ipcRenderer.send(WikiChannel.getTiddlersAsJson, nonceReceived, filterResult);
  },
  [WikiChannel.setTiddlerText]: async (nonceReceived: number, title: string, value: string) => {
    await executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.setTiddlerText](title, value));
    ipcRenderer.send(WikiChannel.setTiddlerText, nonceReceived);
  },
  [WikiChannel.renderWikiText]: async (nonceReceived: number, content: string) => {
    const renderResult = await (executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.renderWikiText](content)));
    ipcRenderer.send(WikiChannel.renderWikiText, nonceReceived, renderResult);
  },
  [WikiChannel.openTiddler]: async (nonceReceived: number, tiddlerName: string) => {
    await executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.openTiddler](tiddlerName));
  },
  [WikiChannel.dispatchEvent]: async (nonceReceived: number, actionMessage: string) => {
    await executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.dispatchEvent](actionMessage));
  },
  [WikiChannel.invokeActionsByTag]: async (nonceReceived: number, tag: string, stringifiedData: string) => {
    await executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.invokeActionsByTag](tag, stringifiedData));
  },
  [WikiChannel.deleteTiddler]: async (nonceReceived: number, title: string) => {
    await executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.deleteTiddler](title));
  },
  // web only methods from src/services/wiki/wikiOperations/web.ts
  [WikiChannel.syncProgress]: async (nonceReceived: number, message: string) => {
    await executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.syncProgress](message));
  },
  [WikiChannel.generalNotification]: async (nonceReceived: number, message: string) => {
    await executeTWJavaScriptWhenIdle(wikiOperationScripts[WikiChannel.generalNotification](message));
  },
  [WikiChannel.printTiddler]: async (nonceReceived: number, tiddlerName: string) => {
    const printScript = await wikiOperationScripts[WikiChannel.printTiddler](tiddlerName);
    await executeTWJavaScriptWhenIdle(printScript);
  },
};

/**
 * Execute statement with $tw when idle, so there won't be significant lagging.
 * Will retry till $tw is not undefined.
 * @param script js statement to be executed, add `return` if you want the result.
 */
async function executeTWJavaScriptWhenIdle<T>(script: string, options?: { onlyWhenVisible?: boolean }): Promise<T> {
  const executeHandlerCode = options?.onlyWhenVisible === true
    ? `
        if (document.visibilityState === 'visible') {
          handler();
        }`
    : `handler();`;
  // requestIdleCallback won't execute when wiki browser view is invisible https://eric-schaefer.com/til/2023/03/11/the-dark-side-of-requestidlecallback/
  const idleCallbackOptions = options?.onlyWhenVisible === true ? '' : `{ timeout: 500 }`;
  const finalScriptToRun = `
    (async () => await new Promise((resolve, reject) => {
      const handler = () => {
        requestIdleCallback(() => {
          if (typeof $tw?.rootWidget !== 'undefined' && typeof $tw?.wiki !== 'undefined') {
            try {
              const result = (() => {
                ${script}
              })();
              resolve(result);
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
    }))()
`;
  try {
    const result = await (webFrame.executeJavaScript(finalScriptToRun) as Promise<T>);
    return result;
  } catch (error) {
    console.warn(`wikiOperationInBrowser.executeTWJavaScriptWhenIdle The script has error ${(error as Error).message}\n\n ${finalScriptToRun}`);
    throw error;
  }
}

// Attaching the ipcRenderer listeners
for (const [channel, operation] of Object.entries(wikiOperations)) {
  ipcRenderer.on(channel, async (event, ...arguments_) => {
    try {
      // @ts-expect-error A spread argument must either have a tuple type or be passed to a rest parameter.ts(2556) this maybe a bug of ts... try remove this comment after upgrade ts. And the result become void is weird too.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await operation(...arguments_);
    } catch (error) {
      console.warn(`wikiOperationInBrowser.ipcRenderer.on ${channel} The script has error ${(error as Error).message}\n\n arguments_: ${JSON.stringify(arguments_)}`);
      const nonceReceived = arguments_[0] as string;
      // send error back to main thread. This can't handle custom error, but system error is OK.
      // See src/services/libs/sendToMainWindow.ts 's `listener` for the receiver of error.
      ipcRenderer.send(channel, nonceReceived, undefined, error);
    }
  });
}
