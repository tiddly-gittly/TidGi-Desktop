import { Box } from '@mui/material';
import { styled } from '@mui/material/styles';
import { WindowNames } from '@services/windows/WindowProperties';
import { useEffect, useRef } from 'react';
import { TabListDropdown } from '../components/TabBar/TabListDropdown';
import { TEMP_TAB_ID_PREFIX } from '../constants/tab';
import { useTabStore } from '../store/tabStore';
import { TabItem, TabState, TabType } from '../types/tab';

import { TabContentView } from './TabContentView';
import { NewTabContent } from './TabTypes/NewTabContent';

const ContentContainer = styled(Box)`
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  overflow: hidden;
  background-color: ${props => props.theme.palette.background.paper};
`;

const FallbackHeader = styled(Box)`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid ${props => props.theme.palette.divider};
`;

function getWikiEmbedWorkspaceIds(tab: TabItem): string[] {
  if (tab.type === TabType.WIKI_EMBED) {
    return [tab.workspaceId];
  }
  if (tab.type === TabType.SPLIT_VIEW) {
    return tab.childTabs.flatMap(getWikiEmbedWorkspaceIds);
  }
  return [];
}

export const TabContentArea: React.FC = () => {
  const { tabs, activeTabId } = useTabStore();
  const previousActiveTabIdReference = useRef<string | null>(null);
  const tabsReference = useRef(tabs);
  tabsReference.current = tabs;

  useEffect(() => {
    const previousId = previousActiveTabIdReference.current;
    previousActiveTabIdReference.current = activeTabId;

    if (previousId === null || previousId === activeTabId) return;

    const previousTab = tabsReference.current.find(tab => tab.id === previousId);
    if (previousTab === undefined) return;

    for (const workspaceId of getWikiEmbedWorkspaceIds(previousTab)) {
      void window.service.view.setViewBounds(workspaceId, WindowNames.main, undefined).catch((error: unknown) => {
        void window.service.native.log('warn', 'TabContentArea: failed to clear wiki embed bounds on tab switch', {
          workspaceId,
          error: String(error),
        });
      });
    }
  }, [activeTabId]);

  // Get the current active tab
  const activeTab = activeTabId ? tabs.find(tab => tab.id === activeTabId) : null;

  // Render tab content
  if (activeTab) {
    return (
      <ContentContainer>
        <TabContentView tab={activeTab} />
      </ContentContainer>
    );
  }

  // Render new tab page when no active tab
  return (
    <ContentContainer>
      <FallbackHeader>
        <TabListDropdown />
      </FallbackHeader>
      <NewTabContent
        tab={{
          id: `${TEMP_TAB_ID_PREFIX}new-tab`,
          type: TabType.NEW_TAB,
          title: '',
          state: TabState.INACTIVE,
          isPinned: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }}
      />
    </ContentContainer>
  );
};
