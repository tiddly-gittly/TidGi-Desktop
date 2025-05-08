import React from 'react';
import styled from 'styled-components';
import { Box, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

import { TabItem, TabType } from '../../types/tab';
import { useTabStore } from '../../store/tabStore';
import { WebTabContent } from './TabTypes/WebTabContent';
import { ChatTabContent } from './TabTypes/ChatTabContent';
import { NewTabContent } from './TabTypes/NewTabContent';

interface TabContentViewProps {
  tab: TabItem;
  isSplitView?: boolean;
}

const ContentContainer = styled(Box)<{ $isSplitView?: boolean }>`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  position: relative;
  overflow: hidden;
  border-radius: ${props => props.$isSplitView ? '8px' : '0'};
  box-shadow: ${props => props.$isSplitView ? '0 0 10px rgba(0,0,0,0.1)' : 'none'};
`;

const SplitViewHeader = styled(Box)`
  display: flex;
  justify-content: flex-end;
  padding: 4px;
  background-color: ${props => props.theme.palette.background.paper};
  border-bottom: 1px solid ${props => props.theme.palette.divider};
`;

export const TabContentView: React.FC<TabContentViewProps> = ({ tab, isSplitView }) => {
  const { removeFromSplitView } = useTabStore();
  
  // 根据标签页类型渲染不同的内容组件
  const renderContent = () => {
    switch (tab.type) {
      case TabType.WEB:
        return <WebTabContent tab={tab} />;
      case TabType.CHAT:
        return <ChatTabContent tab={tab} />;
      case TabType.NEW_TAB:
        return <NewTabContent tab={tab} />;
      default:
        return null;
    }
  };

  // 处理从并排视图中移除
  const handleRemoveFromSplitView = () => {
    removeFromSplitView(tab.id);
  };

  return (
    <ContentContainer $isSplitView={isSplitView}>
      {isSplitView && (
        <SplitViewHeader>
          <IconButton size="small" onClick={handleRemoveFromSplitView}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </SplitViewHeader>
      )}
      {renderContent()}
    </ContentContainer>
  );
};