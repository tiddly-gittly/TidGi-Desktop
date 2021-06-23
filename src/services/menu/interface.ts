import { MenuItemConstructorOptions, WebContents } from 'electron';

import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { MenuChannel } from '@/constants/channels';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IpcSafeMenuItem } from './rendererMenuItemProxy';

/**
 * MenuItemConstructorOptions that allows properties like "label", "enabled", "submenu" to be () => xxx
 * So these value can be determined at every build time (menu will be rebuilt every time the preferences change)
 */
export interface DeferredMenuItemConstructorOptions extends Omit<MenuItemConstructorOptions, 'label' | 'enabled' | 'checked' | 'submenu'> {
  label?: (() => string) | string;
  enabled?: (() => boolean) | (() => Promise<boolean>) | boolean;
  checked?: (() => boolean) | (() => Promise<boolean>) | boolean;
  submenu?: Array<MenuItemConstructorOptions | DeferredMenuItemConstructorOptions>;
}

/**
 * Basically Partial<ContextMenuParams>, but must fill in xy
 */
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
  buildMenu(): Promise<void>;
  initContextMenuForWindowWebContents(webContents: WebContents): Promise<() => void>;
  insertMenu(
    menuID: string,
    menuItems: DeferredMenuItemConstructorOptions[],
    afterSubMenu?: string | null,
    withSeparator?: boolean,
    menuPartKey?: string,
  ): Promise<void>;
  buildContextMenuAndPopup(template: MenuItemConstructorOptions[] | IpcSafeMenuItem[], info: IOnContextMenuInfo, windowName?: WindowNames): Promise<void>;
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
