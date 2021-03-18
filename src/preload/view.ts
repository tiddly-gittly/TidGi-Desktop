import { ipcRenderer, webFrame } from 'electron';
import { enable as enableDarkMode, disable as disableDarkMode } from 'darkreader';
import { NotificationChannel, WorkspaceChannel } from '@/constants/channels';
import './wiki-operation';
import { preference, theme, workspace, workspaceView, menu } from './common/services';
import { IPossibleWindowMeta, WindowMeta, WindowNames } from '@services/windows/WindowProperties';

let handled = false;
const handleLoaded = async (event: string): Promise<void> => {
  if (handled) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`Preload script is loading on ${event}...`);
  const loadDarkReader = async (): Promise<void> => {
    const shouldUseDarkColor = await theme.shouldUseDarkColors();
    const darkReader = (await preference.get('darkReader')) as boolean;
    if (shouldUseDarkColor && darkReader) {
      const { darkReaderBrightness, darkReaderContrast, darkReaderGrayscale, darkReaderSepia } = await preference.getPreferences();
      enableDarkMode({
        brightness: darkReaderBrightness,
        contrast: darkReaderContrast,
        grayscale: darkReaderGrayscale,
        sepia: darkReaderSepia,
      });
    } else {
      disableDarkMode();
    }
  };
  ipcRenderer.on('reload-dark-reader', () => {
    void loadDarkReader();
  });
  await loadDarkReader();
  // Link preview
  const linkPreview = document.createElement('div');
  linkPreview.style.cssText =
    'max-width: 80vw;height: 22px;position: fixed;bottom: -1px;right: -1px;z-index: 1000000;background-color: rgb(245, 245, 245);border-radius: 2px;border: #9E9E9E  1px solid;font-size: 12.5px;color: rgb(0, 0, 0);padding: 0px 8px;line-height: 22px;font-family: -apple-system, system-ui, BlinkMacSystemFont, sans-serif;white-space: nowrap;text-overflow: ellipsis;overflow: hidden; pointer-events:none;';
  ipcRenderer.on('update-target-url', (e, url) => {
    if (url && document.body) {
      linkPreview.textContent = url;
      document.body.append(linkPreview);
    } else if (document.body && document.body.contains(linkPreview)) {
      linkPreview.remove();
    }
  });
  // eslint-disable-next-line no-console
  console.log('Preload script is loaded...');
  handled = true;
};

// try to load as soon as dom is loaded
document.addEventListener('DOMContentLoaded', async () => await handleLoaded('document.on("DOMContentLoaded")'));
// if user navigates between the same website
// DOMContentLoaded might not be triggered so double check with 'onload'
// https://github.com/atomery/webcatalog/issues/797
window.addEventListener('load', async () => await handleLoaded('window.on("onload")'));
// Communicate with the frame
// Have to use this weird trick because contextIsolation: true
ipcRenderer.on(NotificationChannel.shouldPauseNotificationsChanged, (e, value) => {
  window.postMessage({ type: NotificationChannel.shouldPauseNotificationsChanged, val: value });
});
ipcRenderer.on('display-media-id-received', (e, value) => {
  window.postMessage({ type: 'return-display-media-id', val: value });
});
window.addEventListener('message', (event) => {
  if (!event.data) {
    return;
  }
  // set workspace to active when its notification is clicked
  if (event.data.type === WorkspaceChannel.focusWorkspace) {
    const id = event.data.workspaceId;
    if (workspace.get(id) !== undefined) {
      void workspaceView.setActiveWorkspaceView(id).then(async () => await menu.buildMenu());
    }
  }
});

(async function executeJavaScriptInBrowserView() {
  // Fix Can't show file list of Google Drive
  // https://github.com/electron/electron/issues/16587
  // Fix chrome.runtime.sendMessage is undefined for FastMail
  // https://github.com/atomery/singlebox/issues/21
  const initialShouldPauseNotifications = window.service.preference.get('pauseNotifications');
  const { workspaceID } = window.meta as IPossibleWindowMeta<WindowMeta[WindowNames.view]>;
  void webFrame.executeJavaScript(`
  (function() {
    window.chrome = {
      runtime: {
        sendMessage: () => {},
        connect: () => {
          return {
            onMessage: {
              addListener: () => {},
              removeListener: () => {},
            },
            postMessage: () => {},
            disconnect: () => {},
          }
        }
      }
    }

    window.electronSafeIpc = {
      send: () => null,
      on: () => null,
    };
    window.desktop = undefined;

    // Customize Notification behavior
    // https://stackoverflow.com/questions/53390156/how-to-override-javascript-web-api-notification-object
    const oldNotification = window.Notification;

    let shouldPauseNotifications = ${initialShouldPauseNotifications};

    window.addEventListener('message', function(e) {
      if (!e.data || e.data.type !== '${NotificationChannel.shouldPauseNotificationsChanged}') return;
      shouldPauseNotifications = e.data.val;
    });

    window.Notification = function() {
      if (!shouldPauseNotifications) {
        const notif = new oldNotification(...arguments);
        notif.addEventListener('click', () => {
          window.postMessage({ type: '${WorkspaceChannel.focusWorkspace}', workspaceId: "${workspaceID}" });
        });
        return notif;
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
})();
