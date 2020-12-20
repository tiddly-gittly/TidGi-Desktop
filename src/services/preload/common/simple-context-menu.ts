// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'remote'.
const { remote } = require('electron');
const contextMenu = require('electron-context-menu');

// A much simpler version of public/libs/context-menu-builder.js
contextMenu({
  window: remote.getCurrentWindow(),
  prepend: (_: any, __: any, browserWindow: any) => [
    {
      label: 'Developer Tools',
      click: () => browserWindow.webContents.openDevTools(),
    },
  ],
});
