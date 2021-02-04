import { ipcRenderer, remote, webFrame } from 'electron';
import { enable as enableDarkMode, disable as disableDarkMode } from 'darkreader';
import ContextMenuBuilder from '@services/libs/context-menu-builder';
import i18next from '@services/libs/i18n';
import './wiki-operation';
import { preference } from './common/services';

const { MenuItem, shell } = remote;
// @ts-expect-error ts-migrate(2322) FIXME: Type '{}' is not assignable to type 'Global & type... Remove this comment to see the full error message
window.global = {};
let handled = false;
const handleLoaded = async (event: string): Promise<void> => {
  if (handled) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`Preload script is loading on ${event}...`);
  const loadDarkReader = async (): Promise<void> => {
    const shouldUseDarkColor = (await ipcRenderer.invoke('get-should-use-dark-colors')) as boolean;
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
  const { jsCodeInjection, allowNodeInJsCodeInjection, cssCodeInjection } = await preference.getPreferences();
  if (typeof jsCodeInjection === 'string' && jsCodeInjection.trim().length > 0) {
    if (allowNodeInJsCodeInjection) {
      try {
        // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
        new Function('require', `"use strict";${jsCodeInjection}`)(require);
      } catch (error) {
        /* eslint-disable no-console */
        console.log(error);
        /* eslint-enable no-console */
      }
    } else {
      try {
        const node = document.createElement('script');
        node.innerHTML = jsCodeInjection;
        document.body.append(node);
      } catch (error) {
        /* eslint-disable no-console */
        console.log(error);
        /* eslint-enable no-console */
      }
    }
  }
  if (typeof cssCodeInjection === 'string' && cssCodeInjection.trim().length > 0) {
    try {
      const node = document.createElement('style');
      node.innerHTML = cssCodeInjection;
      document.body.append(node);
    } catch (error) {
      console.log(error); // eslint-disable-line no-console
    }
  }
  // @ts-expect-error ts-migrate(2554) FIXME: Expected 1-2 arguments, but got 0.
  (window as any).contextMenuBuilder = new ContextMenuBuilder();
  remote.getCurrentWebContents().on('context-menu', (e, info) => {
    // eslint-disable-next-line promise/catch-or-return
    (window as any).contextMenuBuilder.buildMenuForElement(info).then((menu: any) => {
      // eslint-disable-next-line promise/always-return
      if (info.linkURL && info.linkURL.length > 0) {
        menu.append(new MenuItem({ type: 'separator' }));
        menu.append(
          new MenuItem({
            label: i18next.t('ContextMenu.OpenLinkInNewWindow'),
            click: async () => {
              await ipcRenderer.invoke('set-view-meta-force-new-window', true);
              window.open(info.linkURL);
            },
          }),
        );
        menu.append(new MenuItem({ type: 'separator' }));
      }
      const contents = remote.getCurrentWebContents();
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(
        new MenuItem({
          label: i18next.t('ContextMenu.Back'),
          enabled: contents.canGoBack(),
          click: () => {
            contents.goBack();
          },
        }),
      );
      menu.append(
        new MenuItem({
          label: i18next.t('ContextMenu.Forward'),
          enabled: contents.canGoForward(),
          click: () => {
            contents.goForward();
          },
        }),
      );
      menu.append(
        new MenuItem({
          label: i18next.t('ContextMenu.Reload'),
          click: () => {
            contents.reload();
          },
        }),
      );
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(
        new MenuItem({
          label: i18next.t('ContextMenu.More'),
          submenu: [
            {
              label: i18next.t('ContextMenu.About'),
              click: () => ipcRenderer.invoke('request-show-about-window'),
            },
            { type: 'separator' },
            {
              label: i18next.t('ContextMenu.CheckForUpdates'),
              click: () => ipcRenderer.invoke('request-check-for-updates'),
            },
            {
              label: i18next.t('ContextMenu.Preferences'),
              click: () => ipcRenderer.invoke('request-show-preferences-window'),
            },
            { type: 'separator' },
            {
              label: i18next.t('ContextMenu.TiddlyGitSupport'),
              click: () => shell.openExternal('https://github.com/tiddly-gittly/TiddlyGit-Desktop/issues/new/choose'),
            },
            {
              label: i18next.t('ContextMenu.TiddlyGitWebsite'),
              click: () => shell.openExternal('https://github.com/tiddly-gittly/TiddlyGit-Desktop'),
            },
            { type: 'separator' },
            {
              label: i18next.t('ContextMenu.Quit'),
              click: () => ipcRenderer.invoke('request-quit'),
            },
          ],
        }),
      );
      menu.popup(remote.getCurrentWindow());
    });
  });
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
document.addEventListener('DOMContentLoaded', () => handleLoaded('document.on("DOMContentLoaded")'));
// if user navigates between the same website
// DOMContentLoaded might not be triggered so double check with 'onload'
// https://github.com/atomery/webcatalog/issues/797
window.addEventListener('load', () => handleLoaded('window.on("onload")'));
// Communicate with the frame
// Have to use this weird trick because contextIsolation: true
ipcRenderer.on('should-pause-notifications-changed', (e, value) => {
  // @ts-expect-error ts-migrate(2554) FIXME: Expected 2-3 arguments, but got 1.
  window.postMessage({ type: 'should-pause-notifications-changed', val: value });
});
ipcRenderer.on('display-media-id-received', (e, value) => {
  // @ts-expect-error ts-migrate(2554) FIXME: Expected 2-3 arguments, but got 1.
  window.postMessage({ type: 'return-display-media-id', val: value });
});
window.addEventListener('message', (e) => {
  if (!e.data) {
    return;
  }
  if (e.data.type === 'get-display-media-id') {
    ipcRenderer.invoke('request-show-display-media-window');
  }
  // set workspace to active when its notification is clicked
  if (e.data.type === 'focus-workspace') {
    ipcRenderer.invoke('request-set-active-workspace', e.data.workspaceId);
  }
});
// Fix Can't show file list of Google Drive
// https://github.com/electron/electron/issues/16587
// Fix chrome.runtime.sendMessage is undefined for FastMail
// https://github.com/atomery/singlebox/issues/21
const initialShouldPauseNotifications = ipcRenderer.invoke('get-pause-notifications-info') != undefined;
// @ts-expect-error ts-migrate(2339) FIXME: Property 'workspaceId' does not exist on type 'Web... Remove this comment to see the full error message
const { workspaceId } = remote.getCurrentWebContents();
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
    if (!e.data || e.data.type !== 'should-pause-notifications-changed') return;
    shouldPauseNotifications = e.data.val;
  });

  window.Notification = function() {
    if (!shouldPauseNotifications) {
      const notif = new oldNotification(...arguments);
      notif.addEventListener('click', () => {
        window.postMessage({ type: 'focus-workspace', workspaceId: "${workspaceId}" });
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

  if (window.navigator.mediaDevices) {
    window.navigator.mediaDevices.getDisplayMedia = () => {
      return new Promise((resolve, reject) => {
        const listener = (e) => {
          if (!e.data || e.data.type !== 'return-display-media-id') return;
          if (e.data.val) { resolve(e.data.val); }
          else { reject(new Error('Rejected')); }
          window.removeEventListener('message', listener);
        };

        window.postMessage({ type: 'get-display-media-id' });

        window.addEventListener('message', listener);
      })
        .then((id) => {
          return navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: id,
              }
            }
          });
        });
    };
  }
})();
`);
