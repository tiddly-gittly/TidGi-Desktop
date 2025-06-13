import { Box, styled } from '@mui/material';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { CoreMessage } from 'ai';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import { useAgentChatStore } from '../../../Agent/store/agentChatStore/index';
import { FlatPromptList } from '../FlatPromptList';
import { LastUpdatedIndicator } from '../LastUpdatedIndicator';
import { PromptTree } from '../PromptTree';
import { getFormattedContent } from '../types';
import { LoadingView } from './LoadingView';

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
 * Preview tabs component with flat and tree views
 */
export const PreviewTabsView: React.FC<PreviewTabsViewProps> = ({
  isFullScreen,
}) => {
  const { t } = useTranslation('agent');

  const {
    previewDialogTab: tab,
    previewLoading,
    previewResult,
    lastUpdated,
    setPreviewDialogTab,
  } = useAgentChatStore(
    useShallow((state) => ({
      previewDialogTab: state.previewDialogTab,
      previewLoading: state.previewLoading,
      previewResult: state.previewResult,
      lastUpdated: state.lastUpdated,
      setPreviewDialogTab: state.setPreviewDialogTab,
    })),
  );

  // Memoize formatted preview to prevent unnecessary recalculations
  const formattedPreview = useMemo(() => {
    return previewResult
      ? {
        flatPrompts: previewResult.flatPrompts.map((message: CoreMessage) => ({
          role: String(message.role),
          content: getFormattedContent(message.content),
        })),
        processedPrompts: previewResult.processedPrompts,
      }
      : null;
  }, [previewResult]);

  const handleTabChange = useCallback((_event: React.SyntheticEvent, value: string): void => {
    if (value === 'flat' || value === 'tree') {
      setPreviewDialogTab(value);
    } else {
      setPreviewDialogTab('flat');
    }
  }, [setPreviewDialogTab]);

  if (previewLoading) {
    return <LoadingView />;
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

      {tab === 'tree' && (
        <PreviewContent isFullScreen={isFullScreen}>
          <PromptTree prompts={formattedPreview?.processedPrompts} />
          <LastUpdatedIndicator lastUpdated={lastUpdated} />
        </PreviewContent>
      )}
      {tab === 'flat' && (
        <PreviewContent isFullScreen={isFullScreen}>
          <FlatPromptList flatPrompts={formattedPreview?.flatPrompts} />
          <LastUpdatedIndicator lastUpdated={lastUpdated} />
        </PreviewContent>
      )}
    </Box>
  );
};
