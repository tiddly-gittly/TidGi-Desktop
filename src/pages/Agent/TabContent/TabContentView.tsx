import CloseIcon from '@mui/icons-material/Close';
import { Box, IconButton, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import React from 'react';

import { ChatTabContent } from '../../ChatTabContent';
import { TabListDropdown } from '../components/TabBar/TabListDropdown';
import { useTabStore } from '../store/tabStore';
import { TabItem, TabType } from '../types/tab';
import { CreateNewAgentContent } from './TabTypes/CreateNewAgentContent';
import { EditAgentDefinitionContent } from './TabTypes/EditAgentDefinitionContent';
import { NewTabContent } from './TabTypes/NewTabContent';
import { SplitViewTabContent } from './TabTypes/SplitViewTabContent';
import { WebTabContent } from './TabTypes/WebTabContent';
import { WikiEmbedTabContent } from './TabTypes/WikiEmbedTabContent';

/** Props interface for tab content view component */
interface TabContentViewProps {
  /** Tab data */
  tab: TabItem;
  /** Whether to display in split view mode */
  isSplitView?: boolean;
}

/** Content container styled component */
const ContentContainer = styled(Box)<{ $splitview?: boolean }>`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  position: relative;
  overflow: hidden;
  border-radius: ${props => props.$splitview ? '8px' : '0'};
  box-shadow: ${props => props.$splitview ? '0 0 10px rgba(0,0,0,0.1)' : 'none'};
`;

/** Header bar for split view mode */
const SplitViewHeader = styled(Box)`
  display: flex;
  justify-content: flex-end;
  padding: 4px;
  background-color: ${props => props.theme.palette.background.paper};
  border-bottom: 1px solid ${props => props.theme.palette.divider};
`;

/** Minimal header with TabListDropdown for non-chat tab types */
const GenericTabHeader = styled(Box)`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid ${props => props.theme.palette.divider};
  background-color: ${props => props.theme.palette.background.paper};
`;

/**
 * Tab Content View Component
 * Renders different content components based on tab type and handles split view mode
 */
export const TabContentView: React.FC<TabContentViewProps> = ({ tab, isSplitView }) => {
  const { removeFromSplitView } = useTabStore();

  /** Render appropriate content component based on tab type */
  const renderContent = () => {
    switch (tab.type) {
      case TabType.WEB:
        return <WebTabContent tab={tab} />;
      case TabType.CHAT:
        return <ChatTabContent tab={tab} isSplitView={isSplitView} />;
      case TabType.NEW_TAB:
        return <NewTabContent tab={tab} />;
      case TabType.SPLIT_VIEW:
        return <SplitViewTabContent tab={tab} />;
      case TabType.CREATE_NEW_AGENT:
        return <CreateNewAgentContent tab={tab} />;
      case TabType.EDIT_AGENT_DEFINITION:
        return <EditAgentDefinitionContent tab={tab} />;
      case TabType.WIKI_EMBED:
        return <WikiEmbedTabContent tab={tab} isSplitView={isSplitView} />;
      default:
        return null;
    }
  };

  /** Handle removing tab from split view mode */
  const handleRemoveFromSplitView = async () => {
    await removeFromSplitView(tab.id);
  };

  return (
    <ContentContainer $splitview={isSplitView}>
      {isSplitView && (
        <SplitViewHeader>
          <IconButton size='small' onClick={handleRemoveFromSplitView}>
            <CloseIcon fontSize='small' />
          </IconButton>
        </SplitViewHeader>
      )}
      {/* Non-chat tabs get a minimal header with tab list; Chat tabs have their own ChatHeader */}
      {tab.type !== TabType.CHAT && !isSplitView && (
        <GenericTabHeader>
          <TabListDropdown />
          <Typography variant='body2' noWrap sx={{ flex: 1, fontWeight: 500 }}>
            {tab.title}
          </Typography>
        </GenericTabHeader>
      )}
      {renderContent()}
    </ContentContainer>
  );
};
