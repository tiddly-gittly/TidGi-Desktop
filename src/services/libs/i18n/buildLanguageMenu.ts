import fs from 'fs-extra';
import path from 'path';

import type { IWindowService } from '@services/windows/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { container } from '@services/container';
import { LOCALIZATION_FOLDER } from '@/constants/paths';
import { I18NChannels, WikiChannel } from '@/constants/channels';

import type { IPreferenceService } from '@services/preferences/interface';
import type { IViewService } from '@services/view/interface';
import type { IMenuService, DeferredMenuItemConstructorOptions } from '@services/menu/interface';
import { ipcMain } from 'electron';

const supportedLanguagesMap = JSON.parse(fs.readFileSync(path.join(LOCALIZATION_FOLDER, 'supportedLanguages.json'), 'utf-8')) as Record<string, string>;
const tiddlywikiLanguagesMap = JSON.parse(fs.readFileSync(path.join(LOCALIZATION_FOLDER, 'tiddlywikiLanguages.json'), 'utf-8')) as Record<
  string,
  string | undefined
>;

const supportedLanguagesKNames = Object.keys(supportedLanguagesMap);

/**
 * Register languages into language menu, call this function after container init
 */
export function buildLanguageMenu(): void {
  const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);
  const windowService = container.get<IWindowService>(serviceIdentifier.Window);
  const viewService = container.get<IViewService>(serviceIdentifier.View);
  const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
  const subMenu: DeferredMenuItemConstructorOptions[] = [];
  for (const language of supportedLanguagesKNames) {
    subMenu.push({
      label: supportedLanguagesMap[language],
      click: async () => {
        const i18n = (await import('./')).default;
        const { logger } = await import('../log');
        await Promise.all([preferenceService.set('language', language), i18n.changeLanguage(language)]);
        viewService.forEachView((view) => {
          view.webContents.send(I18NChannels.changeLanguageRequest, {
            lng: language,
          });
        });
        // change tiddlygit language
        await windowService.sendToAllWindows(I18NChannels.changeLanguageRequest, {
          lng: language,
        });
        // change tiddlywiki language
        await new Promise<void>((resolve, reject) => {
          let inProgressCounter = 0;
          // we don't wait more than 10s
          const twLanguageUpdateTimeout = 10_000;
          const tiddlywikiLanguageName = tiddlywikiLanguagesMap[language];
          if (tiddlywikiLanguageName !== undefined) {
            viewService.forEachView((view) => {
              inProgressCounter += 1;
              ipcMain.once(WikiChannel.setTiddlerTextDone, () => {
                inProgressCounter -= 1;
                if (inProgressCounter === 0) {
                  resolve();
                }
              });
              view.webContents.send(WikiChannel.setTiddlerText, '$:/language', tiddlywikiLanguageName);
            });
            setTimeout(() => {
              logger.error(
                `When click language menu "${language}", language "${tiddlywikiLanguageName}" is too slow to update, inProgressCounter is ${inProgressCounter} after ${twLanguageUpdateTimeout}ms.`,
              );
            }, twLanguageUpdateTimeout);
          } else {
            logger.error(`When click language menu "${language}", there is no corresponding tiddlywiki language registered`, {
              supportedLanguagesMap,
              tiddlywikiLanguagesMap,
            });
            resolve();
          }
        });
        await menuService.buildMenu();
      },
    });
  }

  void menuService.insertMenu('Language', subMenu);
}
