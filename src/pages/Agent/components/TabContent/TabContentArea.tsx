import { Box } from '@mui/material';
import styled from 'styled-components';
import { TEMP_TAB_ID_PREFIX } from '../../constants/tab';
import { useTabStore } from '../../store/tabStore';
import { TabState, TabType } from '../../types/tab';

import { TabContentView } from './TabContentView';
import { NewTabContent } from './TabTypes/NewTabContent';

const ContentContainer = styled(Box)`
  flex: 1;
  display: flex;
  height: 100%;
  position: relative;
  overflow: hidden;
  background-color: ${props => props.theme.palette.background.paper};
`;

export const TabContentArea: React.FC = () => {
  const { tabs, activeTabId } = useTabStore();

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
