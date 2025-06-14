import '@algolia/autocomplete-theme-classic';
import { autocomplete } from '@algolia/autocomplete-js';
import { Box } from '@mui/material';
import { styled } from '@mui/material/styles';
import { createElement, Fragment, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

import { useTabStore } from '../../store/tabStore';
import { createAgentsPlugin } from './plugins/AgentsPlugin';
import { createClosedTabsPlugin } from './plugins/ClosedTabsPlugin';
import { createOpenTabsPlugin } from './plugins/OpenTabsPlugin';

interface SearchProps {
  /** Custom placeholder text for search input */
  placeholder?: string;
}

const SearchContainer = styled(Box)`
  max-width: 600px;
  width: 100%;
  .aa-Autocomplete {
    width: 100%;
  }

  .aa-Form {
    border-radius: 8px;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    background-color: ${({ theme }) => theme.palette.background.paper};
    border: 1px solid ${({ theme }) => theme.palette.divider};
  }

  .aa-InputWrapper {
    padding: 8px 16px;
  }

  .aa-Input {
    font-size: 16px;
    background: transparent;
    color: ${({ theme }) => theme.palette.text.primary};
    &::placeholder {
      color: ${({ theme }) => theme.palette.text.secondary};
    }
  }

  .aa-InputWrapperSuffix {
    display: flex;
    align-items: center;
  }

  .aa-ClearButton {
    padding: 0;
    margin-right: 8px;
  }
  
  .aa-Panel {
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    background-color: ${({ theme }) => theme.palette.background.paper};
    border: 1px solid ${({ theme }) => theme.palette.divider};
    overflow: hidden;
    margin-top: 8px;
  }

  .aa-List {
    padding: 8px 0;
  }

  .aa-SourceHeader {
    margin: 0;
    padding: 8px 16px;
    color: ${({ theme }) => theme.palette.text.secondary};
    font-weight: 600;
    font-size: 14px;
    border-bottom: 1px solid ${({ theme }) => theme.palette.divider};
  }

  .aa-ItemWrapper {
    padding: 8px 16px;
    cursor: pointer;
    
    &:hover, &[aria-selected="true"] {
      background-color: ${({ theme }) => theme.palette.action.hover};
    }
  }

  .aa-ItemContent {
    display: flex;
    align-items: center;
  }

  .aa-ItemIcon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    margin-right: 12px;
  }

  .aa-ItemContentBody {
    flex: 1;
    overflow: hidden;
  }

  .aa-ItemContentTitle {
    font-size: 14px;
    line-height: 20px;
    font-weight: 500;
    color: ${({ theme }) => theme.palette.text.primary};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .aa-ItemContentDescription {
    font-size: 13px;
    line-height: 18px;
    color: ${({ theme }) => theme.palette.text.secondary};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
  }

  mark {
    background-color: rgba(255, 226, 143, 0.4);
    color: inherit;
    font-weight: 500;
    padding: 0 1px;
  }
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
