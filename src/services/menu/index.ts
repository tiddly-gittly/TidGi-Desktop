/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/require-await */
import type { IAuthenticationService } from '@services/auth/interface';
import { lazyInject } from '@services/container';
import type { IContextService } from '@services/context/interface';
import type { IGitService } from '@services/git/interface';
import { i18n } from '@services/libs/i18n';
import { logger } from '@services/libs/log';
import type { INativeService } from '@services/native/interface';
import type { IPagesService } from '@services/pages/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IUpdaterService } from '@services/updater/interface';
import type { IViewService } from '@services/view/interface';
import type { IWikiService } from '@services/wiki/interface';
import type { IWikiGitWorkspaceService } from '@services/wikiGitWorkspace/interface';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { getWorkspaceMenuTemplate, openWorkspaceTagTiddler } from '@services/workspaces/getWorkspaceMenuTemplate';
import type { IWorkspaceService } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import { app, ContextMenuParams, Menu, MenuItem, MenuItemConstructorOptions, shell, WebContents } from 'electron';
import { injectable } from 'inversify';
import { compact, debounce, drop, remove, reverse, take } from 'lodash';
import ContextMenuBuilder from './contextMenu/contextMenuBuilder';
import { IpcSafeMenuItem, mainMenuItemProxy } from './contextMenu/rendererMenuItemProxy';
import { InsertMenuAfterSubMenuIndexError } from './error';
import type { IMenuService, IOnContextMenuInfo } from './interface';
import { DeferredMenuItemConstructorOptions } from './interface';

@injectable()
export class MenuService implements IMenuService {
  @lazyInject(serviceIdentifier.Authentication)
  private readonly authService!: IAuthenticationService;

  @lazyInject(serviceIdentifier.Context)
  private readonly contextService!: IContextService;

  @lazyInject(serviceIdentifier.Git)
  private readonly gitService!: IGitService;

  @lazyInject(serviceIdentifier.Pages)
  private readonly pagesService!: IPagesService;

  @lazyInject(serviceIdentifier.NativeService)
  private readonly nativeService!: INativeService;

  @lazyInject(serviceIdentifier.Preference)
  private readonly preferenceService!: IPreferenceService;

  @lazyInject(serviceIdentifier.Updater)
  private readonly updaterService!: IUpdaterService;

  @lazyInject(serviceIdentifier.View)
  private readonly viewService!: IViewService;

  @lazyInject(serviceIdentifier.Wiki)
  private readonly wikiService!: IWikiService;

  @lazyInject(serviceIdentifier.WikiGitWorkspace)
  private readonly wikiGitWorkspaceService!: IWikiGitWorkspaceService;

  @lazyInject(serviceIdentifier.Window)
  private readonly windowService!: IWindowService;

  @lazyInject(serviceIdentifier.Workspace)
  private readonly workspaceService!: IWorkspaceService;

  @lazyInject(serviceIdentifier.WorkspaceView)
  private readonly workspaceViewService!: IWorkspaceViewService;

  private _menuTemplate?: DeferredMenuItemConstructorOptions[];
  private get menuTemplate(): DeferredMenuItemConstructorOptions[] {
    if (this._menuTemplate === undefined) {
      this.loadDefaultMenuTemplate();
    }
    return this._menuTemplate!;
  }

  /**
   * Record each menu part contains what menuItem, so we can delete these menuItem before insert new ones
   * `{ [menuPartKey]: [menuID, menuItemID][] }`
   * Menu part means "refresh part", that will be refresh upon insert new items.
   */
  private menuPartRecord: Record<string, Array<[string, string]>> = {};
  /** check if menuItem with menuID and itemID belongs to a menuPartKey */
  private belongsToPart(menuPartKey: string, menuID: string, itemID?: string): boolean {
    // if menuItem only have role, it won't be refresh, so it won't belongs to a refresh part
    if (itemID === undefined) {
      return false;
    }
    const record = this.menuPartRecord[menuPartKey];
    if (record !== undefined) {
      return record.some(([currentMenuID, currentItemID]) => menuID === currentMenuID && itemID === currentItemID);
    }
    return false;
  }

  private updateMenuPartRecord(
    menuPartKey: string,
    menuID: string,
    newSubMenuItems: Array<DeferredMenuItemConstructorOptions | MenuItemConstructorOptions>,
  ): void {
    this.menuPartRecord[menuPartKey] = newSubMenuItems.filter((item) => item.id !== undefined).map((item) => [menuID, item.id!] as [string, string]);
  }

