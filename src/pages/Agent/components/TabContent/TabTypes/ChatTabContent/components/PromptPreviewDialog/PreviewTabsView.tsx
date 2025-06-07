import { Box, styled } from '@mui/material';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { IPromptPart } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { FlatPromptList } from '../FlatPromptList';
import { LastUpdatedIndicator } from '../LastUpdatedIndicator';
import { PromptTree } from '../PromptTree';
import { PreviewMessage } from '../types';
import { DialogTabTypes } from './constants';

// Styled components
const PreviewTabs = styled(Tabs)(({ theme }) => ({
  marginBottom: theme.spacing(2),
  borderBottom: `1px solid ${theme.palette.divider}`,
}));

const PreviewContent = styled('div', {
  shouldForwardProp: (property: string) => property !== 'isFullScreen',
})<{ isFullScreen?: boolean }>(({ theme, isFullScreen }) => ({
  background: theme.palette.background.paper,
  borderRadius: isFullScreen ? 0 : theme.shape.borderRadius,
  padding: isFullScreen ? theme.spacing(1) : theme.spacing(2),
  minHeight: 240,
  maxHeight: isFullScreen ? 'calc(100vh - 120px)' : '60vh',
  height: isFullScreen ? 'calc(100vh - 120px)' : 'auto',
  overflow: 'auto',
  fontFamily: '"JetBrains Mono", "Fira Mono", "Menlo", "Consolas", monospace',
  fontSize: 14,
  lineHeight: 1.7,
  boxShadow: 'none',
}));

interface PreviewTabsViewProps {
  tab: 'flat' | 'tree'; // 严格类型，只支持预览标签
  handleTabChange: (_event: React.SyntheticEvent, value: string) => void;
  isFullScreen: boolean;
  flatPrompts?: PreviewMessage[];
  processedPrompts?: IPromptPart[];
  lastUpdated: Date | null;
  updateSource: 'auto' | 'manual' | 'initial' | null;
}

/**
 * Preview tabs component with flat and tree views
 */
export const PreviewTabsView: React.FC<PreviewTabsViewProps> = React.memo(({
  tab,
  handleTabChange,
  isFullScreen,
  flatPrompts,
  processedPrompts,
  lastUpdated,
  updateSource,
}) => {
  const { t } = useTranslation('agent');

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
            label={t('Prompt.Flat')}
            value={DialogTabTypes.FLAT}
            sx={{ textTransform: 'none' }}
          />
          <Tab
            label={t('Prompt.Tree')}
            value={DialogTabTypes.TREE}
            sx={{ textTransform: 'none' }}
          />
        </PreviewTabs>
      </Box>

      {/* Flat Result Tab */}
      {tab === DialogTabTypes.FLAT && (
        <PreviewContent isFullScreen={isFullScreen}>
          <FlatPromptList flatPrompts={flatPrompts} />
          <LastUpdatedIndicator lastUpdated={lastUpdated} />
        </PreviewContent>
      )}

      {/* Tree Result Tab */}
      {tab === DialogTabTypes.TREE && (
        <PreviewContent isFullScreen={isFullScreen}>
          <PromptTree prompts={processedPrompts} />
          <LastUpdatedIndicator lastUpdated={lastUpdated} />
        </PreviewContent>
      )}
    </Box>
  );
});
