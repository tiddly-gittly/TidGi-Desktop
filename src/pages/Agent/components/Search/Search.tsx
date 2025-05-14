import '@algolia/autocomplete-theme-classic';
import { autocomplete } from '@algolia/autocomplete-js';
import { Box } from '@mui/material';
import type { AgentDefinition } from '@services/agentDefinition/interface';
import { nanoid } from 'nanoid';
import React, { createElement, Fragment, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { TEMP_TAB_ID_PREFIX } from '../../constants/tab';
import { useTabStore } from '../../store/tabStore';
import { IChatTab, TabState, TabType } from '../../types/tab';
import { createAgentsPlugin } from './plugins/AgentsPlugin';
import { createClosedTabsPlugin } from './plugins/ClosedTabsPlugin';
import { createOpenTabsPlugin } from './plugins/OpenTabsPlugin';
import { autocompleteStyles } from './styles';

interface SearchProps {
  /** Custom placeholder text for search input */
  placeholder?: string;
}

type TabSource = {
  id: string;
  title: string;
  type: TabType;
  favicon?: string;
};

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
      navigator: {
        navigate: async ({ item, state }) => {
          try {
            const tabStore = useTabStore.getState();
            const { activeTabId, tabs } = tabStore;

            // Handle current active tab
            if (activeTabId) {
              const activeTab = tabs.find(tab => tab.id === activeTabId);
              // Always close temp tabs or NEW_TAB type tabs when selecting from search
              if (activeTab && (activeTab.id.startsWith(TEMP_TAB_ID_PREFIX) || activeTab.type === TabType.NEW_TAB)) {
                await window.service.agentBrowser.closeTab(activeTabId);
              }
            }

            // Try to get sourceId from context
            let sourceId: string | undefined;
            try {
              sourceId = state.context.sourceId as string;
            } catch {
              // Ignore if context doesn't have sourceId
            }

            // Determine action based on item type and sourceId
            if (sourceId === 'openTabsSource' || ('id' in item && 'type' in item && !('agentDefId' in item))) {
              // Activate existing tab
              await window.service.agentBrowser.setActiveTab((item as unknown as TabSource).id);
            } else if (sourceId === 'closedTabsSource') {
              // Restore recently closed tab
              await window.service.agentBrowser.restoreClosedTab();
            } else if (sourceId === 'agentsSource' || ('id' in item && 'name' in item && !('type' in item))) {
              // Create agent instance
              const agent = await window.service.agentInstance.createAgent((item as unknown as AgentDefinition).id);

              // Create new chat tab
              const chatTab: IChatTab = {
                id: nanoid(),
                type: TabType.CHAT,
                title: (item as unknown as AgentDefinition).name,
                state: TabState.ACTIVE,
                isPinned: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                agentId: agent.id,
                agentDefId: agent.agentDefId,
              };

              // Add the new tab
              await window.service.agentBrowser.addTab(chatTab);
            }

            // Refresh store state
            void tabStore.initialize();
          } catch (error) {
            console.error('Failed to navigate in search:', error);
          }
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
  }, [addTab, searchPlaceholder]);

  return <SearchContainer ref={containerReference} />;
}
