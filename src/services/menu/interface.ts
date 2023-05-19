import { MenuItemConstructorOptions, WebContents } from 'electron';

import { MenuChannel } from '@/constants/channels';
import { WindowNames } from '@services/windows/WindowProperties';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type { IpcSafeMenuItem } from './contextMenu/rendererMenuItemProxy';

/**
 * MenuItemConstructorOptions that allows properties like "label", "enabled", "submenu" to be () => xxx
 * So these value can be determined at every build time (menu will be rebuilt every time the preferences change)
 */
export interface DeferredMenuItemConstructorOptions extends Omit<MenuItemConstructorOptions, 'label' | 'enabled' | 'checked' | 'submenu'> {
  checked?: (() => boolean) | (() => Promise<boolean>) | boolean;
  enabled?: (() => boolean) | (() => Promise<boolean>) | boolean;
  label?: (() => string) | string;
  submenu?: Array<MenuItemConstructorOptions | DeferredMenuItemConstructorOptions>;
}

/**
 * Basically Partial<ContextMenuParams>, but must fill in xy
 */
export interface IOnContextMenuInfo {
  dictionarySuggestions?: string[];
  editFlags?: {
    canCopy?: boolean;
    canCut?: boolean;
    canPaste?: boolean;
  };
  hasImageContents?: boolean;
  inputFieldType?: string;
  isEditable?: boolean;
  linkText?: string;
  linkURL?: string;
  misspelledWord?: string;
  selectionText?: string;
  srcURL?: string;
  x: number;
  y: number;
}

/**
 * Handle creation of app menu, other services can register their menu tab and menu items here.
 */
export interface IMenuService {
  buildContextMenuAndPopup(template: MenuItemConstructorOptions[] | IpcSafeMenuItem[], info: IOnContextMenuInfo, windowName?: WindowNames): Promise<void>;
  buildMenu(): Promise<void>;
  initContextMenuForWindowWebContents(webContents: WebContents): Promise<() => void>;
  insertMenu(
    menuID: string,
    menuItems: DeferredMenuItemConstructorOptions[],
    afterSubMenu?: string | null,
    withSeparator?: boolean,
    menuPartKey?: string,
  ): Promise<void>;
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
