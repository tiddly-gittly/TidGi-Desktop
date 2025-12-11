import { Box, styled } from '@mui/material';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { ModelMessage } from 'ai';
import React, { memo, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import { useAgentChatStore } from '../../../Agent/store/agentChatStore/index';
import { FlatPromptList } from '../FlatPromptList';
import { LastUpdatedIndicator } from '../LastUpdatedIndicator';
import { PromptTree } from '../PromptTree';
import { getFormattedContent } from '../types';

// Styled components
const PreviewTabs = styled(Tabs)`
  margin-bottom: ${({ theme }) => theme.spacing(2)};
  border-bottom: 1px solid ${({ theme }) => theme.palette.divider};
`;

const PreviewContent = styled('div', {
  shouldForwardProp: (property: string) => property !== 'isFullScreen',
})<{ isFullScreen?: boolean }>`
  background: ${({ theme }) => theme.palette.background.paper};
  border-radius: ${({ isFullScreen, theme }) => isFullScreen ? 0 : theme.shape.borderRadius};
  padding: ${({ isFullScreen, theme }) => isFullScreen ? theme.spacing(1) : theme.spacing(2)};
  min-height: 240px;
  max-height: ${({ isFullScreen }) => isFullScreen ? 'calc(100vh - 120px)' : '60vh'};
  height: ${({ isFullScreen }) => isFullScreen ? 'calc(100vh - 120px)' : 'auto'};
  overflow: auto;
  font-family: 'Fira Code', 'JetBrains Mono', 'Fira Mono', 'Menlo', 'Consolas', monospace;
  font-size: 14px;
  line-height: 1.7;
  box-shadow: none;
`;

interface PreviewTabsViewProps {
  isFullScreen: boolean;
}

/**
 * Memoized tree content to prevent re-renders when data hasn't changed
 */
const TreeContent = memo<{ isFullScreen: boolean }>(({ isFullScreen }) => {
  const processedPrompts = useAgentChatStore((state) => state.previewResult?.processedPrompts);
  const lastUpdated = useAgentChatStore((state) => state.lastUpdated);

  return (
    <PreviewContent isFullScreen={isFullScreen}>
      <PromptTree prompts={processedPrompts} />
      <LastUpdatedIndicator lastUpdated={lastUpdated} />
    </PreviewContent>
  );
});
TreeContent.displayName = 'TreeContent';

/**
 * Memoized flat content to prevent re-renders when data hasn't changed
 */
const FlatContent = memo<{ isFullScreen: boolean }>(({ isFullScreen }) => {
  const flatPrompts = useAgentChatStore((state) => state.previewResult?.flatPrompts);
  const lastUpdated = useAgentChatStore((state) => state.lastUpdated);

  // Memoize formatted preview to prevent unnecessary recalculations
  const formattedFlatPrompts = useMemo(() => {
    return flatPrompts?.map((message: ModelMessage) => ({
      role: message.role as string,
      content: getFormattedContent(message.content),
    }));
  }, [flatPrompts]);

  return (
    <PreviewContent isFullScreen={isFullScreen}>
      <FlatPromptList flatPrompts={formattedFlatPrompts} />
      <LastUpdatedIndicator lastUpdated={lastUpdated} />
    </PreviewContent>
  );
});
FlatContent.displayName = 'FlatContent';

/**
 * Preview tabs component with flat and tree views
 * Uses memoized sub-components to prevent unnecessary re-renders
 */
export const PreviewTabsView: React.FC<PreviewTabsViewProps> = memo(({
  isFullScreen,
}) => {
  const { t } = useTranslation('agent');

  const {
    previewDialogTab: tab,
    setPreviewDialogTab,
  } = useAgentChatStore(
    useShallow((state) => ({
      previewDialogTab: state.previewDialogTab,
      setPreviewDialogTab: state.setPreviewDialogTab,
    })),
  );

  // Use ref to track if we've ever had content (to avoid flashing on initial load)
  const hasHadContentRef = useRef(false);
  const previewResult = useAgentChatStore((state) => state.previewResult);
  if (previewResult) {
    hasHadContentRef.current = true;
  }

  const handleTabChange = useCallback((_event: React.SyntheticEvent, value: string): void => {
    if (value === 'flat' || value === 'tree') {
      setPreviewDialogTab(value);
    } else {
      setPreviewDialogTab('flat');
    }
  }, [setPreviewDialogTab]);

  // Show nothing if we've never had content (initial loading state)
  // But once we have content, always show it (even during updates)
  if (!hasHadContentRef.current && !previewResult) {
    return null;
  }

  return (
    <Box
      sx={{
        height: isFullScreen ? '100%' : 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <PreviewTabs
          value={tab}
          onChange={handleTabChange}
          aria-label='prompt preview tabs'
          variant='fullWidth'
          sx={{ flex: 1 }}
        >
          <Tab
            label={t('Prompt.Tree')}
            value={'tree'}
            sx={{ textTransform: 'none' }}
          />
          <Tab
            label={t('Prompt.Flat')}
            value={'flat'}
            sx={{ textTransform: 'none' }}
          />
        </PreviewTabs>
      </Box>

      {tab === 'tree' && <TreeContent isFullScreen={isFullScreen} />}
      {tab === 'flat' && <FlatContent isFullScreen={isFullScreen} />}
    </Box>
  );
});
