import { I18NChannels } from '@/constants/channels';
import { container } from '@services/container';
import type { IContextService } from '@services/context/interface';
import type { IMenuService } from '@services/menu/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IViewService } from '@services/view/interface';
import type { IWikiService } from '@services/wiki/interface';
import type { IWindowService } from '@services/windows/interface';
import { logger } from '../log';
import { i18n } from '.';

export async function requestChangeLanguage(newLanguage: string): Promise<void> {
  const contextService = container.get<IContextService>(serviceIdentifier.Context);
  const windowService = container.get<IWindowService>(serviceIdentifier.Window);
  const viewService = container.get<IViewService>(serviceIdentifier.View);
  const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
  const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
  const viewCount = await viewService.getViewCount();

  // Get language maps from context service
  const supportedLanguagesMap = await contextService.get('supportedLanguagesMap');
  const tiddlywikiLanguagesMap = await contextService.get('tiddlywikiLanguagesMap');

  await i18n.changeLanguage(newLanguage);
  viewService.forEachView((_view) => {
    _view.webContents.send(I18NChannels.changeLanguageRequest, {
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
          resolve(null);
          return;
        }
        const tasks: Array<Promise<void>> = [];
        viewService.forEachView((_view, workspaceID) => {
          tasks.push(wikiService.setWikiLanguage(workspaceID, tiddlywikiLanguageName));
        });
        void Promise.all(tasks).then(resolve, reject);
      }
    }),
    // update menu
    menuService.buildMenu(),
  ]);
}