  /**
   * Rebuild or create menubar from the latest menu template, will be call after some method change the menuTemplate
   * You don't need to call this after calling method like insertMenu, it will be call automatically.
   */
  public async buildMenu(): Promise<void> {
    const latestTemplate = (await this.getCurrentMenuItemConstructorOptions(this.menuTemplate)) ?? [];
    try {
      const menu = Menu.buildFromTemplate(latestTemplate);
      Menu.setApplicationMenu(menu);
    } catch (error) {
      logger.error(`buildMenu() failed (error): ${(error as Error).message} ${(error as Error).stack ?? ''}`);
      try {
        const index = Number(/Error processing argument at index (\d+)/.exec((error as Error).message)?.[1]);
        logger.error(`buildMenu() failed (example index ${index}): \n${Number.isFinite(index) ? JSON.stringify(latestTemplate[index]) : JSON.stringify(latestTemplate)}`);
      } catch (error) {
        logger.error(error);
      }
    }
  }

  /**
   * We have some value in template that need to get latest value, they are functions, we execute every functions in the template
   * @param submenu menu options to get latest value
   * @returns MenuTemplate that `Menu.buildFromTemplate` wants
   */
  private async getCurrentMenuItemConstructorOptions(
    submenu?: Array<DeferredMenuItemConstructorOptions | MenuItemConstructorOptions>,
  ): Promise<MenuItemConstructorOptions[] | undefined> {
    if (submenu === undefined) return;
    return await Promise.all(
      submenu
        .filter((item) => Object.keys(item).length > 0)
        .map(async (item) => ({
          ...item,
          /** label sometimes is null, causing  */
          label: typeof item.label === 'function' ? item.label() ?? undefined : item.label,
          checked: typeof item.checked === 'function' ? await item.checked() : item.checked,
          enabled: typeof item.enabled === 'function' ? await item.enabled() : item.enabled,
          submenu: Array.isArray(item.submenu) ? await this.getCurrentMenuItemConstructorOptions(compact(item.submenu)) : item.submenu,
        })),
    );
  }

  /**
   * Defer to i18next ready to call this
   */
  private loadDefaultMenuTemplate(): void {
    this._menuTemplate = [
      {
        label: () => i18n.t('Menu.TidGi'),
        id: 'TidGi',
        submenu: [
          {
            label: () => i18n.t('ContextMenu.About'),
            click: async () => {
              await this.windowService.open(WindowNames.about);
            },
          },
          { type: 'separator' },
          {
            id: 'update',
            label: () => i18n.t('Updater.CheckUpdate'),
            click: async () => {
              await this.updaterService.checkForUpdates();
            },
          },
          {
            label: () => i18n.t('ContextMenu.Preferences'),
            accelerator: 'CmdOrCtrl+,',
            click: async () => {
              await this.windowService.open(WindowNames.preferences);
            },
          },
          { type: 'separator' },
          {
            label: () => i18n.t('Preference.Notifications'),
            click: async () => {
              await this.windowService.open(WindowNames.notifications);
            },
            accelerator: 'CmdOrCtrl+Shift+N',
          },
          { type: 'separator' },
          { role: 'services', submenu: [] },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { label: () => i18n.t('ContextMenu.Quit') + i18n.t('Menu.TidGi'), role: 'quit' },
        ],
      },
      {
        label: () => i18n.t('Menu.Edit'),
        id: 'Edit',
        role: 'editMenu',
      },
      {
        label: () => i18n.t('Menu.View'),
        id: 'View',
      },
      {
        label: () => i18n.t('Menu.Language'),
        id: 'Language',
      },
      {
        label: () => i18n.t('Menu.History'),
        id: 'History',
      },
      {
        label: () => i18n.t('Menu.Workspaces'),
        id: 'Workspaces',
        submenu: [],
      },
      {
        label: () => i18n.t('Menu.Wiki'),
        id: 'Wiki',
        submenu: [],
      },
      {
        label: () => i18n.t('Menu.Window'),
        role: 'windowMenu',
        id: 'Window',
      },
      {
        label: () => i18n.t('Menu.Help'),
        role: 'help',
        id: 'help',
        submenu: [
          {
            label: () => i18n.t('ContextMenu.TidGiSupport'),
            click: async () => {
              await shell.openExternal('https://github.com/tiddly-gittly/TidGi-desktop/issues');
            },
          },
          {
            label: () => i18n.t('Menu.ReportBugViaGithub'),
            click: async () => {
              await shell.openExternal('https://github.com/tiddly-gittly/TidGi-desktop/issues');
            },
          },
          {
            label: () => i18n.t('Menu.RequestFeatureViaGithub'),
            click: async () => {
              await shell.openExternal('https://github.com/tiddly-gittly/TidGi-desktop/issues/new?template=feature.md&title=feature%3A+');
            },
          },
          {
            label: () => i18n.t('Menu.LearnMore'),
            click: async () => {
              await shell.openExternal('https://github.com/tiddly-gittly/TidGi-desktop/');
            },
          },
        ],
      },
    ];
  }

