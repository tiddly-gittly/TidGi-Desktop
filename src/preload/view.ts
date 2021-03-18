import { ipcRenderer, webFrame } from 'electron';
import { enable as enableDarkMode, disable as disableDarkMode } from 'darkreader';
import { WorkspaceChannel } from '@/constants/channels';
import './wiki-operation';
import { preference, theme, workspace, workspaceView, menu } from './common/services';
import { IPossibleWindowMeta, WindowMeta, WindowNames } from '@services/windows/WindowProperties';
import { browserViewMetaData } from './common/browserViewMetaData';

let handled = false;
const handleLoaded = async (event: string): Promise<void> => {
  if (handled) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`Preload script is loading on ${event}...`);
  void executeJavaScriptInBrowserView();
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

async function executeJavaScriptInBrowserView() {
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

    let shouldPauseNotifications = ${initialShouldPauseNotifications ? initialShouldPauseNotifications : 'undefined'};

    window.Notification = function() {
      if (!shouldPauseNotifications) {
        const notification = new oldNotification(...arguments);
        notification.addEventListener('click', () => {
          window.postMessage({ type: '${WorkspaceChannel.focusWorkspace}', workspaceId: "${workspaceID}" });
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
