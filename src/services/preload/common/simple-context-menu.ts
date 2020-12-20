import { remote } from 'electron';
import contextMenu from 'electron-context-menu';

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
