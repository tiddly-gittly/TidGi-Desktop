import { Box, styled } from '@mui/material';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
  handlerSchema: Record<string, unknown>;
  initialHandlerConfig?: HandlerConfig;
  handleFormChange: (updatedConfig: HandlerConfig) => void;
  previewLoading: boolean;
  handlerConfigLoading: boolean;
}

/**
 * Side-by-side editing layout with configuration form and preview panels
 */
export const SideBySideEditView: React.FC<SideBySideEditViewProps> = ({
  tab,
  handleTabChange,
  isFullScreen,
  flatPrompts,
  processedPrompts,
  lastUpdated,
  handlerSchema,
  initialHandlerConfig,
  handleFormChange,
  previewLoading,
  handlerConfigLoading,
}) => {
  const { t } = useTranslation('agent');
  const [editorMode, setEditorMode] = useState<'form' | 'code'>('form');

  const handleEditorModeChange = useCallback((_event: React.SyntheticEvent, newValue: 'form' | 'code') => {
    setEditorMode(newValue);
  }, []);

  return (
    <Box sx={{ display: 'flex', gap: 2, height: isFullScreen ? '100%' : '70vh' }}>
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
              initialHandlerConfig={initialHandlerConfig}
              handleFormChange={handleFormChange}
              previewLoading={previewLoading}
              handlerConfigLoading={handlerConfigLoading}
            />
          )}

          {editorMode === 'code' && (
            <CodeEditorView
              initialConfig={initialHandlerConfig}
              onChange={handleFormChange}
              isFullScreen={isFullScreen}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
};
