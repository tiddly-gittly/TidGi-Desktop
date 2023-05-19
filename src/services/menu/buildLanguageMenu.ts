import { container } from '@services/container';
import serviceIdentifier from '@services/serviceIdentifier';

import { supportedLanguagesKNames, supportedLanguagesMap } from '@/constants/languages';
import type { DeferredMenuItemConstructorOptions, IMenuService } from '@services/menu/interface';
import type { IPreferenceService } from '@services/preferences/interface';

/**
 * Register languages into language menu, call this function after container init
 */
export function buildLanguageMenu(): void {
  const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);

  const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
  const subMenu: DeferredMenuItemConstructorOptions[] = [];
  for (const language of supportedLanguagesKNames) {
    subMenu.push({
      label: supportedLanguagesMap[language],
      click: async () => {
        await preferenceService.set('language', language);
      },
    });
  }

  void menuService.insertMenu('Language', subMenu);
}