  constructor() {
    // debounce so build menu won't be call very frequently on app launch, where every services are registering menu items
    this.buildMenu = debounce(this.buildMenu.bind(this), 50) as () => Promise<void>;
  }

  /** Register `on('context-menu', openContextMenuForWindow)` for a window, return an unregister function */
  public async initContextMenuForWindowWebContents(webContents: WebContents): Promise<() => void> {
    const openContextMenuForWindow = async (event: Electron.Event, parameters: ContextMenuParams): Promise<void> => {
      await this.buildContextMenuAndPopup([], parameters, webContents);
    };
    webContents.on('context-menu', openContextMenuForWindow);

    return () => {
      if (webContents.isDestroyed()) {
        return;
      }

      webContents.removeListener('context-menu', openContextMenuForWindow);
    };
  }

  private static isMenuItemEqual<T extends DeferredMenuItemConstructorOptions | MenuItemConstructorOptions>(a: T, b: T): boolean {
    if (a.id === b.id && a.id !== undefined) {
      return true;
    }
    if (a.role === b.role && a.role !== undefined) {
      return true;
    }
    if (typeof a.label === 'string' && typeof b.label === 'string' && a.label === b.label && a.label !== undefined) {
      return true;
    }
    if (typeof a.label === 'function' && typeof b.label === 'function' && a.label() === b.label() && a.label() !== undefined) {
      return true;
    }
    if (typeof a.label === 'function' && typeof b.label === 'string' && a.label() === b.label && b.label !== undefined) {
      return true;
    }
    if (typeof b.label === 'function' && typeof a.label === 'string' && b.label() === a.label && a.label !== undefined) {
      return true;
    }
    return false;
  }

