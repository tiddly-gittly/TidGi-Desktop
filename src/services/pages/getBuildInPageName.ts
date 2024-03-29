import type { TFunction } from 'i18next';
import { PageType } from './interface';

export function getBuildInPageName(pageType: PageType, t: TFunction) {
  switch (pageType) {
    case PageType.wiki: {
      return t('Menu.Wiki');
    }
    case PageType.help: {
      return t('WorkspaceSelector.Help');
    }
    case PageType.guide: {
      return t('WorkspaceSelector.Guide');
    }
  }
}
