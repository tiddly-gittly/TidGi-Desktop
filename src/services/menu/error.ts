import { i18n } from '@services/libs/i18n';
import { DeferredMenuItemConstructorOptions } from './interface';

export class InsertMenuAfterSubMenuIndexError extends Error {
  constructor(afterSubMenu: string, menuID: string, menu: DeferredMenuItemConstructorOptions) {
    super();
    this.name = i18n.t('Error.InsertMenuAfterSubMenuIndexError');
    this.message = i18n.t('Error.InsertMenuAfterSubMenuIndexErrorDescription', { afterSubMenu, menuID, menu: menu.id ?? menu.role ?? JSON.stringify(menu) });
  }
}
