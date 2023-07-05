import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { SvgIconTypeMap } from '@material-ui/core';
import { OverridableComponent } from '@material-ui/core/OverridableComponent';
import BuildIcon from '@material-ui/icons/Build';
import CloudDownloadIcon from '@material-ui/icons/CloudDownload';
import CodeIcon from '@material-ui/icons/Code';
import GitHubIcon from '@material-ui/icons/GitHub';
import LanguageIcon from '@material-ui/icons/Language';
import LanguageModelIcon from '@material-ui/icons/Psychology';
import MenuBookIcon from '@material-ui/icons/MenuBook';
import MoreHorizIcon from '@material-ui/icons/MoreHoriz';
import NotificationsIcon from '@material-ui/icons/Notifications';
import PowerIcon from '@material-ui/icons/Power';
import RouterIcon from '@material-ui/icons/Router';
import SecurityIcon from '@material-ui/icons/Security';
import StorefrontIcon from '@material-ui/icons/Storefront';
import SystemUpdateAltIcon from '@material-ui/icons/SystemUpdateAlt';
import WidgetsIcon from '@material-ui/icons/Widgets';

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
