import { Helmet } from '@dr.pogodin/react-helmet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useInfoSnackbar } from '@/components/InfoSnackbar';
import { useRestartSnackbar } from '@/components/RestartSnackbar';
import { evaluateHidden } from '@services/preferences/definitions/conditions';
import { allSections } from '@services/preferences/definitions/registry';
import { usePreferenceObservable } from '@services/preferences/hooks';

import { usePromiseValue } from '@/helpers/useServiceValue';
import { WindowNames } from '@services/windows/WindowProperties';
import React from 'react';
import { PageInner as Inner, PageRoot as Root } from './PreferenceComponents';
import { registerCustomSections } from './registerCustomSections';
import { AllSectionsRenderer } from './SchemaRenderer';
import { SearchBar } from './SearchBar';
import { SectionSideBar } from './SectionsSideBar';
import { useSectionNavigation } from './useSectionNavigation';
import type { ISectionRecord } from './useSections';

// Register custom section components on module load
registerCustomSections();

/** Build ISectionRecord from allSections for sidebar navigation */
function useSectionRecord(): ISectionRecord {
  const { t } = useTranslation(['translation', 'agent']);
  const preference = usePreferenceObservable();
  const platform = usePromiseValue(async () => await window.service.context.get('platform'));
  return useMemo(() => {
    const result: ISectionRecord = {};
    for (const section of allSections) {
      result[section.id] = {
        text: t(section.titleKey, section.ns ? { ns: section.ns } : undefined),
        Icon: section.Icon,
        hidden: evaluateHidden(section.hidden, { preference, platform }),
      };
    }
    return result;
  }, [t, preference, platform]);
}

export default function Preferences(): React.JSX.Element {
  const { t } = useTranslation();
  const sections = useSectionRecord();
  const [requestRestartCountDown, RestartSnackbar] = useRestartSnackbar();
  const [_showInfoSnackbar, InfoSnackbarComponent] = useInfoSnackbar();
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputReference = useRef<HTMLInputElement>(null);
  const { completeNavigation, navigateToSection, navigationRequest } = useSectionNavigation(WindowNames.preferences);

  const handleSearchClick = () => {
    searchInputReference.current?.focus();
  };

  useEffect(() => {
    if (navigationRequest) setSearchQuery('');
  }, [navigationRequest]);

  const isSearching = searchQuery.trim().length > 0;

  return (
    <Root>
      {RestartSnackbar}
      {InfoSnackbarComponent}

      <Helmet>
        <title>{t('ContextMenu.Preferences')}</title>
      </Helmet>

      {!isSearching && (
        <SectionSideBar
          sections={sections}
          onSearchClick={handleSearchClick}
          onSectionClick={navigateToSection}
        />
      )}
      <Inner>
        <SearchBar value={searchQuery} onChange={setSearchQuery} inputRef={searchInputReference} />

        <AllSectionsRenderer
          query={searchQuery}
          onNeedsRestart={requestRestartCountDown}
          navigationRequest={navigationRequest}
          onNavigationComplete={completeNavigation}
        />
      </Inner>
    </Root>
  );
}
