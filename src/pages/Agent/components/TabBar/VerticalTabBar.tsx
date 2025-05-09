import { Box, Divider } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { useTabStore } from '../../store/tabStore';
import { TabType } from '../../types/tab';
import { TabContextMenu } from './TabContextMenu';
import { TabItem } from './TabItem';

const TabBarContainer = styled(Box)`
  display: flex;
  flex-direction: column;
  width: 200px;
  height: 100%;
  background-color: ${props => props.theme.palette.background.default};
  border-right: 1px solid ${props => props.theme.palette.divider};
  padding: 12px 8px;
  overflow-y: auto;
  overflow-x: hidden;
`;

const TabsSection = styled(Box)`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
`;

const NewTabButton = styled(Box)`
  margin-bottom: 8px;
`;

const StyledDivider = styled(Divider)`
  width: 100%;
  margin: 8px 0;
`;

export const VerticalTabBar = () => {
  const { t } = useTranslation('agent');
  const { tabs, activeTabId, setActiveTab } = useTabStore();

  // 将标签页分为固定和非固定两组
  const pinnedTabs = tabs.filter(tab => tab.isPinned);
  const unpinnedTabs = tabs.filter(tab => !tab.isPinned);

  // 保留非NEW_TAB类型的标签页，并按创建时间排序（新的在前）
  const sortedUnpinnedTabs = unpinnedTabs.sort((a, b) => b.createdAt - a.createdAt);

  return (
    <TabBarContainer>
      <TabContextMenu />

      {/* 固定的标签页 */}
      {pinnedTabs.length > 0 && (
        <>
          <TabsSection>
            {pinnedTabs.map(tab => (
              <TabItem
                key={tab.id}
                tab={tab}
                isActive={tab.id === activeTabId}
                onClick={() => {
                  setActiveTab(tab.id);
                }}
              />
            ))}
          </TabsSection>
          <StyledDivider />
        </>
      )}

      {/* 新标签页按钮 - 永远位于顶部 */}
      <NewTabButton>
        <TabItem
          tab={{ id: 'new-tab-button', title: 'agent.tabTitle.addNewTab', type: TabType.NEW_TAB } as any}
          isActive={false}
          onClick={() => {}}
          isNewTabButton={true}
        />
      </NewTabButton>
      {/* 非固定的标签页 - 按时间排序 */}
      <TabsSection>
        {sortedUnpinnedTabs.map(tab => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onClick={() => {
              setActiveTab(tab.id);
            }}
          />
        ))}
      </TabsSection>
    </TabBarContainer>
  );
};
