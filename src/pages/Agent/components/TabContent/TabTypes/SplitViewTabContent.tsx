import { Box } from '@mui/material';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { useTabStore } from '../../../store/tabStore';
import { ISplitViewTab } from '../../../types/tab';
import { TabContentView } from '../TabContentView';

// Props for split view tab content
interface SplitViewTabContentProps {
  tab: ISplitViewTab;
}

// Container for split view
const Container = styled(Box)`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  position: relative;
  overflow: hidden;
  background-color: ${props => props.theme.palette.background.paper};
`;

// Grid container for split view
const SplitViewContainer = styled(Box)<{ $splitRatio: number }>`
  display: grid;
  width: 100%;
  height: 100%;
  grid-template-columns: ${props => props.$splitRatio}fr ${props => 100 - props.$splitRatio}fr;
  position: relative;
`;

// Individual pane in split view
const SplitViewPane = styled(Box)`
  height: 100%;
  overflow: hidden;
  padding: 4px;
`;

// Divider component between split panes
const Divider = styled(Box)<{ $left: number }>`
  position: absolute;
  top: 0;
  bottom: 0;
  width: 6px;
  background-color: ${props => props.theme.palette.divider};
  cursor: col-resize;
  z-index: 10;
  left: calc(${props => props.$left}% - 3px);
  &.dragging {
    background-color: ${props => props.theme.palette.primary.main};
  }
`;

/**
 * Split View Tab Content Component
 * Displays multiple tabs side by side in a split view
 */
export const SplitViewTabContent: React.FC<SplitViewTabContentProps> = ({ tab }) => {
  const { updateSplitRatio } = useTabStore();
  const [isDragging, setIsDragging] = useState(false);
  const dividerReference = useRef<HTMLDivElement>(null);
  const containerReference = useRef<HTMLDivElement>(null);

  // Get the tabs to be displayed in split view
  const childTabs = tab.childTabs;
  const splitRatio = tab.splitRatio;

  // Handle divider drag
  useEffect(() => {
    const dividerElement = dividerReference.current;
    const containerElement = containerReference.current;
    if (!dividerElement || !containerElement) return;

    let startX = 0;
    let startRatio = splitRatio;

    const handleMouseDown = (event: MouseEvent) => {
      startX = event.clientX;
      startRatio = splitRatio;
      setIsDragging(true);
      document.body.style.cursor = 'col-resize';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!isDragging) return;
      const containerWidth = containerElement.offsetWidth;
      const deltaX = event.clientX - startX;
      const deltaRatio = (deltaX / containerWidth) * 100;
      const newRatio = Math.max(20, Math.min(80, startRatio + deltaRatio));

      // Use the updateSplitRatio function which now handles UI and debounced database updates
      void updateSplitRatio(newRatio);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    dividerElement.addEventListener('mousedown', handleMouseDown);

    return () => {
      dividerElement.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isDragging, splitRatio, updateSplitRatio]);

  const { t } = useTranslation('agent');

  // When there are no child tabs, this component shouldn't render at all
  // The parent component should detect this and close the split view tab
  // This is a fallback in case the tab somehow persists with no children
  if (childTabs.length === 0) {
    return (
      <Container>
        <Box p={2}>{t('SplitView.NoTabs')}</Box>
      </Container>
    );
  }

  return (
    <Container>
      <SplitViewContainer ref={containerReference} $splitRatio={splitRatio}>
        {childTabs[0] && (
          <SplitViewPane>
            <TabContentView key={childTabs[0].id} tab={childTabs[0]} isSplitView={true} />
          </SplitViewPane>
        )}

        {childTabs.length > 1 && childTabs[1] && (
          <SplitViewPane>
            <TabContentView key={childTabs[1].id} tab={childTabs[1]} isSplitView={true} />
          </SplitViewPane>
        )}

        {childTabs.length > 1 && (
          <Divider
            ref={dividerReference}
            className={isDragging ? 'dragging' : ''}
            $left={splitRatio}
          />
        )}
      </SplitViewContainer>
    </Container>
  );
};
