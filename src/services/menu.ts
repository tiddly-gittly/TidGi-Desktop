import { Menu, MenuItemConstructorOptions, shell } from 'electron';
import { debounce, take, drop } from 'lodash';
import { injectable, inject } from 'inversify';
import serviceIdentifiers from '@services/serviceIdentifier';
import { Preference } from '@services/preferences';
import { View } from '@services/view';

@injectable()
export class MenuService {
  private readonly menuTemplate: MenuItemConstructorOptions[];

  /**
   * Rebuild or create menubar from the latest menu template, will be call after some method change the menuTemplate
   * You don't need to call this after calling method like insertMenu, it will be call automatically.
   */
  public buildMenu(): void {
    const menu = Menu.buildFromTemplate(this.menuTemplate);
    Menu.setApplicationMenu(menu);
  }

  constructor(
    @inject(serviceIdentifiers.Preference) private readonly preferenceService: Preference,
    @inject(serviceIdentifiers.View) private readonly viewService: View,
  ) {
    // debounce so build menu won't be call very frequently on app launch, where every services are registering menu items
    this.buildMenu = debounce(this.buildMenu.bind(this), 50);
    // add some default app menus
    this.menuTemplate = [
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'pasteandmatchstyle' },
          { role: 'delete' },
          { role: 'selectall' },
          { type: 'separator' },
          {
            label: 'Find',
            accelerator: 'CmdOrCtrl+F',
            click: () => {
              const win = mainWindow.get();
              // @ts-expect-error ts-migrate(2532) FIXME: Object is possibly 'undefined'.
              if (win !== null && win.getBrowserView() !== null) {
                // @ts-expect-error ts-migrate(2532) FIXME: Object is possibly 'undefined'.
                win.webContents.focus();
                (win as any).send('open-find-in-page');
                // @ts-expect-error ts-migrate(2532) FIXME: Object is possibly 'undefined'.
                const contentSize = win.getContentSize();
                // @ts-expect-error ts-migrate(2532) FIXME: Object is possibly 'undefined'.
                const view = win.getBrowserView();
                // @ts-expect-error ts-migrate(2531) FIXME: Object is possibly 'null'.
                view.setBounds(getViewBounds(contentSize, true));
              }
            },
            enabled: hasWorkspaces,
          },
          {
            label: 'Find Next',
            accelerator: 'CmdOrCtrl+G',
            click: () => {
              const win = mainWindow.get();
              (win as any).send('request-back-find-in-page', true);
            },
            enabled: hasWorkspaces,
          },
          {
            label: 'Find Previous',
            accelerator: 'Shift+CmdOrCtrl+G',
            click: () => {
              const win = mainWindow.get();
              (win as any).send('request-back-find-in-page', false);
            },
            enabled: hasWorkspaces,
          },
        ],
      },
      {
        label: 'View',
        submenu: [
          {
            label: global.sidebar ? 'Hide Sidebar' : 'Show Sidebar',
            accelerator: 'CmdOrCtrl+Alt+S',
            click: () => {
              ipcMain.emit('request-set-preference', null, 'sidebar', !global.sidebar);
              ipcMain.emit('request-realign-active-workspace');
            },
          },
          {
            label: global.navigationBar ? 'Hide Navigation Bar' : 'Show Navigation Bar',
            accelerator: 'CmdOrCtrl+Alt+N',
            click: () => {
              ipcMain.emit('request-set-preference', null, 'navigationBar', !global.navigationBar);
              ipcMain.emit('request-realign-active-workspace');
            },
          },
          {
            label: global.titleBar ? 'Hide Title Bar' : 'Show Title Bar',
            accelerator: 'CmdOrCtrl+Alt+T',
            enabled: process.platform === 'darwin',
            visible: process.platform === 'darwin',
            click: () => {
              ipcMain.emit('request-set-preference', null, 'titleBar', !global.titleBar);
              ipcMain.emit('request-realign-active-workspace');
            },
          },
          // same behavior as BrowserWindow with autoHideMenuBar: true
          // but with addition to readjust BrowserView so it won't cover the menu bar
          {
            label: 'Toggle Menu Bar',
            visible: false,
            accelerator: 'Alt+M',
            enabled: process.platform === 'win32',
            click: (menuItem, browserWindow) => {
              // if back is called in popup window
              // open menu bar in the popup window instead
              if (browserWindow && browserWindow.isPopup) {
                browserWindow.setMenuBarVisibility(!browserWindow.isMenuBarVisible());
                return;
              }
              const win = mainWindow.get();
              // @ts-expect-error ts-migrate(2532) FIXME: Object is possibly 'undefined'.
              win.setMenuBarVisibility(!win.isMenuBarVisible());
              ipcMain.emit('request-realign-active-workspace');
            },
          },
          { type: 'separator' },
          { role: 'togglefullscreen' },
          {
            label: 'Actual Size',
            accelerator: 'CmdOrCtrl+0',
            click: (menuItem, browserWindow) => {
              // if item is called in popup window
              // open menu bar in the popup window instead
              if (browserWindow && browserWindow.isPopup) {
                const contents = browserWindow.webContents;
                contents.zoomFactor = 1;
                return;
              }
              const win = mainWindow.get();
              // @ts-expect-error ts-migrate(2532) FIXME: Object is possibly 'undefined'.
              if (win !== null && win.getBrowserView() !== null) {
                // @ts-expect-error ts-migrate(2532) FIXME: Object is possibly 'undefined'.
                const contents = win.getBrowserView().webContents;
                contents.zoomFactor = 1;
              }
            },
            enabled: hasWorkspaces,
          },
          {
            label: 'Zoom In',
            accelerator: 'CmdOrCtrl+=',
            click: (menuItem, browserWindow) => {
              // if item is called in popup window
              // open menu bar in the popup window instead
              if (browserWindow && browserWindow.isPopup) {
                const contents = browserWindow.webContents;
                contents.zoomFactor += 0.1;
                return;
              }
              const win = mainWindow.get();
              // @ts-expect-error ts-migrate(2532) FIXME: Object is possibly 'undefined'.
              if (win !== null && win.getBrowserView() !== null) {
                // @ts-expect-error ts-migrate(2532) FIXME: Object is possibly 'undefined'.
                const contents = win.getBrowserView().webContents;
                contents.zoomFactor += 0.1;
              }
            },
            enabled: hasWorkspaces,
          },
          {
            label: 'Zoom Out',
            accelerator: 'CmdOrCtrl+-',
            click: (menuItem, browserWindow) => {
              // if item is called in popup window
              // open menu bar in the popup window instead
              if (browserWindow && browserWindow.isPopup) {
                const contents = browserWindow.webContents;
                contents.zoomFactor -= 0.1;
                return;
              }
              const win = mainWindow.get();
              // @ts-expect-error ts-migrate(2532) FIXME: Object is possibly 'undefined'.
              if (win !== null && win.getBrowserView() !== null) {
                // @ts-expect-error ts-migrate(2532) FIXME: Object is possibly 'undefined'.
                const contents = win.getBrowserView().webContents;
                contents.zoomFactor -= 0.1;
              }
            },
            enabled: hasWorkspaces,
          },
          { type: 'separator' },
          {
            label: 'Reload This Page',
            accelerator: 'CmdOrCtrl+R',
            click: (menuItem, browserWindow) => {
              // if item is called in popup window
              // open menu bar in the popup window instead
              if (browserWindow && browserWindow.isPopup) {
                browserWindow.webContents.reload();
                return;
              }
              const win = mainWindow.get();
              // @ts-expect-error ts-migrate(2532) FIXME: Object is possibly 'undefined'.
              if (win !== null && win.getBrowserView() !== null) {
                // @ts-expect-error ts-migrate(2532) FIXME: Object is possibly 'undefined'.
                win.getBrowserView().webContents.reload();
              }
            },
            enabled: hasWorkspaces,
          },
          { type: 'separator' },
          {
            label: 'Developer Tools',
            submenu: [
              {
                label: 'Open Developer Tools of Active Workspace',
                accelerator: 'CmdOrCtrl+Option+I',
                click: () => getActiveBrowserView().webContents.openDevTools(),
                enabled: hasWorkspaces,
              },
            ],
          },
        ],
      },
      // language menu
      {
        label: 'Language',
        submenu: getLanguageMenu(),
      },
      {
        label: 'History',
      },
      {
        label: 'Workspaces',
        submenu: [],
      },
      {
        role: 'window',
        submenu: [{ role: 'minimize' }, { role: 'close' }, { type: 'separator' }, { role: 'front' }, { type: 'separator' }],
      },
      {
        role: 'help',
        submenu: [
          {
            label: 'TiddlyGit Support',
            click: async () => await shell.openExternal('https://github.com/tiddly-gittly/tiddlygit-desktop/issues'),
          },
          {
            label: 'Report a Bug via GitHub...',
            click: async () => await shell.openExternal('https://github.com/tiddly-gittly/tiddlygit-desktop/issues'),
          },
          {
            label: 'Request a New Feature via GitHub...',
            click: async () => await shell.openExternal('https://github.com/tiddly-gittly/tiddlygit-desktop/issues/new?template=feature.md&title=feature%3A+'),
          },
          {
            label: 'Learn More...',
            click: async () => await shell.openExternal('https://github.com/tiddly-gittly/tiddlygit-desktop/'),
          },
        ],
      },
    ];
  }

  /**
   * Insert provided sub menu items into menubar, so user and services can register custom menu items
   * @param menuName Top level menu name to insert menu items
   * @param menuItems An array of menu item to insert
   * @param afterSubMenu The name or role of a submenu you want your submenu insert after. `null` means inserted as first submenu item; `undefined` means inserted as last submenu item;
   * @param withSeparator Need to insert a separator first, before insert menu items
   */
  insertMenu(menuName: string, menuItems: MenuItemConstructorOptions[], afterSubMenu?: string | null, withSeparator = false): void {
    let foundMenuName = false;
    // try insert menu into an existed menu's submenu
    for (const menu of this.menuTemplate) {
      if (menu.label === menuName || menu.role === menuName) {
        foundMenuName = true;
        if (Array.isArray(menu.submenu)) {
          if (afterSubMenu === undefined) {
            // inserted as last submenu item
            if (withSeparator) {
              menu.submenu.push({ type: 'separator' });
            }
            menu.submenu = [...menu.submenu, ...menuItems];
          } else if (afterSubMenu === null) {
            // inserted as first submenu item
            if (withSeparator) {
              menuItems.push({ type: 'separator' });
            }
            menu.submenu = [...menuItems, ...menu.submenu];
          } else if (typeof afterSubMenu === 'string') {
            // insert after afterSubMenu
            const afterSubMenuIndex = menu.submenu.findIndex((item) => item.label === afterSubMenu || item.role === afterSubMenu);
            if (afterSubMenuIndex === -1) {
              throw new Error(
                `You try to insert menu with afterSubMenu ${afterSubMenu}, but we can not found it in menu ${menu.label ?? menu.role ?? JSON.stringify(menu)}`,
              );
            }
            menu.submenu = [...take(menu.submenu, afterSubMenuIndex + 1), ...menuItems, ...drop(menu.submenu, afterSubMenuIndex - 1)];
          }
        } else {
          // if menu existed but submenu is undefined
          menu.submenu = menuItems;
        }
      }
    }
    // if user wants to create a new menu in menubar
    if (!foundMenuName) {
      this.menuTemplate.push({
        label: menuName,
        submenu: menuItems,
      });
    }
  }
}
