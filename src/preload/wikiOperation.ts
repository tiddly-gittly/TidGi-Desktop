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
import { ipcRenderer, webFrame } from 'electron';
import type { ITiddlerFields } from 'tiddlywiki';

export const wikiOperations = {
  [WikiChannel.setState]: async (stateKey: string, content: string) => {
    await executeTWJavaScriptWhenIdle(
      `
      $tw.wiki.addTiddler({ title: '$:/state/${stateKey}', text: \`${content}\` });
    `,
    );
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
        });
      };
      ${executeHandlerCode}
    })
  `);
}

/**
 * add tiddler
 *
 * @param title tiddler title
 * @param text tiddler text
 * @param options stringifyed JSON object, is `{}` by default.
 * @param extraMeta extra meta data, is `{}` by default, a JSONStringified object
 *
 * ## options
 *
 * - withDate: boolean, whether to add `created` and `modified` field to tiddler
 */
ipcRenderer.on(WikiChannel.addTiddler, async (event, nonceReceived: number, title: string, text: string, extraMeta: string = '{}', optionsString: string = '{}') => {
  const options = JSON.parse(optionsString) as { withDate?: boolean };
  await executeTWJavaScriptWhenIdle(`
    const dateObject = {};
    ${
    options.withDate === true
      ? `
    const existedTiddler = $tw.wiki.getTiddler(\`${title}\`);
    let created = existedTiddler?.fields?.created;
    const modified = $tw.utils.stringifyDate(new Date());
    if (!existedTiddler) {
      created = $tw.utils.stringifyDate(new Date());
    }
    dateObject.created = created;
    dateObject.modified = modified;
    `
      : ''
  }
    $tw.wiki.addTiddler({ title: \`${title}\`, text: \`${text}\`, ...${extraMeta}, ...dateObject });
  `);
  ipcRenderer.send(WikiChannel.addTiddler, nonceReceived);
});
// get tiddler text
ipcRenderer.on(WikiChannel.getTiddlerText, async (event, nonceReceived: number, title: string) => {
  const tiddlerText: string = await (webFrame.executeJavaScript(`
    $tw.wiki.getTiddlerText(\`${title}\`);
  `) as Promise<string>);
  ipcRenderer.send(WikiChannel.getTiddlerTextDone, nonceReceived, tiddlerText);
});
ipcRenderer.on(WikiChannel.runFilter, async (event, nonceReceived: number, filter: string) => {
  const filterResult: string[] = await (webFrame.executeJavaScript(`
    $tw.wiki.compileFilter(\`${filter}\`)()
  `) as Promise<string[]>);
  ipcRenderer.send(WikiChannel.runFilter, nonceReceived, filterResult);
});
ipcRenderer.on(WikiChannel.getTiddlersAsJson, async (event, nonceReceived: number, filter: string) => {
  /**
   * Modified from `$tw.wiki.getTiddlersAsJson` (it will turn tags into string, so we are not using it.)
   * This modified version will return Object
   */
  const filterResult: ITiddlerFields = await (webFrame.executeJavaScript(`
    $tw.wiki.filterTiddlers(\`${filter}\`).map(title => {
      const tiddler = $tw.wiki.getTiddler(title);
      return tiddler?.fields;
    }).filter(item => item !== undefined)
  `) as Promise<ITiddlerFields>);
  ipcRenderer.send(WikiChannel.getTiddlersAsJson, nonceReceived, filterResult);
});
// set tiddler text, we use workspaceID as callback id
ipcRenderer.on(WikiChannel.setTiddlerText, async (event, nonceReceived: number, title: string, value: string) => {
  await executeTWJavaScriptWhenIdle(`
    $tw.wiki.setText(\`${title}\`, 'text', undefined, \`${value}\`);
  `);
  ipcRenderer.send(WikiChannel.setTiddlerText, nonceReceived);
});
// add snackbar to notify user
ipcRenderer.on(WikiChannel.syncProgress, async (event, message: string) => {
  await executeTWJavaScriptWhenIdle(
    `
    $tw.wiki.addTiddler({ title: '$:/state/notification/${WikiChannel.syncProgress}', text: \`${message}\` });
    $tw.notifier.display('$:/state/notification/${WikiChannel.syncProgress}');
  `,
    // requestIdleCallback seem to only execute when app page is visible. So there will be tons of scheduled sync when user open the app, unless we set `onlyWhenVisible: true`
    // other generalNotification should be stacked
    { onlyWhenVisible: true },
  );
});
ipcRenderer.on(
  WikiChannel.setState,
  (_event: Electron.IpcRendererEvent, ...rest: Parameters<typeof wikiOperations[WikiChannel.setState]>) => wikiOperations[WikiChannel.setState](...rest),
);
ipcRenderer.on(WikiChannel.generalNotification, async (event, message: string) => {
  await executeTWJavaScriptWhenIdle(`
    $tw.wiki.addTiddler({ title: \`$:/state/notification/${WikiChannel.generalNotification}\`, text: \`${message}\` });
    $tw.notifier.display(\`$:/state/notification/${WikiChannel.generalNotification}\`);
  `);
});
// open a tiddler
ipcRenderer.on(WikiChannel.openTiddler, async (event, tiddlerName: string) => {
  const trimmedTiddlerName = tiddlerName.replaceAll('\n', '');
  // iterate until we find NavigatorWidget, this normally needs to be Widget > Widget > ElementWidget > TranscludeWidget > TranscludeWidget > ImportVariablesWidget > VarsWidget > ElementWidget > NavigatorWidget
  await executeTWJavaScriptWhenIdle(`
    let currentHandlerWidget = $tw.rootWidget
    let handled = false;
    while (currentHandlerWidget && !handled) {
      const bubbled = currentHandlerWidget.dispatchEvent({ type: "tm-navigate", navigateTo: \`${trimmedTiddlerName}\`, param: \`${trimmedTiddlerName}\` });
      handled = !bubbled;
      currentHandlerWidget = currentHandlerWidget.children?.[0]
    }
  `);
});
// send an action message
ipcRenderer.on(WikiChannel.sendActionMessage, async (event, actionMessage: string) => {
  await executeTWJavaScriptWhenIdle(`
    $tw.rootWidget.dispatchEvent({ type: \`${actionMessage}\` });
  `);
});
ipcRenderer.on(WikiChannel.deleteTiddler, async (event, title: string) => {
  await executeTWJavaScriptWhenIdle(`
    $tw.wiki.deleteTiddler(\`${title}\`);
  `);
});

ipcRenderer.on(WikiChannel.printTiddler, async (event, tiddlerName?: string) => {
  const printer = await import('../services/libs/printer');
  if (typeof tiddlerName !== 'string' || tiddlerName.length === 0) {
    tiddlerName = await (webFrame.executeJavaScript(`
    $tw.wiki.getTiddlerText('$:/temp/focussedTiddler');
  `) as Promise<string>);
  }
  await executeTWJavaScriptWhenIdle(`
    var page = (${printer.printTiddler.toString()})(\`${tiddlerName}\`);
    page?.print?.();
    page?.close?.();
  `);
});
