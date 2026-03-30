import { Helmet } from '@dr.pogodin/react-helmet';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useInfoSnackbar } from '@/components/InfoSnackbar';
import { useRestartSnackbar } from '@/components/RestartSnackbar';
import { allSections } from '@services/preferences/definitions/registry';
import { usePreferenceObservable } from '@services/preferences/hooks';

import { PreferenceSections } from '@services/preferences/interface';
import { IPossibleWindowMeta, WindowMeta, WindowNames } from '@services/windows/WindowProperties';
import React from 'react';
import { PageInner as Inner, PageRoot as Root } from './PreferenceComponents';
import { registerCustomSections } from './registerCustomSections';
import { AllSectionsRenderer } from './SchemaRenderer';
import { SearchBar } from './SearchBar';
import { PreferenceSearchResultsView } from './SearchResultsView';
import { SectionSideBar } from './SectionsSideBar';
import type { ISectionRecord } from './useSections';

// Register custom section components on module load
registerCustomSections();

/** Build ISectionRecord from allSections for sidebar + scroll nav */
function useSectionRecord(): { record: ISectionRecord; refs: Map<string, React.RefObject<HTMLSpanElement | null>> } {
  const { t } = useTranslation(['translation', 'agent']);
  const references = useMemo(() => {
    const map = new Map<string, React.RefObject<HTMLSpanElement | null>>();
    for (const section of allSections) {
      map.set(section.id, React.createRef<HTMLSpanElement>());
    }
    return map;
  }, []);

  const record = useMemo(() => {
    const result: Record<string, ISectionRecord[PreferenceSections]> = {};
    for (const section of allSections) {
      result[section.id] = {
        text: t(section.titleKey, section.ns ? { ns: section.ns } : undefined),
        Icon: section.Icon,
        hidden: section.hidden,
        ref: references.get(section.id) ?? React.createRef<HTMLSpanElement>(),
      };
    }
    return result as ISectionRecord;
  }, [t, references]);

  return { record, refs: references };
}

export default function Preferences(): React.JSX.Element {
  const { t } = useTranslation();
  const { record: sections, refs: sectionReferences } = useSectionRecord();
  const [requestRestartCountDown, RestartSnackbar] = useRestartSnackbar();
  const [_showInfoSnackbar, InfoSnackbarComponent] = useInfoSnackbar();
  const [searchQuery, setSearchQuery] = useState('');
  const preferences = usePreferenceObservable();

  // handle open preference from other window, and goto some tab
  useEffect(() => {
    if (searchQuery) return;
    const scrollTo = (window.meta() as IPossibleWindowMeta<WindowMeta[WindowNames.preferences]>).preferenceGotoTab;
    if (scrollTo === undefined) return;
    setTimeout(() => {
      sections[scrollTo].ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, [sections, searchQuery]);

  const isSearching = searchQuery.trim().length > 0;

  return (
    <Root>
      {RestartSnackbar}
      {InfoSnackbarComponent}

      <Helmet>
        <title>{t('ContextMenu.Preferences')}</title>
      </Helmet>

      {!isSearching && <SectionSideBar sections={sections} />}
      <Inner>
        <SearchBar value={searchQuery} onChange={setSearchQuery} />

        {isSearching
          ? (
            preferences !== undefined && (
              <PreferenceSearchResultsView
                query={searchQuery}
                preferences={preferences}
                onNeedsRestart={requestRestartCountDown}
              />
            )
          )
          : (
            <AllSectionsRenderer
              onNeedsRestart={requestRestartCountDown}
              sectionRefs={sectionReferences}
            />
          )}
      </Inner>
    </Root>
  );
}
