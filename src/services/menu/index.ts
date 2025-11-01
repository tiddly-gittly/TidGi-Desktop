import { WikiChannel } from '@/constants/channels';
import type { IAuthenticationService } from '@services/auth/interface';
import { container } from '@services/container';
import type { IContextService } from '@services/context/interface';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import type { IGitService } from '@services/git/interface';
import { i18n } from '@services/libs/i18n';
import { logger } from '@services/libs/log';
import type { INativeService } from '@services/native/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { ISyncService } from '@services/sync/interface';
import type { IViewService } from '@services/view/interface';
import type { IWikiService } from '@services/wiki/interface';
import type { IWikiGitWorkspaceService } from '@services/wikiGitWorkspace/interface';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { getWorkspaceMenuTemplate } from '@services/workspaces/getWorkspaceMenuTemplate';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import { app, ContextMenuParams, Menu, MenuItem, MenuItemConstructorOptions, shell, WebContents } from 'electron';
import { inject, injectable } from 'inversify';
import { compact, debounce, drop, remove, reverse, take } from 'lodash';
import ContextMenuBuilder from './contextMenu/contextMenuBuilder';
import { IpcSafeMenuItem, mainMenuItemProxy } from './contextMenu/rendererMenuItemProxy';
import { InsertMenuAfterSubMenuIndexError } from './error';
import type { IMenuService, IOnContextMenuInfo } from './interface';
import { DeferredMenuItemConstructorOptions } from './interface';
import { loadDefaultMenuTemplate } from './loadDefaultMenuTemplate';

@injectable()
export class MenuService implements IMenuService {
  constructor(
    @inject(serviceIdentifier.Authentication) private readonly authService: IAuthenticationService,
    @inject(serviceIdentifier.Context) private readonly contextService: IContextService,
    @inject(serviceIdentifier.ExternalAPI) private readonly externalAPIService: IExternalAPIService,
    @inject(serviceIdentifier.NativeService) private readonly nativeService: INativeService,
    @inject(serviceIdentifier.Preference) private readonly preferenceService: IPreferenceService,
  ) {
    // debounce so build menu won't be call very frequently on app launch, where every services are registering menu items
    this.buildMenu = debounce(this.buildMenu.bind(this), 50) as () => Promise<void>;
  }

