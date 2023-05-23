import { I18NChannels } from '@/constants/channels';
import { supportedLanguagesMap, tiddlywikiLanguagesMap } from '@/constants/languages';
import { container } from '@services/container';
import type { IMenuService } from '@services/menu/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IViewService } from '@services/view/interface';
import type { IWikiService } from '@services/wiki/interface';
import type { IWindowService } from '@services/windows/interface';
import { logger } from '../log';
import { i18n } from '.';

export async function requestChangeLanguage(newLanguage: string): Promise<void> {
  const windowService = container.get<IWindowService>(serviceIdentifier.Window);
  const viewService = container.get<IViewService>(serviceIdentifier.View);
  const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
  const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
  const viewCount = await viewService.getViewCount();

  await i18n.changeLanguage(newLanguage);
  viewService.forEachView((view) => {
    view.webContents.send(I18NChannels.changeLanguageRequest, {
      lng: newLanguage,
    });
  });
  // change tidgi language
  await windowService.sendToAllWindows(I18NChannels.changeLanguageRequest, {
    lng: newLanguage,
  });

  await Promise.all([
    // change tiddlywiki language
    new Promise<unknown>((resolve, reject) => {
      const tiddlywikiLanguageName = tiddlywikiLanguagesMap[newLanguage];
      if (tiddlywikiLanguageName === undefined) {
        const errorMessage = `When click language menu "${newLanguage}", there is no corresponding tiddlywiki language registered`;
        logger.error(errorMessage, {
          supportedLanguagesMap,
          tiddlywikiLanguagesMap,
        });
        reject(new Error(errorMessage));
      } else {
        if (viewCount === 0) {
          return;
        }
        const tasks: Array<Promise<void>> = [];
        viewService.forEachView((view, workspaceID) => {
          tasks.push(wikiService.setWikiLanguage(workspaceID, tiddlywikiLanguageName));
        });
        void Promise.all(tasks).then(resolve, reject);
      }
    }),
    // update menu
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    await menuService.buildMenu(),
  ]);
}
