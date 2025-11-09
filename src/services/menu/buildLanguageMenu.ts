import { container } from '@services/container';
import serviceIdentifier from '@services/serviceIdentifier';

import type { IContextService } from '@services/context/interface';
import type { DeferredMenuItemConstructorOptions, IMenuService } from '@services/menu/interface';
import type { IPreferenceService } from '@services/preferences/interface';

/**
 * Register languages into language menu, call this function after container init
 */
export async function buildLanguageMenu(): Promise<void> {
  const contextService = container.get<IContextService>(serviceIdentifier.Context);
  const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);
  const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);

  // Load language maps from context service
  const supportedLanguagesMap = await contextService.get('supportedLanguagesMap');
  const supportedLanguagesKNames = Object.keys(supportedLanguagesMap);

  const subMenu: DeferredMenuItemConstructorOptions[] = [];
  for (const language of supportedLanguagesKNames) {
    subMenu.push({
      label: supportedLanguagesMap[language],
      click: async () => {
        await preferenceService.set('language', language);
      },
    });
  }

  await menuService.insertMenu('Language', subMenu);
}