  #menuTemplate?: DeferredMenuItemConstructorOptions[];
  private get menuTemplate(): DeferredMenuItemConstructorOptions[] {
    if (this.#menuTemplate === undefined) {
      this.#menuTemplate = loadDefaultMenuTemplate();
    }
    return this.#menuTemplate;
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
      logger.error('buildMenu failed', {
        error,
        function: 'buildMenu',
      });
      try {
        const index = Number(/Error processing argument at index (\d+)/.exec((error as Error).message)?.[1]);
        logger.error('buildMenu failed example', {
          index,
          example: Number.isFinite(index) ? JSON.stringify(latestTemplate[index]) : JSON.stringify(latestTemplate),
          function: 'buildMenu',
        });
      } catch (error) {
        logger.error('buildMenu failed fallback', {
          error,
          function: 'buildMenu',
        });
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

  /** Register `on('context-menu', openContextMenuForWindow)` for a window, return an unregister function */
  public async initContextMenuForWindowWebContents(webContents: WebContents): Promise<() => void> {
    const openContextMenuForWindow = async (_event: Electron.Event, parameters: ContextMenuParams): Promise<void> => {
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
    // Get services via container to avoid lazyInject issues
    const windowService = container.get<IWindowService>(serviceIdentifier.Window);
    const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const authService = container.get<IAuthenticationService>(serviceIdentifier.Authentication);
    const contextService = container.get<IContextService>(serviceIdentifier.Context);
    const gitService = container.get<IGitService>(serviceIdentifier.Git);
    const nativeService = container.get<INativeService>(serviceIdentifier.NativeService);
    const viewService = container.get<IViewService>(serviceIdentifier.View);
    const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
    const wikiGitWorkspaceService = container.get<IWikiGitWorkspaceService>(serviceIdentifier.WikiGitWorkspace);
    const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);
    const syncService = container.get<ISyncService>(serviceIdentifier.Sync);

    if (typeof webContentsOrWindowName === 'string') {
      const windowToPopMenu = windowService.get(webContentsOrWindowName);
      const webContentsOfWindowToPopMenu = windowToPopMenu?.webContents;
      if (windowToPopMenu === undefined || webContentsOfWindowToPopMenu === undefined) {
        return;
      }
      webContents = webContentsOfWindowToPopMenu;
    } else {
      webContents = webContentsOrWindowName;
    }
    const sidebar = await preferenceService.get('sidebar');
    const contextMenuBuilder = new ContextMenuBuilder(webContents);
    const menu = contextMenuBuilder.buildMenuForElement(info);
    const workspaces = await workspaceService.getWorkspacesAsList();
    const activeWorkspace = await workspaceService.getActiveWorkspace();
    const services = {
      auth: authService,
      context: contextService,
      externalAPI: this.externalAPIService,
      git: gitService,
      native: nativeService,
      preference: this.preferenceService,
      view: viewService,
      wiki: wikiService,
      wikiGitWorkspace: wikiGitWorkspaceService,
      window: windowService,
      workspace: workspaceService,
      workspaceView: workspaceViewService,
      sync: syncService,
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
            const workspace = await container.get<IWorkspaceService>(serviceIdentifier.Workspace).getActiveWorkspace();
            if (workspace !== undefined) {
              await container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView).restartWorkspaceViewService(workspace.id);
              await container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView).realignActiveWorkspace(workspace.id);
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

            if (rememberLastPageVisited && activeWorkspace && isWikiWorkspace(activeWorkspace) && activeWorkspace.lastUrl) {
              await webContents.loadURL(activeWorkspace.lastUrl);
            }
          },
        }),
      );
    } else {
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
                await container.get<IWindowService>(serviceIdentifier.Window).open(WindowNames.addWorkspace);
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
              tagName: isWikiWorkspace(workspace)
                ? (workspace.tagName ?? (workspace.isSubWiki ? workspace.name : `${workspace.name} ${i18n.t('WorkspaceSelector.DefaultTiddlers')}`))
                : workspace.name,
            }),
            click: async () => {
              await container.get<IWorkspaceService>(serviceIdentifier.Workspace).openWorkspaceTiddler(workspace);
            },
          })),
        }),
      );
    }
    menu.append(
      new MenuItem({
        label: i18n.t('ContextMenu.OpenCommandPalette'),
        enabled: workspaces.length > 0,
        click: () => {
          if (activeWorkspace !== undefined) {
            void container.get<IWikiService>(serviceIdentifier.Wiki).wikiOperationInBrowser(WikiChannel.dispatchEvent, activeWorkspace.id, ['open-command-palette']);
          }
        },
      }),
    );
    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(
      new MenuItem({
        label: i18n.t('ContextMenu.Back'),
        enabled: webContents.navigationHistory.canGoBack(),
        click: () => {
          webContents.navigationHistory.goBack();
        },
      }),
    );
    menu.append(
      new MenuItem({
        label: i18n.t('ContextMenu.Forward'),
        enabled: webContents.navigationHistory.canGoForward(),
        click: () => {
          webContents.navigationHistory.goForward();
        },
      }),
    );
    menu.append(
      new MenuItem({
        label: sidebar ? i18n.t('Preference.HideSideBar') : i18n.t('Preference.ShowSideBar'),
        click: async () => {
          await this.preferenceService.set('sidebar', !sidebar);
          await container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView).realignActiveWorkspace();
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
              await container.get<IWindowService>(serviceIdentifier.Window).open(WindowNames.preferences);
            },
          },
          { type: 'separator' },
          {
            label: i18n.t('ContextMenu.About'),
            click: async () => {
              await container.get<IWindowService>(serviceIdentifier.Window).open(WindowNames.about);
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
      const menuItems = (typeof template[0]?.click === 'string'
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
