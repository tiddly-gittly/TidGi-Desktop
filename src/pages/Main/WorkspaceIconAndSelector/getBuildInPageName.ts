import { PageType } from '@/constants/pageTypes';
import type { TFunction } from 'i18next';

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
    case PageType.agent: {
      return t('WorkspaceSelector.Agent');
    }
  }
}
