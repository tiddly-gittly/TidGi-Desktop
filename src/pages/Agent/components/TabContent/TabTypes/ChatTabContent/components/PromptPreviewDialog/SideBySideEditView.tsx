import { Box, styled } from '@mui/material';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AgentInstance } from '@services/agentInstance/interface';
import { IPromptPart } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { HandlerConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { PreviewMessage } from '../types';
import { CodeEditorView } from './CodeEditorView';
import { ConfigPanelView } from './ConfigPanelView';
import { PreviewTabsView } from './PreviewTabsView';

const EditorTabs = styled(Tabs)(({ theme }) => ({
  marginBottom: theme.spacing(2),
  borderBottom: `1px solid ${theme.palette.divider}`,
}));

interface SideBySideEditViewProps {
  tab: 'flat' | 'tree';
  handleTabChange: (_event: React.SyntheticEvent, value: string) => void;
  isFullScreen: boolean;
  flatPrompts?: PreviewMessage[];
  processedPrompts?: IPromptPart[];
  lastUpdated: Date | null;
  updateSource: 'auto' | 'manual' | 'initial' | null;
  handlerSchema: Record<string, unknown>;
  handlerConfig?: HandlerConfig;
  handleConfigUpdate: (data: Partial<AgentInstance>) => Promise<void>;
  handleFormChange: (updatedConfig: HandlerConfig) => void;
  handleManualRefresh: () => Promise<void>;
  previewLoading: boolean;
  handlerConfigLoading: boolean;
  autoUpdateEnabled: boolean;
  handleAutoUpdateToggle: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Side-by-side editing layout with configuration form and preview panels
 */
export const SideBySideEditView: React.FC<SideBySideEditViewProps> = React.memo(({
  tab,
  handleTabChange,
  isFullScreen,
  flatPrompts,
  processedPrompts,
  lastUpdated,
  updateSource,
  handlerSchema,
  handlerConfig,
  handleConfigUpdate,
  handleFormChange,
  handleManualRefresh,
  previewLoading,
  handlerConfigLoading,
  autoUpdateEnabled,
  handleAutoUpdateToggle,
}) => {
  const { t } = useTranslation('agent');
  const [editorMode, setEditorMode] = useState<'form' | 'code'>('form');

  const handleEditorModeChange = (_event: React.SyntheticEvent, newValue: 'form' | 'code') => {
    setEditorMode(newValue);
  };

  return (
    <Box sx={{ display: 'flex', gap: 2, height: isFullScreen ? 'calc(100vh - 150px)' : '70vh' }}>
      <Box
        sx={{
          flex: '1',
          pl: 2,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <PreviewTabsView
          tab={tab}
          handleTabChange={handleTabChange}
          isFullScreen={isFullScreen}
          flatPrompts={flatPrompts}
          processedPrompts={processedPrompts}
          lastUpdated={lastUpdated}
          updateSource={updateSource}
        />
      </Box>
      <Box
        sx={{
          flex: '0 0 50%',
          borderRight: 1,
          borderColor: 'divider',
          pr: 2,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box sx={{ mb: 2 }}>
          <EditorTabs
            value={editorMode}
            onChange={handleEditorModeChange}
            variant='fullWidth'
            aria-label='editor mode tabs'
          >
            <Tab
              value='form'
              label={t('Prompt.FormEditor')}
              sx={{ textTransform: 'none' }}
            />
            <Tab
              value='code'
              label={t('Prompt.CodeEditor')}
              sx={{ textTransform: 'none' }}
            />
          </EditorTabs>
        </Box>

        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {editorMode === 'form' && (
            <ConfigPanelView
              handlerSchema={handlerSchema}
              handlerConfig={handlerConfig}
              handleConfigUpdate={handleConfigUpdate}
              handleFormChange={handleFormChange}
              handleManualRefresh={handleManualRefresh}
              previewLoading={previewLoading}
              handlerConfigLoading={handlerConfigLoading}
              autoUpdateEnabled={autoUpdateEnabled}
              handleAutoUpdateToggle={handleAutoUpdateToggle}
            />
          )}

          {editorMode === 'code' && (
            <CodeEditorView
              handlerConfig={handlerConfig}
              onChange={handleFormChange}
              isFullScreen={isFullScreen}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
});
