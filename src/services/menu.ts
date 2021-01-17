import { Menu, MenuItemConstructorOptions, shell } from 'electron';
import { debounce, take, drop } from 'lodash';
import { injectable, inject } from 'inversify';
import serviceIdentifiers from '@services/serviceIdentifier';
import { Preference } from '@services/preferences';
import { View } from '@services/view';

interface DeferredMenuItemConstructorOptions extends Omit<MenuItemConstructorOptions, 'label' | 'enabled' | 'submenu'> {
  label?: (() => string) | string;
  enabled?: (() => boolean) | boolean;
  submenu?:
    | (() => Array<MenuItemConstructorOptions | DeferredMenuItemConstructorOptions>)
    | Array<MenuItemConstructorOptions | DeferredMenuItemConstructorOptions>;
}

@injectable()
export class MenuService {
  private readonly menuTemplate: DeferredMenuItemConstructorOptions[];

  /**
   * Rebuild or create menubar from the latest menu template, will be call after some method change the menuTemplate
   * You don't need to call this after calling method like insertMenu, it will be call automatically.
   */
  public buildMenu(): void {
    const menu = Menu.buildFromTemplate(this.getCurrentMenuItemConstructorOptions(this.menuTemplate));
    Menu.setApplicationMenu(menu);
  }

  private getCurrentMenuItemConstructorOptions(
    submenu: Array<DeferredMenuItemConstructorOptions | MenuItemConstructorOptions> = this.menuTemplate,
  ): MenuItemConstructorOptions[] {
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

  constructor(
    @inject(serviceIdentifiers.Preference) private readonly preferenceService: Preference,
    @inject(serviceIdentifiers.View) private readonly viewService: View,
  ) {
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

  /**
   * Insert provided sub menu items into menubar, so user and services can register custom menu items
   * @param menuID Top level menu name to insert menu items
   * @param menuItems An array of menu item to insert
   * @param afterSubMenu The `id` or `role` of a submenu you want your submenu insert after. `null` means inserted as first submenu item; `undefined` means inserted as last submenu item;
   * @param withSeparator Need to insert a separator first, before insert menu items
   */
  insertMenu(menuID: string, menuItems: DeferredMenuItemConstructorOptions[], afterSubMenu?: string | null, withSeparator = false): void {
    let foundMenuName = false;
    // try insert menu into an existed menu's submenu
    for (const menu of this.menuTemplate) {
      if (menu.id === menuID) {
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
            const afterSubMenuIndex = menu.submenu.findIndex((item) => item.id === afterSubMenu || item.role === afterSubMenu);
            if (afterSubMenuIndex === -1) {
              throw new Error(
                `You try to insert menu with afterSubMenu ${afterSubMenu}, but we can not found it in menu ${
                  menu.id ?? menu.role ?? JSON.stringify(menu)
                }, please specific a menuitem with correct id attribute`,
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
  }
}
