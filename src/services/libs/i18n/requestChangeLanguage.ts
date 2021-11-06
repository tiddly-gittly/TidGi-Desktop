import { ipcMain } from 'electron';
import type { IWindowService } from '@services/windows/interface';
import type { IViewService } from '@services/view/interface';
import type { IMenuService } from '@services/menu/interface';
import { I18NChannels, WikiChannel } from '@/constants/channels';
import { container } from '@services/container';
import serviceIdentifier from '@services/serviceIdentifier';
import { tiddlywikiLanguagesMap, supportedLanguagesMap } from '@/constants/languages';
import { logger } from '../log';
import i18n from '.';

export async function requestChangeLanguage(newLanguage: string): Promise<void> {
  const windowService = container.get<IWindowService>(serviceIdentifier.Window);
  const viewService = container.get<IViewService>(serviceIdentifier.View);
  const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
  const viewCount = await viewService.getViewCount();

  await i18n.changeLanguage(newLanguage);
  viewService.forEachView((view) => {
    view.webContents.send(I18NChannels.changeLanguageRequest, {
      lng: newLanguage,
    });
  });
  // change tiddlygit language
  await windowService.sendToAllWindows(I18NChannels.changeLanguageRequest, {
    lng: newLanguage,
  });

  await Promise.all([
    // change tiddlywiki language
    new Promise<void>((resolve) => {
      let inProgressCounter = 0;
      // we don't wait more than 10s
      const twLanguageUpdateTimeout = 10_000;
      const tiddlywikiLanguageName = tiddlywikiLanguagesMap[newLanguage];
      if (tiddlywikiLanguageName !== undefined && viewCount > 0) {
        const onTimeout = (): void => {
          ipcMain.removeListener(WikiChannel.setTiddlerTextDone, onDone);
          logger.error(
            `When click language menu "${newLanguage}", language "${tiddlywikiLanguageName}" is too slow to update, inProgressCounter is ${inProgressCounter} after ${twLanguageUpdateTimeout}ms.`,
          );
          resolve();
        };
        const timeoutHandle = setTimeout(onTimeout, twLanguageUpdateTimeout);
        const onDone = (): void => {
          inProgressCounter -= 1;
          if (inProgressCounter === 0) {
            clearTimeout(timeoutHandle);
            resolve();
          }
        };
        viewService.forEachView((view) => {
          inProgressCounter += 1;
          ipcMain.once(WikiChannel.setTiddlerTextDone, onDone);
          view.webContents.send(WikiChannel.setTiddlerText, '$:/language', tiddlywikiLanguageName);
        });
      } else {
        logger.error(`When click language menu "${newLanguage}", there is no corresponding tiddlywiki language registered`, {
          supportedLanguagesMap,
          tiddlywikiLanguagesMap,
        });
        resolve();
      }
    }),
    // update menu
    await menuService.buildMenu(),
  ]);
}
