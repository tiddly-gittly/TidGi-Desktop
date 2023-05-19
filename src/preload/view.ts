/* eslint-disable @typescript-eslint/no-misused-promises */
import { Channels, WorkspaceChannel } from '@/constants/channels';
import { webFrame } from 'electron';
import './wikiOperation';
import { IPossibleWindowMeta, WindowMeta, WindowNames } from '@services/windows/WindowProperties';
import { browserViewMetaData, windowName } from './common/browserViewMetaData';
import { menu, preference, workspace, workspaceView } from './common/services';

let handled = false;
const handleLoaded = (event: string): void => {
  if (handled) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`Preload script is loading on ${event}...`);
  void executeJavaScriptInBrowserView();
  // eslint-disable-next-line no-console
  console.log('Preload script is loaded...');
  handled = true;
};

async function executeJavaScriptInBrowserView(): Promise<void> {
  // Fix Can't show file list of Google Drive
  // https://github.com/electron/electron/issues/16587
  // Fix chrome.runtime.sendMessage is undefined for FastMail
  // https://github.com/atomery/singlebox/issues/21
  const initialShouldPauseNotifications = await preference.get('pauseNotifications');
  const { workspaceID } = browserViewMetaData as IPossibleWindowMeta<WindowMeta[WindowNames.view]>;

  try {
    await webFrame.executeJavaScript(`
  (function() {
    // Customize Notification behavior
    // https://stackoverflow.com/questions/53390156/how-to-override-javascript-web-api-notification-object
    // TODO: fix logic here, get latest pauseNotifications from preference, and focusWorkspace
    const oldNotification = window.Notification;

    let shouldPauseNotifications = ${
      typeof initialShouldPauseNotifications === 'string' && initialShouldPauseNotifications.length > 0 ? `"${initialShouldPauseNotifications}"` : 'undefined'
    };

    window.Notification = function() {
      if (!shouldPauseNotifications) {
        const notification = new oldNotification(...arguments);
        notification.addEventListener('click', () => {
          window.postMessage({ type: '${WorkspaceChannel.focusWorkspace}', workspaceID: "${workspaceID ?? '-'}" });
        });
        return notification;
      }
      return null;
    }
    window.Notification.requestPermission = oldNotification.requestPermission;
    Object.defineProperty(Notification, 'permission', {
      get() {
        return oldNotification.permission;
      }
    });
  })();
`);
  } catch (error) {
    console.error(error);
  }
}

if (windowName === WindowNames.view) {
  // try to load as soon as dom is loaded
  document.addEventListener('DOMContentLoaded', () => {
    handleLoaded('document.on("DOMContentLoaded")');
  });
  // if user navigates between the same website
  // DOMContentLoaded might not be triggered so double check with 'onload'
  // https://github.com/atomery/webcatalog/issues/797
  window.addEventListener('load', () => {
    handleLoaded('window.on("onload")');
  });
  window.addEventListener('message', async (event?: MessageEvent<{ type?: Channels; workspaceID?: string } | undefined>) => {
    // set workspace to active when its notification is clicked
    if (event?.data?.type === WorkspaceChannel.focusWorkspace) {
      const id = event.data.workspaceID;
      if (id !== undefined && (await workspace.get(id)) !== undefined) {
        await workspaceView.setActiveWorkspaceView(id);
        await menu.buildMenu();
      }
    }
  });
}
