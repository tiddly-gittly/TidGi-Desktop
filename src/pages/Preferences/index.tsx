import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useTranslation } from 'react-i18next';
import { styled } from 'styled-components';

import { useRestartSnackbar } from '@/components/RestartSnackbar';

import { IPossibleWindowMeta, WindowMeta, WindowNames } from '@services/windows/WindowProperties';
import { DeveloperTools } from './sections/DeveloperTools';
import { Downloads } from './sections/Downloads';
import { FriendLinks } from './sections/FriendLinks';
import { General } from './sections/General';
import { Languages } from './sections/Languages';
import { Miscellaneous } from './sections/Miscellaneous';
import { Network } from './sections/Network';
import { Notifications } from './sections/Notifications';
import { Performance } from './sections/Performance';
import { PrivacyAndSecurity } from './sections/PrivacyAndSecurity';
import { Sync } from './sections/Sync';
import { System } from './sections/System';
import { TiddlyWiki } from './sections/TiddlyWiki';
import { Updates } from './sections/Updates';
import { SectionSideBar } from './SectionsSideBar';
import { usePreferenceSections } from './useSections';
import { ExternalAPI } from './sections/ExternalAPI';

const Root = styled.div`
  padding: 20px;
`;

const Inner = styled.div`
  width: 100%;
  max-width: 550px;
  float: right;
`;

export default function Preferences(): React.JSX.Element {
  const { t } = useTranslation();
  const sections = usePreferenceSections();
  const [requestRestartCountDown, RestartSnackbar] = useRestartSnackbar();

  // handle open preference from other window, and goto some tab
  useEffect(() => {
    const scrollTo = (window.meta() as IPossibleWindowMeta<WindowMeta[WindowNames.preferences]>).preferenceGotoTab;
    if (scrollTo === undefined) return;
    setTimeout(() => {
      // wait 100ms so page anchors are all loaded. Otherwise scroll will stop halfway.
      sections[scrollTo].ref?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, [sections]);

  return (
    <Root>
      <div id='test' data-usage='For spectron automating testing' />
      {RestartSnackbar}

      <Helmet>
        <title>{t('ContextMenu.Preferences')}</title>
      </Helmet>

      <SectionSideBar sections={sections} />
      <Inner>
        <TiddlyWiki sections={sections} requestRestartCountDown={requestRestartCountDown} />
        <General sections={sections} requestRestartCountDown={requestRestartCountDown} />
        <Sync sections={sections} requestRestartCountDown={requestRestartCountDown} />
        <ExternalAPI sections={sections} />
        <Notifications sections={sections} requestRestartCountDown={requestRestartCountDown} />
        <System sections={sections} />
        <Languages sections={sections} requestRestartCountDown={requestRestartCountDown} />
        <DeveloperTools sections={sections} />
        <Downloads sections={sections} requestRestartCountDown={requestRestartCountDown} />
        <Network sections={sections} />
        <PrivacyAndSecurity sections={sections} requestRestartCountDown={requestRestartCountDown} />
        <Performance sections={sections} requestRestartCountDown={requestRestartCountDown} />
        <Updates sections={sections} requestRestartCountDown={requestRestartCountDown} />
        <FriendLinks sections={sections} />
        <Miscellaneous sections={sections} />
      </Inner>
    </Root>
  );
}