  /**
   * Insert provided sub menu items into menubar, so user and services can register custom menu items
   * @param menuID Top level menu name to insert menu items
   * @param newSubMenuItems An array of menu item to insert or update, if some of item is already existed, it will be updated instead of inserted
   * @param afterSubMenu The `id` or `role` of a submenu you want your submenu insert after. `null` means inserted as first submenu item; `undefined` means inserted as last submenu item;
   * @param withSeparator Need to insert a separator first, before insert menu items
   * @param menuPartKey When you update a part of menu, you can overwrite old menu part with same key
   */
  public async insertMenu(
    menuID: string,
    newSubMenuItems: Array<DeferredMenuItemConstructorOptions | MenuItemConstructorOptions>,
    afterSubMenu?: string | null,
    withSeparator = false,
    menuPartKey?: string,
  ): Promise<void> {
    let foundMenuName = false;
    const copyOfNewSubMenuItems = [...newSubMenuItems];
    // try insert menu into an existed menu's submenu
    for (const menu of this.menuTemplate) {
      // match top level menu
      if (menu.id === menuID) {
        foundMenuName = true;
        // heck some menu item existed, we update them and pop them out
        const currentSubMenu = compact(menu.submenu);
        // we push old and new content into this array, and assign back to menu.submenu later
        let filteredSubMenu: Array<DeferredMenuItemConstructorOptions | MenuItemConstructorOptions> = currentSubMenu;
        // refresh menu part by delete previous menuItems that belongs to the same partKey
        if (menuPartKey !== undefined) {
          filteredSubMenu = filteredSubMenu.filter((currentSubMenuItem) => !this.belongsToPart(menuPartKey, menuID, currentSubMenuItem.id));
        }
        for (const newSubMenuItem of newSubMenuItems) {
          const existedItemIndex = currentSubMenu.findIndex((existedItem) => MenuService.isMenuItemEqual(existedItem, newSubMenuItem));
          // replace existed item, and remove it from needed-to-add-items
          if (existedItemIndex !== -1) {
            filteredSubMenu[existedItemIndex] = newSubMenuItem;
            remove(newSubMenuItems, (item) => item.id === newSubMenuItem.id);
          }
        }

        if (afterSubMenu === undefined) {
          // inserted as last submenu item
          if (withSeparator) {
            filteredSubMenu.push({ type: 'separator' });
          }
          filteredSubMenu = [...filteredSubMenu, ...newSubMenuItems];
        } else if (afterSubMenu === null) {
          // inserted as first submenu item
          if (withSeparator) {
            newSubMenuItems.push({ type: 'separator' });
          }
          filteredSubMenu = [...newSubMenuItems, ...filteredSubMenu];
        } else if (typeof afterSubMenu === 'string') {
          // insert after afterSubMenu
          const afterSubMenuIndex = filteredSubMenu.findIndex((item) => item.id === afterSubMenu || item.role === afterSubMenu);
          if (afterSubMenuIndex === -1) {
            throw new InsertMenuAfterSubMenuIndexError(afterSubMenu, menuID, menu);
          }
          filteredSubMenu = [...take(filteredSubMenu, afterSubMenuIndex + 1), ...newSubMenuItems, ...drop(filteredSubMenu, afterSubMenuIndex - 1)];
        }
        menu.submenu = filteredSubMenu;
        // leave this finding menu loop
        break;
      }
    }
    // if user wants to create a new menu in menubar
    if (!foundMenuName) {
      this.menuTemplate.push({
        label: menuID,
        submenu: newSubMenuItems,
      });
    }
    // update menuPartRecord
    if (menuPartKey !== undefined) {
      this.updateMenuPartRecord(menuPartKey, menuID, copyOfNewSubMenuItems);
    }
    await this.buildMenu();
  }

