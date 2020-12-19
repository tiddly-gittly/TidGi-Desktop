const { remote } = require('electron');
const contextMenu = require('electron-context-menu');

// A much simpler version of public/libs/context-menu-builder.js
contextMenu({
  window: remote.getCurrentWindow(),
  prepend: (_, __, browserWindow) => [
    {
      label: 'Developer Tools',
      click: () => browserWindow.webContents.openDevTools(),
    },
  ],
});
