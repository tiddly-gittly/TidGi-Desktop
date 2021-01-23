import { Menu, MenuItemConstructorOptions, shell } from 'electron';

import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { MenuChannel } from '@/constants/channels';

/**
 * MenuItemConstructorOptions that allows properties like "label", "enabled", "submenu" to be () => xxx
 * So these value can be determined at every build time (menu will be rebuilt every time the preferences change)
 */
export interface DeferredMenuItemConstructorOptions extends Omit<MenuItemConstructorOptions, 'label' | 'enabled' | 'submenu'> {
  label?: (() => string) | string;
  enabled?: (() => boolean) | boolean;
  submenu?:
    | (() => Array<MenuItemConstructorOptions | DeferredMenuItemConstructorOptions>)
    | Array<MenuItemConstructorOptions | DeferredMenuItemConstructorOptions>;
}

/**
 * Handle creation of app menu, other services can register their menu tab and menu items here.
 */
export interface IMenuService {
  buildMenu(): void;
  insertMenu(menuID: string, menuItems: DeferredMenuItemConstructorOptions[], afterSubMenu?: string | null, withSeparator?: boolean): void;
}
export const MenuServiceIPCDescriptor = {
  channel: MenuChannel.name,
  properties: {
    buildMenu: ProxyPropertyType.Function,
    insertMenu: ProxyPropertyType.Function,
  },
};
