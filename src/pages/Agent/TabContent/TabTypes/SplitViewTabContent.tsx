import { Box } from '@mui/material';
import { styled } from '@mui/material/styles';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useTabStore } from '../../store/tabStore';
import { ISplitViewTab } from '../../types/tab';
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

// Full-screen overlay during drag to prevent webviews from blocking mouse events
const DragOverlay = styled(Box)`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9;
  cursor: col-resize;
  background: transparent;
`;

/**
 * Split View Tab Content Component
 * Displays multiple tabs side by side in a split view
 */
export const SplitViewTabContent: React.FC<SplitViewTabContentProps> = ({ tab }) => {
  const { updateSplitRatio } = useTabStore();
  const [isDragging, setIsDragging] = useState(false);
  const [temporarySplitRatio, setTemporarySplitRatio] = useState(tab.splitRatio);
  const dividerReference = useRef<HTMLDivElement>(null);
  const containerReference = useRef<HTMLDivElement>(null);
  const dragStateReference = useRef({ isDragging: false, startX: 0, startRatio: 0 });
  const temporarySplitRatioReference = useRef(temporarySplitRatio);

  // Get the tabs to be displayed in split view
  const childTabs = tab.childTabs;
  const splitRatio = tab.splitRatio;

  // Keep ref in sync with state
  React.useEffect(() => {
    temporarySplitRatioReference.current = temporarySplitRatio;
  }, [temporarySplitRatio]);

  // Sync temp ratio when tab changes
  React.useEffect(() => {
    setTemporarySplitRatio(splitRatio);
  }, [splitRatio]);

  // Handle divider drag
  useEffect(() => {
    const dividerElement = dividerReference.current;
    const containerElement = containerReference.current;
    if (!dividerElement || !containerElement) return;

    const handleMouseDown = (event: MouseEvent) => {
      event.preventDefault(); // Prevent text selection during drag
      dragStateReference.current.isDragging = true;
      dragStateReference.current.startX = event.clientX;
      dragStateReference.current.startRatio = temporarySplitRatioReference.current;
      setIsDragging(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none'; // Prevent text selection

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!dragStateReference.current.isDragging) return;
      event.preventDefault(); // Prevent text selection during drag

      const containerWidth = containerElement.offsetWidth;
      const deltaX = event.clientX - dragStateReference.current.startX;
      const deltaRatio = (deltaX / containerWidth) * 100;
      const newRatio = Math.max(20, Math.min(80, dragStateReference.current.startRatio + deltaRatio));

      // Only update local UI state during drag, don't trigger any store updates
      setTemporarySplitRatio(newRatio);
    };

    const handleMouseUp = () => {
      dragStateReference.current.isDragging = false;
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      // Save the final position to store after drag is complete
      void (async () => {
        await updateSplitRatio(temporarySplitRatioReference.current);
        // Re-align views after a short delay to ensure the UI has updated
        setTimeout(() => {
          void window.service.workspaceView.realignActiveWorkspace();
        }, 100);
      })();
    };

    dividerElement.addEventListener('mousedown', handleMouseDown);

    return () => {
      dividerElement.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      // Clean up styles
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [updateSplitRatio]); // 移除 tempSplitRatio 从依赖项

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
      <SplitViewContainer ref={containerReference} $splitRatio={temporarySplitRatio} data-testid='split-view-container'>
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
          <>
            <Divider
              ref={dividerReference}
              className={isDragging ? 'dragging' : ''}
              $left={temporarySplitRatio}
            />
            {isDragging && <DragOverlay />}
          </>
        )}
      </SplitViewContainer>
    </Container>
  );
};
