import fs from 'fs-extra';
import path from 'path';

import type { IWindowService } from '@services/windows/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { container } from '@services/container';
import { LOCALIZATION_FOLDER } from '@services/constants/paths';
import { I18NChannels } from '@/constants/channels';

import type { IPreferenceService } from '@services/preferences/interface';
import type { IViewService } from '@services/view/interface';
import type { IMenuService, DeferredMenuItemConstructorOptions } from '@services/menu/interface';

const whitelistMap = JSON.parse(fs.readFileSync(path.join(LOCALIZATION_FOLDER, 'whitelist.json'), 'utf-8')) as Record<string, string>;

const whiteListedLanguages = Object.keys(whitelistMap);

/**
 * Register languages into language menu, call this function after container init
 */
export function buildLanguageMenu(): void {
  const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);
  const windowService = container.get<IWindowService>(serviceIdentifier.Window);
  const viewService = container.get<IViewService>(serviceIdentifier.View);
  const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
  const subMenu: DeferredMenuItemConstructorOptions[] = [];
  for (const language of whiteListedLanguages) {
    subMenu.push({
      label: whitelistMap[language],
      click: async () => {
        const i18n = (await import('./')).default;
        await Promise.all([preferenceService.set('language', language), i18n.changeLanguage(language)]);
        viewService.forEachView((view) => {
          view.webContents.send(I18NChannels.changeLanguageRequest, {
            lng: language,
          });
        });
        windowService.sendToAllWindows(I18NChannels.changeLanguageRequest, {
          lng: language,
        });
      },
    });
  }

  menuService.insertMenu('Language', subMenu);
}
