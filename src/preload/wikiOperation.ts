/* eslint-disable @typescript-eslint/no-misused-promises */
/**
 * Call tiddlywiki api from electron
 * This file should be required by view.ts preload script to work
 */
import { ipcRenderer, webFrame } from 'electron';
import { delay } from 'bluebird';
import { WikiChannel } from '@/constants/channels';

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
  await webFrame.executeJavaScript(`
    window.location.href = "http://localhost:5212/#${tiddlerName}";
  `);
});
// send an action message
ipcRenderer.on(WikiChannel.sendActionMessage, async (event, actionMessage: string) => {
  await webFrame.executeJavaScript(`
    $tw.rootWidget.dispatchEvent({ type: "${actionMessage}" });
  `);
});
