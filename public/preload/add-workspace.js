window.mode = 'add-workspace';

const { remote, ipcRenderer } = require('electron');



const ContextMenuBuilder = require('../libs/context-menu-builder');
const { CHROME_ERROR_PATH, REACT_PATH } = require('../constants/paths');

const { MenuItem, shell } = remote;
window.contextMenuBuilder = new ContextMenuBuilder();

// on production build, if we try to redirect to http://localhost:3000 , we will reach chrome-error://chromewebdata/ , but we can easily get back
// this happens when we are redirected by OAuth login
const CHECK_LOADED_INTERVAL = 500;
function refresh() {
  if (window.location.href === CHROME_ERROR_PATH) {
    window.location.replace(REACT_PATH);
  } else {
    setTimeout(refresh, CHECK_LOADED_INTERVAL);
  }
}
setTimeout(refresh, CHECK_LOADED_INTERVAL);

remote.getCurrentWebContents().on('context-menu', (e, info) => {
  window.contextMenuBuilder
    .buildMenuForElement(info)
    .then(menu => {
      if (info.linkURL && info.linkURL.length > 0) {
        menu.append(new MenuItem({ type: 'separator' }));

        menu.append(
          new MenuItem({
            label: 'Open Link in New Window',
            click: () => {
              ipcRenderer.send('request-set-global-force-new-window', true);
              window.open(info.linkURL);
            },
          }),
        );

        menu.append(new MenuItem({ type: 'separator' }));

        const workspaces = ipcRenderer.sendSync('get-workspaces');

        const workspaceLst = Object.values(workspaces).sort((a, b) => a.order - b.order);

        workspaceLst.forEach(workspace => {
          const workspaceName = workspace.name || `Workspace ${workspace.order + 1}`;
          menu.append(
            new MenuItem({
              label: `Open Link in ${workspaceName}`,
              click: () => {
                ipcRenderer.send('request-open-url-in-workspace', info.linkURL, workspace.id);
              },
            }),
          );
        });
      }

      const contents = remote.getCurrentWebContents();
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(
        new MenuItem({
          label: 'Back',
          enabled: contents.canGoBack(),
          click: () => {
            contents.goBack();
          },
        }),
      );
      menu.append(
        new MenuItem({
          label: 'Forward',
          enabled: contents.canGoForward(),
          click: () => {
            contents.goForward();
          },
        }),
      );
      menu.append(
        new MenuItem({
          label: 'Reload',
          click: () => {
            contents.reload();
          },
        }),
      );

      menu.append(new MenuItem({ type: 'separator' }));

      menu.append(
        new MenuItem({
          label: 'More',
          submenu: [
            {
              label: 'About',
              click: () => ipcRenderer.send('request-show-about-window'),
            },
            { type: 'separator' },
            {
              label: 'Check for Updates',
              click: () => ipcRenderer.send('request-check-for-updates'),
            },
            {
              label: 'Preferences...',
              click: () => ipcRenderer.send('request-show-preferences-window'),
            },
            { type: 'separator' },
            {
              label: 'TiddlyGit Support',
              click: () => shell.openExternal('https://github.com/tiddly-gittly/TiddlyGit-Desktop/issues/new/choose'),
            },
            {
              label: 'TiddlyGit Website',
              click: () => shell.openExternal('https://github.com/tiddly-gittly/TiddlyGit-Desktop'),
            },
            { type: 'separator' },
            {
              label: 'Quit',
              click: () => ipcRenderer.send('request-quit'),
            },
          ],
        }),
      );

      return menu.popup(remote.getCurrentWindow());
    })
    .catch(error => console.error(error));
});
