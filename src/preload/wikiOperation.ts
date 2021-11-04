/* eslint-disable @typescript-eslint/no-misused-promises */
/**
 * Call tiddlywiki api from electron
 * This file should be required by view.ts preload script to work
 */
import { ipcRenderer, webFrame } from 'electron';
import { delay } from 'bluebird';
import { WikiChannel } from '@/constants/channels';
import { context } from './common/services';

// add tiddler
ipcRenderer.on(WikiChannel.addTiddler, async (event, title: string, text: string, meta: unknown) => {
  const extraMeta = typeof meta === 'object' ? JSON.stringify(meta) : '{}';
  await webFrame.executeJavaScript(`
    $tw.wiki.addTiddler({ title: '${title}', text: '${text}', ...${extraMeta} });
  `);
  // wait for fs to be settle
  await delay(1000);
  await ipcRenderer.invoke(WikiChannel.addTiddlerDone);
});
// get tiddler text
ipcRenderer.on(WikiChannel.getTiddlerText, async (event, title: string) => {
  const tiddlerText: string = await (webFrame.executeJavaScript(`
    $tw.wiki.getTiddlerText('${title}');
  `) as Promise<string>);
  await ipcRenderer.invoke(WikiChannel.getTiddlerTextDone, tiddlerText);
});
// set tiddler text
ipcRenderer.on(WikiChannel.setTiddlerText, async (event, title: string, value: string) => {
  const tiddlerText: string = await (webFrame.executeJavaScript(`
    $tw.wiki.setText('${title}', 'text', undefined, \`${value}\`);
  `) as Promise<string>);
  await ipcRenderer.invoke(WikiChannel.setTiddlerTextDone, tiddlerText);
});
// add snackbar to notify user
ipcRenderer.on(WikiChannel.syncProgress, async (event, message: string) => {
  await webFrame.executeJavaScript(`
    $tw.wiki.addTiddler({ title: '$:/state/notification/${WikiChannel.syncProgress}', text: '${message}' });
    $tw.notifier.display('$:/state/notification/${WikiChannel.syncProgress}');
  `);
});
ipcRenderer.on(WikiChannel.generalNotification, async (event, message: string) => {
  await webFrame.executeJavaScript(`
    $tw.wiki.addTiddler({ title: '$:/state/notification/${WikiChannel.generalNotification}', text: '${message}' });
    $tw.notifier.display('$:/state/notification/${WikiChannel.generalNotification}');
  `);
});
// open a tiddler
ipcRenderer.on(WikiChannel.openTiddler, async (event, tiddlerName: string) => {
  const newHref: string = await context.getLocalHostUrlWithActualIP(`http://localhost:5212/#${tiddlerName}`);
  await webFrame.executeJavaScript(`
    window.location.href = "${newHref}";
  `);
});
// send an action message
ipcRenderer.on(WikiChannel.sendActionMessage, async (event, actionMessage: string) => {
  await webFrame.executeJavaScript(`
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
  await webFrame.executeJavaScript(`
    const page = (${printer.printTiddler.toString()})('${tiddlerName}');
    page?.print?.();
    page?.close?.();
  `);
});
