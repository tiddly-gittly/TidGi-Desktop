import { WindowNames } from '@services/windows/WindowProperties';
import { ContextMenuParams, BrowserWindow, WebviewTag, WebContents } from 'electron';
import contextMenu, { Actions } from 'electron-context-menu';
import { window } from './services';

// A much simpler version of public/libs/context-menu-builder.js
// A fallback basic version
export async function initSimpleContextMenu(windowName: WindowNames): Promise<void> {
  const currentWindow = await window.get(windowName);
  if (currentWindow === undefined) {
    throw new Error('currentWindow is undefined when initSimpleContextMenu()');
  }
  contextMenu({
    window: currentWindow,
    prepend: (_defaultActions: Actions, _parameters: ContextMenuParams, browserWindow: BrowserWindow | WebviewTag | WebContents) => [
      {
        label: 'Developer Tools',
        click: () => {
          if ('openDevTools' in browserWindow) browserWindow.openDevTools();
        },
      },
    ],
  });
}
