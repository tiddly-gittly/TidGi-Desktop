import { webFrame } from 'electron';
import '../services/wiki/wikiOperations/executor/wikiOperationInBrowser';
import type { IPossibleWindowMeta, WindowMeta } from '@services/windows/WindowProperties';
import { WindowNames } from '@services/windows/WindowProperties';
import { browserViewMetaData, windowName } from './common/browserViewMetaData';
import { consoleLogToLogFile } from './fixer/consoleLogToLogFile';
import { native } from './common/services';

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
  const viewMetaData = browserViewMetaData as IPossibleWindowMeta<WindowMeta[WindowNames.view]>;
  const workspaceName = viewMetaData.workspace?.name ?? 'unknown';
  await consoleLogToLogFile(workspaceName);
  const workspaceID = viewMetaData.workspace?.id;

  // Log when view is fully loaded for E2E tests
  void native.logFor(workspaceName, 'info', `[test-id-VIEW_LOADED] Browser view preload script executed and ready for workspace: ${workspaceName}`);

  try {
    await webFrame.executeJavaScript(`
  (function() {
    // Customize Notification behavior
    // https://stackoverflow.com/questions/53390156/how-to-override-javascript-web-api-notification-object
    const oldNotification = window.Notification;
    
    // Cache pause status and keep it in sync with preferences observable
    let pauseNotifications = false;
    window.observables?.preference?.preference$?.subscribe?.((preferences) => {
      pauseNotifications = preferences?.pauseNotifications || false;
    });

    // Use modern rest parameters instead of arguments for better performance and clarity
    window.Notification = function(...args) {
      // Check cached value first to avoid notification flash
      if (pauseNotifications) {
        // Return a lightweight mock notification object to avoid creating real browser notifications
        // This mock implements the minimal Notification API that calling code might expect
        return {
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => true,
          // Common Notification properties that might be accessed
          title: args[0] || '',
          body: (args[1] && args[1].body) || '',
          tag: 'paused',
          // Prevent any actual notification behavior
          onclick: null,
          onclose: null,
          onerror: null,
          onshow: null
        };
      }
      
      // Create and show notification
      const notification = new oldNotification(...args);
      
      // Add click handler to focus workspace
      notification.addEventListener('click', async () => {
        const workspaceID = ${JSON.stringify(workspaceID ?? '-')};
        try {
          const targetWorkspace = await window.service.workspace.get(workspaceID);
          if (targetWorkspace !== undefined) {
            await window.service.workspaceView.setActiveWorkspaceView(workspaceID);
            await window.service.menu.buildMenu();
          }
        } catch (error) {
          console.error('Failed to handle notification click:', error);
        }
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
