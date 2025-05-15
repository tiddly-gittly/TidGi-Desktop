import { Box } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
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

const SplitViewContainer = styled(Box)<{ $splitRatio: number }>`
  display: grid;
  width: 100%;
  height: 100%;
  grid-template-columns: ${props => props.$splitRatio}fr ${props => 100 - props.$splitRatio}fr;
  position: relative;
`;

const SplitViewPane = styled(Box)`
  height: 100%;
  overflow: hidden;
  padding: 4px;
`;

const Divider = styled(Box)<{ $left: number }>`
  position: absolute;
  top: 0;
  bottom: 0;
  width: 6px;
  background-color: ${props => props.theme.palette.divider};
  cursor: col-resize;
  z-index: 10;
  left: calc(${props => props.$left}% - 3px);
  
  &:hover, &.dragging {
    background-color: ${props => props.theme.palette.primary.main};
    opacity: 0.7;
  }
  
  &::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 20px;
    height: 40px;
    border-radius: 4px;
    background-color: transparent;
  }
`;

export const TabContentArea: React.FC = () => {
  const { tabs, activeTabId, splitViewIds, updateSplitRatio, splitRatio } = useTabStore();
  const dividerReference = useRef<HTMLDivElement>(null);
  const containerReference = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Get the current active tab
  const activeTab = activeTabId ? tabs.find(tab => tab.id === activeTabId) : null;

  // Get the tabs to be displayed in split view
  const splitTabs = splitViewIds.map(id => tabs.find(tab => tab.id === id)).filter(Boolean);

  // Handle divider drag
  useEffect(() => {
    const dividerElement = dividerReference.current;
    const containerElement = containerReference.current;
    if (!dividerElement || !containerElement) return;

    let startX = 0;
    let startRatio = splitRatio;

    const handleMouseDown = (event: MouseEvent) => {
      event.preventDefault();
      startX = event.clientX;
      startRatio = splitRatio;
      setIsDragging(true);
      document.body.style.cursor = 'col-resize';

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (isDragging && containerElement) {
          const containerWidth = containerElement.offsetWidth;
          const deltaX = moveEvent.clientX - startX;
          const deltaRatio = (deltaX / containerWidth) * 100;
          const newRatio = Math.max(20, Math.min(80, startRatio + deltaRatio));

          updateSplitRatio(newRatio);
        }
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    };

    dividerElement.addEventListener('mousedown', handleMouseDown);

    return () => {
      dividerElement.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isDragging, splitRatio, updateSplitRatio]);

  // if there are split tabs, render them in split view
  if (splitTabs.length > 0) {
    return (
      <ContentContainer>
        <SplitViewContainer ref={containerReference} $splitRatio={splitRatio}>
          {splitTabs[0] && (
            <SplitViewPane>
              <TabContentView key={splitTabs[0].id} tab={splitTabs[0]} isSplitView={true} />
            </SplitViewPane>
          )}

          {splitTabs.length > 1 && splitTabs[1] && (
            <SplitViewPane>
              <TabContentView key={splitTabs[1].id} tab={splitTabs[1]} isSplitView={true} />
            </SplitViewPane>
          )}

          {splitTabs.length > 1 && (
            <Divider
              ref={dividerReference}
              className={isDragging ? 'dragging' : ''}
              $left={splitRatio}
            />
          )}
        </SplitViewContainer>
      </ContentContainer>
    );
  }

  // normal view - render the active tab or a new tab page with TEMP_TAB_ID_PREFIX as id when no active tab
  return (
    <ContentContainer>
      {activeTab ? <TabContentView tab={activeTab} /> : (
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
      )}
    </ContentContainer>
  );
};
