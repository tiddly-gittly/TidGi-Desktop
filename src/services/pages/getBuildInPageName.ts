import { i18n } from '@services/libs/i18n';
import { PageType } from './interface';

export function getBuildInPageName(pageType: PageType) {
  switch (pageType) {
    case PageType.wiki: {
      return i18n.t('Menu.Wiki');
    }
    case PageType.workflow: {
      return i18n.t('Workflow.Title');
    }
  }
}
