import '@algolia/autocomplete-theme-classic';
import { autocomplete } from '@algolia/autocomplete-js';
import { Box } from '@mui/material';
import { createElement, Fragment, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { styled } from '@mui/material/styles';

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

  useEffect(() => {
    if (!containerReference.current) {
      return undefined;
    }

    const search = autocomplete({
      container: containerReference.current,
      renderer: {
        createElement,
        Fragment,
        render(vnode, root) {
          if (!panelRootReference.current) {
            panelRootReference.current = createRoot(root);
          }
          panelRootReference.current.render(vnode);
        },
      },
      placeholder,
      openOnFocus: true,
      navigator: {
        navigate: ({ itemUrl }) => {
          console.log('Default navigation requested to:', itemUrl);
          // This should not be called as each plugin handles its own navigation
        },
      },
      plugins: [
        createOpenTabsPlugin(),
        createClosedTabsPlugin(),
        createAgentsPlugin(),
      ],
    });

    return () => {
      search.destroy();
    };
  }, [addTab, placeholder]);

  return <SearchContainer ref={containerReference} />;
}
