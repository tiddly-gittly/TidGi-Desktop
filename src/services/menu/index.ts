import { Menu, MenuItemConstructorOptions, shell, ContextMenuParams, WebContents, MenuItem, ipcMain } from 'electron';
import { debounce, take, drop } from 'lodash';
import { injectable } from 'inversify';
import { IMenuService, DeferredMenuItemConstructorOptions, IOnContextMenuInfo } from './interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { lazyInject } from '@services/container';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWindowService } from '@services/windows/interface';
import i18next from '@services/libs/i18n';
import ContextMenuBuilder from './contextMenuBuilder';

@injectable()
export class MenuService implements IMenuService {
  @lazyInject(serviceIdentifier.Window) private readonly windowService!: IWindowService;

  private readonly menuTemplate: DeferredMenuItemConstructorOptions[];

  /**
   * Rebuild or create menubar from the latest menu template, will be call after some method change the menuTemplate
   * You don't need to call this after calling method like insertMenu, it will be call automatically.
   */
  public buildMenu(): void {
    const latestTemplate = this.getCurrentMenuItemConstructorOptions(this.menuTemplate) ?? [];
    const menu = Menu.buildFromTemplate(latestTemplate);
    Menu.setApplicationMenu(menu);
  }

  /**
   * We have some value in template that need to get latest value, they are functions, we execute every functions in the template
   * @param submenu menu options to get latest value
   * @returns MenuTemplate that `Menu.buildFromTemplate` wants
   */
  private getCurrentMenuItemConstructorOptions(submenu?: Array<DeferredMenuItemConstructorOptions | MenuItemConstructorOptions>): MenuItemConstructorOptions[] | undefined {
    if (submenu === undefined) return;
    return submenu.map((item) => ({
      ...item,
      label: typeof item.label === 'function' ? item.label() : item.label,
      enabled: typeof item.enabled === 'function' ? item.enabled() : item.enabled,
      submenu:
        typeof item.submenu === 'function'
          ? this.getCurrentMenuItemConstructorOptions(item.submenu())
          : item.submenu instanceof Menu
          ? item.submenu
          : this.getCurrentMenuItemConstructorOptions(item.submenu),
    }));
  }

