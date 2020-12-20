/**
 * Call tiddlywiki api from electron
 * This file should be required by BrowserView's preload script to work
 */
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'ipcRendere... Remove this comment to see the full error message
import { ipcRenderer, webFrame } from 'electron';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'Promise'.
import Promise from 'bluebird';
// add tiddler
ipcRenderer.on('wiki-add-tiddler', async (event, title, text, meta) => {
  const extraMeta = typeof meta === 'object' ? JSON.stringify(meta) : '{}';
  await webFrame.executeJavaScript(`
    $tw.wiki.addTiddler({ title: '${title}', text: '${text}', ...${extraMeta} });
  `);
  // wait for fs to be settle
  await (Promise as any).delay(1000);
  ipcRenderer.send('wiki-add-tiddler-done');
});
// get tiddler text
ipcRenderer.on('wiki-get-tiddler-text', async (event, title) => {
  const tiddlerText = await webFrame.executeJavaScript(`
    $tw.wiki.getTiddlerText('${title}');
  `);
  ipcRenderer.send('wiki-get-tiddler-text-done', tiddlerText);
});
// add snackbar to notify user
ipcRenderer.on('wiki-sync-progress', (event, message) => {
  webFrame.executeJavaScript(`
    $tw.wiki.addTiddler({ title: '$:/state/notification/wiki-sync-progress', text: '${message}' });
    $tw.notifier.display('$:/state/notification/wiki-sync-progress');
  `);
});
// open a tiddler
ipcRenderer.on('wiki-open-tiddler', (event, tiddlerName) => {
  webFrame.executeJavaScript(`
    window.location.href = "http://localhost:5212/#${tiddlerName}";
  `);
});
// send an action message
ipcRenderer.on('wiki-send-action-message', (event, actionMessage) => {
  webFrame.executeJavaScript(`
    $tw.rootWidget.dispatchEvent({ type: "${actionMessage}" });
  `);
});