  public async buildContextMenuAndPopup(
    template: MenuItemConstructorOptions[] | IpcSafeMenuItem[],
    info: IOnContextMenuInfo,
    webContentsOrWindowName: WindowNames | WebContents = WindowNames.main,
  ): Promise<void> {
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
    const sidebar = await this.preferenceService.get('sidebar');
    const contextMenuBuilder = new ContextMenuBuilder(webContents);
    const menu = contextMenuBuilder.buildMenuForElement(info);
    const workspaces = await this.workspaceService.getWorkspacesAsList();
    const activeWorkspace = await this.workspaceService.getActiveWorkspace();
    const services = {
      auth: this.authService,
      context: this.contextService,
      git: this.gitService,
      native: this.nativeService,
      pages: this.pagesService,
      view: this.viewService,
      wiki: this.wikiService,
      wikiGitWorkspace: this.wikiGitWorkspaceService,
      window: this.windowService,
      workspace: this.workspaceService,
      workspaceView: this.workspaceViewService,
    };
    // workspace menus
    menu.append(new MenuItem({ type: 'separator' }));
    // show workspace menu to manipulate workspaces if sidebar is not open
    if (sidebar) {
      // when sidebar is showing, only show current workspace's operations
      if (activeWorkspace !== undefined) {
        menu.append(
          new MenuItem({
            label: i18n.t('Menu.CurrentWorkspace'),
            submenu: await getWorkspaceMenuTemplate(activeWorkspace, i18n.t.bind(i18n), services),
          }),
        );
      }
      menu.append(
        new MenuItem({
          label: i18n.t('ContextMenu.RestartService'),
          click: async () => {
            const workspace = await this.workspaceService.getActiveWorkspace();
            if (workspace !== undefined) {
              await this.workspaceViewService.restartWorkspaceViewService(workspace.id);
              await this.workspaceViewService.realignActiveWorkspace(workspace.id);
            }
          },
        }),
      );
      menu.append(
        new MenuItem({
          label: i18n.t('ContextMenu.Reload'),
          click: async () => {
            webContents.reload();
            const rememberLastPageVisited = await this.preferenceService.get('rememberLastPageVisited');
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (rememberLastPageVisited && activeWorkspace?.lastUrl) {
              await webContents.loadURL(activeWorkspace.lastUrl);
            }
          },
        }),
      );
    } else {
      menu.append(
        new MenuItem({
          label: i18n.t('ContextMenu.OpenCommandPalette'),
          enabled: workspaces.length > 0,
          click: () => {
            void this.wikiService.requestWikiSendActionMessage('open-command-palette');
          },
        }),
      );
      if (activeWorkspace !== undefined) {
        const currentWorkspaceContextMenuTemplate = await getWorkspaceMenuTemplate(activeWorkspace, i18n.t.bind(i18n), services);
        currentWorkspaceContextMenuTemplate.forEach((menuItem) => {
          menu.append(new MenuItem(menuItem));
        });
      }
      menu.append(
        new MenuItem({
          label: i18n.t('Menu.Workspaces'),
          submenu: [
            ...(await Promise.all(
              workspaces.map(async (workspace) => {
                const workspaceContextMenuTemplate = await getWorkspaceMenuTemplate(workspace, i18n.t.bind(i18n), services);
                return {
                  label: workspace.name,
                  submenu: workspaceContextMenuTemplate,
                };
              }),
            )),
            {
              label: i18n.t('WorkspaceSelector.Add'),
              click: async () => {
                await this.windowService.open(WindowNames.addWorkspace);
              },
            },
          ],
        }),
      );
      menu.append(
        new MenuItem({
          label: i18n.t('WorkspaceSelector.OpenWorkspaceMenuName'),
          submenu: workspaces.map((workspace) => ({
            label: i18n.t('WorkspaceSelector.OpenWorkspaceTagTiddler', {
              tagName: workspace.tagName ?? (workspace.isSubWiki ? workspace.name : `${workspace.name} ${i18n.t('WorkspaceSelector.DefaultTiddlers')}`),
            }),
            click: async () => {
              await openWorkspaceTagTiddler(workspace, services);
            },
          })),
        }),
      );
    }
    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(
      new MenuItem({
        label: i18n.t('ContextMenu.Back'),
        enabled: webContents.canGoBack(),
        click: () => {
          webContents.goBack();
        },
      }),
    );
    menu.append(
      new MenuItem({
        label: i18n.t('ContextMenu.Forward'),
        enabled: webContents.canGoForward(),
        click: () => {
          webContents.goForward();
        },
      }),
    );
    menu.append(
      new MenuItem({
        label: sidebar ? i18n.t('Preference.HideSideBar') : i18n.t('Preference.ShowSideBar'),
        click: async () => {
          await this.preferenceService.set('sidebar', !sidebar);
          await this.workspaceViewService.realignActiveWorkspace();
        },
      }),
    );
    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(
      new MenuItem({
        label: i18n.t('ContextMenu.More'),
        submenu: [
          {
            label: i18n.t('ContextMenu.Preferences'),
            click: async () => {
              await this.windowService.open(WindowNames.preferences);
            },
          },
          { type: 'separator' },
          {
            label: i18n.t('ContextMenu.About'),
            click: async () => {
              await this.windowService.open(WindowNames.about);
            },
          },
          {
            label: i18n.t('ContextMenu.TidGiSupport'),
            click: async () => {
              await shell.openExternal('https://github.com/tiddly-gittly/TidGi-Desktop/issues/new/choose');
            },
          },
          {
            label: i18n.t('ContextMenu.TidGiWebsite'),
            click: async () => {
              await shell.openExternal('https://github.com/tiddly-gittly/TidGi-Desktop');
            },
          },
          { type: 'separator' },
          {
            label: i18n.t('ContextMenu.Quit'),
            click: () => {
              app.quit();
            },
          },
        ],
      }),
    );

    // add custom menu items
    if (template !== undefined && Array.isArray(template) && template.length > 0) {
      // if our menu item config is pass from the renderer process, we reconstruct callback from the ipc.on channel id.
      const menuItems = (typeof template?.[0]?.click === 'string'
        ? mainMenuItemProxy(template as IpcSafeMenuItem[], webContents)
        : template) as unknown as MenuItemConstructorOptions[];
      menu.insert(0, new MenuItem({ type: 'separator' }));
      // we are going to prepend items, so inverse first, so order will remain
      reverse(menuItems)
        .map((menuItem) => new MenuItem(menuItem))
        .forEach((menuItem) => {
          menu.insert(0, menuItem);
        });
    }

    menu.popup();
  }
}
