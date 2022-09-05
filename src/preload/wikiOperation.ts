/* eslint-disable @typescript-eslint/no-inferrable-types */
/* eslint-disable @typescript-eslint/no-misused-promises */
/**
 * Call tiddlywiki api from electron
 * This file should be required by view.ts preload script to work
 */
import { ipcRenderer, webFrame } from 'electron';
import { delay } from 'bluebird';
import { WikiChannel } from '@/constants/channels';
import { native } from './common/services';

/**
 * Execute statement with $tw when idle, so there won't be significant lagging.
 * Will retry till $tw is not undefined.
 * @param script js statement to be executed, nothing will be returned
 */
async function executeTWJavaScriptWhenIdle(script: string, options?: { onlyWhenVisible?: boolean }): Promise<void> {
  const executeHandlerCode =
    options?.onlyWhenVisible === true
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

// add tiddler
ipcRenderer.on(WikiChannel.addTiddler, async (event, title: string, text: string, meta: unknown) => {
  const extraMeta = typeof meta === 'object' ? JSON.stringify(meta) : '{}';
  await executeTWJavaScriptWhenIdle(`
    $tw.wiki.addTiddler({ title: '${title}', text: '${text}', ...${extraMeta} });
  `);
  // wait for fs to be settle
  await delay(1000);
  await ipcRenderer.invoke(WikiChannel.addTiddlerDone);
});
// get tiddler text
ipcRenderer.on(WikiChannel.getTiddlerText, async (event, nonceReceived: number, title: string) => {
  const tiddlerText: string = await (webFrame.executeJavaScript(`
    $tw.wiki.getTiddlerText('${title}');
  `) as Promise<string>);
  ipcRenderer.send(WikiChannel.getTiddlerTextDone, nonceReceived, tiddlerText);
});
ipcRenderer.on(WikiChannel.runFilter, async (event, nonceReceived: number, filter: string) => {
  const filterResult: string[] = await (webFrame.executeJavaScript(`
    $tw.wiki.compileFilter('${filter}')()
  `) as Promise<string[]>);
  ipcRenderer.send(WikiChannel.runFilterDone, nonceReceived, filterResult);
});
// set tiddler text, we use workspaceID as callback id
ipcRenderer.on(WikiChannel.setTiddlerText, async (event, title: string, value: string, workspaceID: string = '') => {
  await executeTWJavaScriptWhenIdle(`
    $tw.wiki.setText('${title}', 'text', undefined, \`${value}\`);
  `);
  ipcRenderer.send(`${WikiChannel.setTiddlerTextDone}${workspaceID}`);
});
// add snackbar to notify user
ipcRenderer.on(WikiChannel.syncProgress, async (event, message: string) => {
  await executeTWJavaScriptWhenIdle(
    `
    $tw.wiki.addTiddler({ title: '$:/state/notification/${WikiChannel.syncProgress}', text: '${message}' });
    $tw.notifier.display('$:/state/notification/${WikiChannel.syncProgress}');
  `,
    // requestIdleCallback seem to only execute when app page is visible. So there will be tons of scheduled sync when user open the app, unless we set `onlyWhenVisible: true`
    // other generalNotification should be stacked
    { onlyWhenVisible: true },
  );
});
ipcRenderer.on(WikiChannel.generalNotification, async (event, message: string) => {
  await executeTWJavaScriptWhenIdle(`
    $tw.wiki.addTiddler({ title: '$:/state/notification/${WikiChannel.generalNotification}', text: '${message}' });
    $tw.notifier.display('$:/state/notification/${WikiChannel.generalNotification}');
  `);
});
// open a tiddler
ipcRenderer.on(WikiChannel.openTiddler, async (event, tiddlerName: string) => {
  const newHref: string = await native.getLocalHostUrlWithActualIP(`http://localhost:5212/#${tiddlerName}`);
  await executeTWJavaScriptWhenIdle(`
    window.location.href = "${newHref}";
  `);
});
// send an action message
ipcRenderer.on(WikiChannel.sendActionMessage, async (event, actionMessage: string) => {
  await executeTWJavaScriptWhenIdle(`
    $tw.rootWidget.dispatchEvent({ type: "${actionMessage}" });
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
    var page = (${printer.printTiddler.toString()})('${tiddlerName}');
    page?.print?.();
    page?.close?.();
  `);
});
