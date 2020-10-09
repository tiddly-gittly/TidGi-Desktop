// @flow
/**
 * Call tiddlywiki api from electron
 * This file should be required by BrowserView's preload script to work
 */
const { ipcRenderer, webFrame } = require('electron');

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

// open a tiddler
ipcRenderer.on('wiki-send-action-message', (event, actionMessage) => {
  webFrame.executeJavaScript(`
    $tw.rootWidget.dispatchEvent({ type: "${actionMessage}" });
  `);
});
