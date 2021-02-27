import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import BuildIcon from '@material-ui/icons/Build';
import CloudDownloadIcon from '@material-ui/icons/CloudDownload';
import CodeIcon from '@material-ui/icons/Code';
import ExtensionIcon from '@material-ui/icons/Extension';
import LanguageIcon from '@material-ui/icons/Language';
import MoreHorizIcon from '@material-ui/icons/MoreHoriz';
import NotificationsIcon from '@material-ui/icons/Notifications';
import PowerIcon from '@material-ui/icons/Power';
import RotateLeftIcon from '@material-ui/icons/RotateLeft';
import RouterIcon from '@material-ui/icons/Router';
import SecurityIcon from '@material-ui/icons/Security';
import StorefrontIcon from '@material-ui/icons/Storefront';
import SystemUpdateAltIcon from '@material-ui/icons/SystemUpdateAlt';
import WidgetsIcon from '@material-ui/icons/Widgets';
import GitHubIcon from '@material-ui/icons/GitHub';
import MenuBookIcon from '@material-ui/icons/MenuBook';
import { OverridableComponent } from '@material-ui/core/OverridableComponent';
import { SvgIconTypeMap } from '@material-ui/core';

import { PreferenceSections } from '@services/preferences/interface';

export function usePreferenceSections<SectionTitleElement = HTMLSpanElement>(): Record<
  PreferenceSections,
  {
    text: string;
    Icon: OverridableComponent<SvgIconTypeMap<unknown, 'svg'>>;
    ref: React.MutableRefObject<SectionTitleElement | null>;
    hidden?: boolean;
  }
> {
  const { t } = useTranslation();
  const sections = {
    [PreferenceSections.wiki]: {
      text: 'Wiki',
      Icon: MenuBookIcon,
      ref: useRef<SectionTitleElement>(),
    },
    [PreferenceSections.sync]: {
      text: t('Preference.Sync'),
      Icon: GitHubIcon,
      ref: useRef<SectionTitleElement>(),
    },
    [PreferenceSections.general]: {
      text: t('Preference.General'),
      Icon: WidgetsIcon,
      ref: useRef<SectionTitleElement>(),
    },
    [PreferenceSections.extensions]: {
      text: 'Extensions',
      Icon: ExtensionIcon,
      ref: useRef<SectionTitleElement>(),
    },
    [PreferenceSections.notifications]: {
      text: 'Notifications',
      Icon: NotificationsIcon,
      ref: useRef<SectionTitleElement>(),
    },
    [PreferenceSections.languages]: {
      text: 'Languages',
      Icon: LanguageIcon,
      ref: useRef<SectionTitleElement>(),
    },
    [PreferenceSections.downloads]: {
      text: 'Downloads',
      Icon: CloudDownloadIcon,
      ref: useRef<SectionTitleElement>(),
    },
    [PreferenceSections.network]: {
      text: 'Network',
      Icon: RouterIcon,
      ref: useRef<SectionTitleElement>(),
    },
    [PreferenceSections.privacy]: {
      text: 'Privacy & Security',
      Icon: SecurityIcon,
      ref: useRef<SectionTitleElement>(),
    },
    [PreferenceSections.system]: {
      text: 'System',
      Icon: BuildIcon,
      ref: useRef<SectionTitleElement>(),
    },
    [PreferenceSections.developers]: {
      text: 'Developers',
      Icon: CodeIcon,
      ref: useRef<SectionTitleElement>(),
    },
    [PreferenceSections.advanced]: {
      text: t('Preference.Advanced'),
      Icon: PowerIcon,
      ref: useRef<SectionTitleElement>(),
    },
    [PreferenceSections.updates]: {
      text: 'Updates',
      Icon: SystemUpdateAltIcon,
      ref: useRef<SectionTitleElement>(),
    },
    [PreferenceSections.reset]: {
      text: 'Reset',
      Icon: RotateLeftIcon,
      ref: useRef<SectionTitleElement>(),
    },
    [PreferenceSections.webCatalogApps]: {
      text: 'Webcatalog Apps',
      Icon: StorefrontIcon,
      ref: useRef<SectionTitleElement>(),
    },
    [PreferenceSections.misc]: {
      text: 'Miscellaneous',
      Icon: MoreHorizIcon,
      ref: useRef<SectionTitleElement>(),
    },
  };

  return sections;
}
