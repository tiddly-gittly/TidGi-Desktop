import { webFrame } from 'electron';
import '../services/wiki/wikiOperations/executor/wikiOperationInBrowser';
import type { IPossibleWindowMeta, WindowMeta } from '@services/windows/WindowProperties';
import { WindowNames } from '@services/windows/WindowProperties';
import { browserViewMetaData, windowName } from './common/browserViewMetaData';

let handled = false;
const handleLoaded = (event: string): void => {
  if (handled) {
    return;
  }

  console.log(`Preload script is loading on ${event}...`);
  void executeJavaScriptInBrowserView();

  console.log('Preload script is loaded...');
  handled = true;
};

async function executeJavaScriptInBrowserView(): Promise<void> {
  const { workspaceID } = browserViewMetaData as IPossibleWindowMeta<WindowMeta[WindowNames.view]>;

  try {
    await webFrame.executeJavaScript(`
  (function() {
    // Customize Notification behavior
    // https://stackoverflow.com/questions/53390156/how-to-override-javascript-web-api-notification-object
    const oldNotification = window.Notification;

    window.Notification = function() {
      const args = arguments;
      const notification = new oldNotification(...args);
      
      // Dynamically check pause status and decide whether to show notification
      window.service.preference.get('pauseNotifications').then((shouldPauseNotifications) => {
        if (shouldPauseNotifications) {
          // Close the notification immediately if notifications are paused
          notification.close();
        } else {
          // Add click handler to focus workspace
          notification.addEventListener('click', async () => {
            const workspaceID = ${JSON.stringify(workspaceID ?? '-')};
            const targetWorkspace = await window.service.workspace.get(workspaceID);
            if (targetWorkspace !== undefined) {
              await window.service.workspaceView.setActiveWorkspaceView(workspaceID);
              await window.service.menu.buildMenu();
            }
          });
        }
      }).catch((error) => {
        console.error('Failed to get pauseNotifications preference:', error);
      });
      
      return notification;
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
}
