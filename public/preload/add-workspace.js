window.mode = 'add-workspace';

const { remote, ipcRenderer } = require('electron');
const ContextMenuBuilder = require('../libs/context-menu-builder');

const { MenuItem, shell } = remote;
window.contextMenuBuilder = new ContextMenuBuilder();

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
              label: 'Singlebox Support',
              click: () => shell.openExternal('https://atomery.com/support?app=singlebox'),
            },
            {
              label: 'Singlebox Website',
              click: () => shell.openExternal('https://singleboxapp.com'),
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
