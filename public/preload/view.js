const {
  ipcRenderer,
  remote,
  webFrame,
} = require('electron');

const {
  SpellCheckHandler,
  ContextMenuListener,
  ContextMenuBuilder,
} = require('electron-spellchecker');

const { MenuItem } = remote;

window.global = {};
window.ipcRenderer = ipcRenderer;

window.onload = () => {
  window.close = () => {
    ipcRenderer.send('request-go-home');
  };

  const jsCodeInjection = ipcRenderer.sendSync('get-preference', 'jsCodeInjection');
  const cssCodeInjection = ipcRenderer.sendSync('get-preference', 'cssCodeInjection');

  if (jsCodeInjection && jsCodeInjection.trim().length > 0) {
    try {
      const node = document.createElement('script');
      node.innerHTML = jsCodeInjection;
      document.body.appendChild(node);
    } catch (err) {
      /* eslint-disable no-console */
      console.log(err);
      /* eslint-enable no-console */
    }
  }

  if (cssCodeInjection && cssCodeInjection.trim().length > 0) {
    try {
      const node = document.createElement('style');
      node.innerHTML = cssCodeInjection;
      document.body.appendChild(node);
    } catch (err) {
      /* eslint-disable no-console */
      console.log(err);
      /* eslint-enable no-console */
    }
  }

  const spellChecker = ipcRenderer.sendSync('get-preference', 'spellChecker');

  if (spellChecker) {
    window.spellCheckHandler = new SpellCheckHandler();
    setTimeout(() => window.spellCheckHandler.attachToInput(), 1000);
    window.spellCheckHandler.switchLanguage('en-US');
  }

  window.contextMenuBuilder = new ContextMenuBuilder(
    spellChecker ? window.spellCheckHandler : null,
    null,
    true,
  );


  window.contextMenuListener = new ContextMenuListener((info) => {
    window.contextMenuBuilder.buildMenuForElement(info)
      .then((menu) => {
        if (info.linkURL && info.linkURL.length > 0) {
          menu.append(new MenuItem({ type: 'separator' }));

          const workspaces = ipcRenderer.sendSync('get-workspaces');

          const workspaceLst = Object.values(workspaces).sort((a, b) => a.order - b.order);

          workspaceLst.forEach((workspace) => {
            const workspaceName = workspace.name || `Workspace ${workspace.order + 1}`;
            menu.append(new MenuItem({
              label: `Open Link in ${workspaceName}`,
              click: () => {
                ipcRenderer.send('request-open-url-in-workspace', info.linkURL, workspace.id);
              },
            }));
          });
        }

        menu.append(new MenuItem({ type: 'separator' }));
        menu.append(new MenuItem({
          label: 'Back',
          click: () => {
            remote.getCurrentWindow().send('go-back');
          },
        }));
        menu.append(new MenuItem({
          label: 'Forward',
          click: () => {
            remote.getCurrentWindow().send('go-forward');
          },
        }));
        menu.append(new MenuItem({
          label: 'Reload',
          click: () => {
            remote.getCurrentWindow().send('reload');
          },
        }));

        menu.popup(remote.getCurrentWindow());
      });
  });

  // Link preview
  const linkPreview = document.createElement('div');
  linkPreview.style.cssText = 'max-width: 80vw;height: 22px;position: fixed;bottom: -1px;right: -1px;z-index: 1000000;background-color: rgb(245, 245, 245);border-radius: 2px;border: #9E9E9E  1px solid;font-size: 12.5px;color: rgb(0, 0, 0);padding: 0px 8px;line-height: 22px;font-family: -apple-system, system-ui, BlinkMacSystemFont, sans-serif;white-space: nowrap;text-overflow: ellipsis;overflow: hidden; pointer-events:none;';
  ipcRenderer.on('update-target-url', (e, url) => {
    if (url && document.body) {
      linkPreview.innerText = url;
      document.body.appendChild(linkPreview);
    } else if (document.body && document.body.contains(linkPreview)) {
      document.body.removeChild(linkPreview);
    }
  });

  // Fix WhatsApp requires Google Chrome 49+ bug
  // https://github.com/meetfranz/recipe-whatsapp/blob/master/webview.js
  setTimeout(() => {
    if (!window.location.hostname.includes('web.whatsapp.com')) {
      return;
    }
    const elem = document.querySelector('.landing-title.version-title');
    if (elem && elem.innerText.toLowerCase().includes('google chrome')) {
      window.location.reload();
    }
  }, 1000);

  window.addEventListener('beforeunload', async () => {
    if (!window.location.hostname.includes('web.whatsapp.com')) {
      return;
    }
    try {
      const webContents = remote.getCurrentWebContents();
      const { session } = webContents;
      session.flushStorageData();
      session.clearStorageData({
        storages: ['appcache', 'serviceworkers', 'cachestorage', 'websql', 'indexdb'],
      });

      const registrations = await window.navigator.serviceWorker.getRegistrations();

      registrations.forEach((r) => {
        r.unregister();
        console.log('ServiceWorker unregistered');
      });
    } catch (err) {
      console.err(err);
    }
  });
};

// Fix Can't show file list of Google Drive
// https://github.com/electron/electron/issues/16587

// Fix chrome.runtime.sendMessage is undefined for FastMail
// https://github.com/quanglam2807/singlebox/issues/21
webFrame.executeJavaScript(`
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
`);
