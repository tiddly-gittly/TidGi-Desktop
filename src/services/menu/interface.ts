import { Menu, MenuItemConstructorOptions, shell, WebContents } from 'electron';

import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { MenuChannel } from '@/constants/channels';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IpcSafeMenuItem } from './rendererMenuItemProxy';

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

export interface IOnContextMenuInfo {
  x: number;
  y: number;
  linkURL?: string;
  linkText?: string;
  selectionText?: string;
  misspelledWord?: string;
  srcURL?: string;
  hasImageContents?: boolean;
  dictionarySuggestions?: string[];
  isEditable?: boolean;
  inputFieldType?: string;
  editFlags?: {
    canCut?: boolean;
    canCopy?: boolean;
    canPaste?: boolean;
  };
}

/**
 * Handle creation of app menu, other services can register their menu tab and menu items here.
 */
export interface IMenuService {
  buildMenu(): void;
  initContextMenuForWindowWebContents(webContents: WebContents): () => void;
  insertMenu(menuID: string, menuItems: DeferredMenuItemConstructorOptions[], afterSubMenu?: string | null, withSeparator?: boolean): void;
  buildContextMenuAndPopup(template: MenuItemConstructorOptions[] | IpcSafeMenuItem[], info: IOnContextMenuInfo, windowName?: WindowNames): void;
}
export const MenuServiceIPCDescriptor = {
  channel: MenuChannel.name,
  properties: {
    buildMenu: ProxyPropertyType.Function,
    initContextMenuForWindowWebContents: ProxyPropertyType.Function,
    insertMenu: ProxyPropertyType.Function,
    buildContextMenuAndPopup: ProxyPropertyType.Function,
  },
};
