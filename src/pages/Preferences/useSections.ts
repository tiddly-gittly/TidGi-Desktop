import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { SvgIconTypeMap } from '@mui/material';
import { OverridableComponent } from '@mui/material/OverridableComponent';
import BuildIcon from '@mui/icons-material/Build';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import CodeIcon from '@mui/icons-material/Code';
import GitHubIcon from '@mui/icons-material/GitHub';
import LanguageIcon from '@mui/icons-material/Language';
import LanguageModelIcon from '@mui/icons-material/Psychology';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import NotificationsIcon from '@mui/icons-material/Notifications';
import PowerIcon from '@mui/icons-material/Power';
import RouterIcon from '@mui/icons-material/Router';
import SecurityIcon from '@mui/icons-material/Security';
import StorefrontIcon from '@mui/icons-material/Storefront';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import WidgetsIcon from '@mui/icons-material/Widgets';

import { PreferenceSections } from '@services/preferences/interface';

export type ISectionRecord<SectionTitleElement = HTMLSpanElement> = Record<
  PreferenceSections,
  {
    Icon: OverridableComponent<SvgIconTypeMap<unknown, 'svg'>>;
    hidden?: boolean;
    ref: React.MutableRefObject<SectionTitleElement | null>;
    text: string;
  }
>;
export function usePreferenceSections<SectionTitleElement = HTMLSpanElement>(): ISectionRecord<SectionTitleElement> {
  const { t } = useTranslation();
  const sections = {
    [PreferenceSections.wiki]: {
      text: t('Preference.TiddlyWiki'),
      Icon: MenuBookIcon,
      ref: useRef<SectionTitleElement>(null),
    },
    [PreferenceSections.general]: {
      text: t('Preference.General'),
      Icon: WidgetsIcon,
      ref: useRef<SectionTitleElement>(null),
    },
    [PreferenceSections.languageModel]: {
      text: t('Preference.LanguageModel.Title'),
      Icon: LanguageModelIcon,
      ref: useRef<SectionTitleElement>(null),
    },
    [PreferenceSections.sync]: {
      text: t('Preference.Sync'),
      Icon: GitHubIcon,
      ref: useRef<SectionTitleElement>(null),
    },
    [PreferenceSections.notifications]: {
      text: t('Preference.Notifications'),
      Icon: NotificationsIcon,
      ref: useRef<SectionTitleElement>(null),
    },
    [PreferenceSections.system]: {
      text: t('Preference.System'),
      Icon: BuildIcon,
      ref: useRef<SectionTitleElement>(null),
    },
    [PreferenceSections.languages]: {
      text: t('Preference.Languages'),
      Icon: LanguageIcon,
      ref: useRef<SectionTitleElement>(null),
    },
    [PreferenceSections.developers]: {
      text: t('Preference.DeveloperTools'),
      Icon: CodeIcon,
      ref: useRef<SectionTitleElement>(null),
    },
    [PreferenceSections.downloads]: {
      text: t('Preference.Downloads'),
      Icon: CloudDownloadIcon,
      ref: useRef<SectionTitleElement>(null),
    },
    [PreferenceSections.network]: {
      text: t('Preference.Network'),
      Icon: RouterIcon,
      ref: useRef<SectionTitleElement>(null),
    },
    [PreferenceSections.privacy]: {
      text: t('Preference.PrivacyAndSecurity'),
      Icon: SecurityIcon,
      ref: useRef<SectionTitleElement>(null),
    },
    [PreferenceSections.performance]: {
      text: t('Preference.Performance'),
      Icon: PowerIcon,
      ref: useRef<SectionTitleElement>(null),
    },
    [PreferenceSections.updates]: {
      text: t('Preference.Updates'),
      Icon: SystemUpdateAltIcon,
      ref: useRef<SectionTitleElement>(null),
    },
    [PreferenceSections.friendLinks]: {
      text: t('Preference.FriendLinks'),
      Icon: StorefrontIcon,
      ref: useRef<SectionTitleElement>(null),
    },
    [PreferenceSections.misc]: {
      text: t('Preference.Miscellaneous'),
      Icon: MoreHorizIcon,
      ref: useRef<SectionTitleElement>(null),
    },
  };

  return sections;
}

export interface ISectionProps<SectionTitleElement = HTMLSpanElement> {
  requestRestartCountDown?: () => void;
  sections: ISectionRecord<SectionTitleElement>;
}
