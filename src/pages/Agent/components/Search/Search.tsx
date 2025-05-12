import '@algolia/autocomplete-theme-classic';
import { autocomplete } from '@algolia/autocomplete-js';
import { Box } from '@mui/material';
import React, { createElement, Fragment, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { useTabStore } from '../../store/tabStore';
import { createAgentsPlugin } from './plugins/AgentsPlugin';
import { createClosedTabsPlugin } from './plugins/ClosedTabsPlugin';
import { createOpenTabsPlugin } from './plugins/OpenTabsPlugin';
import { autocompleteStyles } from './styles';

interface SearchProps {
  /** Custom placeholder text for search input */
  placeholder?: string;
}

const SearchContainer = styled(Box)`
  max-width: 600px;
  width: 100%;
  ${autocompleteStyles}
`;

export function Search({ placeholder }: SearchProps) {
  const containerReference = useRef<HTMLDivElement | null>(null);
  const panelRootReference = useRef<ReturnType<typeof createRoot> | null>(null);
  const { addTab } = useTabStore();
  const { t } = useTranslation('agent');
  const searchPlaceholder = placeholder || t('SideBar.SearchPlaceholder');

  useEffect(() => {
    if (!containerReference.current) {
      return undefined;
    }

    const search = autocomplete({
      container: containerReference.current,
      renderer: { createElement, Fragment },
      render({ children }, root) {
        if (!panelRootReference.current) {
          panelRootReference.current = createRoot(root);
        }
        panelRootReference.current.render(children);
      },
      placeholder: searchPlaceholder,
      openOnFocus: true,
      plugins: [
        createOpenTabsPlugin(),
        createClosedTabsPlugin(),
        createAgentsPlugin(),
      ],
    });

    return () => {
      search.destroy();
    };
  }, [addTab, searchPlaceholder]);

  return <SearchContainer ref={containerReference} />;
}