  constructor() {
    // debounce so build menu won't be call very frequently on app launch, where every services are registering menu items
    this.buildMenu = debounce(this.buildMenu.bind(this), 50);
    // add some default app menus
    this.menuTemplate = [
      {
        label: 'TiddlyGit',
        id: 'TiddlyGit',
      },
      {
        label: 'Edit',
        id: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' },
          { type: 'separator' },
        ],
      },
      {
        label: 'View',
        id: 'View',
      },
      {
        label: 'Language',
        id: 'Language',
      },
      {
        label: 'History',
        id: 'History',
      },
      {
        label: 'Workspaces',
        id: 'Workspaces',
        submenu: [],
      },
      {
        role: 'window',
        id: 'window',
        submenu: [{ role: 'minimize' }, { role: 'close' }, { type: 'separator' }, { role: 'front' }, { type: 'separator' }],
      },
      {
        role: 'help',
        id: 'help',
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

  /** Register `on('context-menu', openContextMenuForWindow)` for a window, return an unregister function */
  public initContextMenuForWindowWebContents(webContents: WebContents): () => void {
    const openContextMenuForWindow = (event: Electron.Event, params: ContextMenuParams) => this.buildContextMenuAndPopup([], params, webContents);
    webContents.on('context-menu', openContextMenuForWindow);

    return () => {
      if (webContents.isDestroyed()) {
        return;
      }

      webContents.removeListener('context-menu', openContextMenuForWindow);
    };
  }

  /**
   * Insert provided sub menu items into menubar, so user and services can register custom menu items
   * @param menuID Top level menu name to insert menu items
   * @param menuItems An array of menu item to insert or update, if some of item is already existed, it will be updated instead of inserted
   * @param afterSubMenu The `id` or `role` of a submenu you want your submenu insert after. `null` means inserted as first submenu item; `undefined` means inserted as last submenu item;
   * @param withSeparator Need to insert a separator first, before insert menu items
   */
  public insertMenu(menuID: string, menuItems: DeferredMenuItemConstructorOptions[], afterSubMenu?: string | null, withSeparator = false): void {
    let foundMenuName = false;
    // try insert menu into an existed menu's submenu
    for (const menu of this.menuTemplate) {
      // match top level menu
      if (menu.id === menuID) {
        foundMenuName = true;
        // check some menu item existed, we update them and pop them out
        const filteredMenuItems: DeferredMenuItemConstructorOptions[] = [];
        for (const item of menuItems) {
          const currentSubMenu = typeof menu.submenu === 'function' ? menu.submenu() : menu.submenu ?? [];
          const existedItemIndex = currentSubMenu.findIndex(
            (existedItem) => existedItem.id === item.id || existedItem.label === item.label || existedItem.role === item.role,
          );
          if (existedItemIndex !== -1) {
            // TODO: update menu item
          }
        }

        // directly insert whole sub menu
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
            const afterSubMenuIndex = menu.submenu.findIndex((item) => item.id === afterSubMenu || item.role === afterSubMenu);
            if (afterSubMenuIndex === -1) {
              throw new Error(
                `You try to insert menu with afterSubMenu "${afterSubMenu}" in menu "${menuID}", but we can not found it in menu "${
                  menu.id ?? menu.role ?? JSON.stringify(menu)
                }", please specific a menuitem with correct id attribute`,
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
        label: menuID,
        submenu: menuItems,
      });
    }
    this.buildMenu()
  }

  public buildContextMenuAndPopup(
    template: MenuItemConstructorOptions[],
    info: IOnContextMenuInfo,
    webContentsOrWindowName: WindowNames | WebContents = WindowNames.main,
  ): void {
    let webContents: WebContents;
    if (typeof webContentsOrWindowName === 'string') {
      const windowToPopMenu = this.windowService.get(webContentsOrWindowName);
      const webContentsOfWindowToPopMenu = windowToPopMenu?.webContents;
      if (windowToPopMenu === undefined || webContentsOfWindowToPopMenu === undefined) {
        return;
      }
      webContents = webContentsOfWindowToPopMenu;
    } else {
      webContents = webContentsOrWindowName;
    }
    const contextMenuBuilder = new ContextMenuBuilder(webContents);
    contextMenuBuilder.buildMenuForElement(info).then((menu: any) => {
      // eslint-disable-next-line promise/always-return
      if (info.linkURL && info.linkURL.length > 0) {
        menu.append(new MenuItem({ type: 'separator' }));
        menu.append(
          new MenuItem({
            label: i18next.t('ContextMenu.OpenLinkInNewWindow'),
            click: async () => {
              ipcMain.emit('set-view-meta-force-new-window', true);
              window.open(info.linkURL);
            },
          }),
        );
        menu.append(new MenuItem({ type: 'separator' }));
      }

      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(
        new MenuItem({
          label: i18next.t('ContextMenu.Back'),
          enabled: webContents.canGoBack(),
          click: () => {
            webContents.goBack();
          },
        }),
      );
      menu.append(
        new MenuItem({
          label: i18next.t('ContextMenu.Forward'),
          enabled: webContents.canGoForward(),
          click: () => {
            webContents.goForward();
          },
        }),
      );
      menu.append(
        new MenuItem({
          label: i18next.t('ContextMenu.Reload'),
          click: () => {
            webContents.reload();
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
              click: () => ipcMain.emit('request-show-about-window'),
            },
            { type: 'separator' },
            {
              label: i18next.t('ContextMenu.CheckForUpdates'),
              click: () => ipcMain.emit('request-check-for-updates'),
            },
            {
              label: i18next.t('ContextMenu.Preferences'),
              click: () => ipcMain.emit('request-show-preferences-window'),
            },
            { type: 'separator' },
            {
              label: i18next.t('ContextMenu.TiddlyGitSupport'),
              click: async () => await shell.openExternal('https://github.com/tiddly-gittly/TiddlyGit-Desktop/issues/new/choose'),
            },
            {
              label: i18next.t('ContextMenu.TiddlyGitWebsite'),
              click: async () => await shell.openExternal('https://github.com/tiddly-gittly/TiddlyGit-Desktop'),
            },
            { type: 'separator' },
            {
              label: i18next.t('ContextMenu.Quit'),
              click: () => ipcMain.emit('request-quit'),
            },
          ],
        }),
      );
      menu.popup(webContents);
    });
  }
}
