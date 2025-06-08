import { useHandlerConfigManagement } from '@/pages/Preferences/sections/ExternalAPI/useHandlerConfigManagement';
import MonacoEditor from '@monaco-editor/react';
import { Box, styled } from '@mui/material';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';

import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import { HandlerConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { useAgentChatStore } from '../../../../../../store/agentChatStore/index';
import { PromptConfigForm } from '../PromptConfigForm';

const EditorTabs = styled(Tabs)`
  margin-bottom: ${({ theme }) => theme.spacing(2)};
  border-bottom: 1px solid ${({ theme }) => theme.palette.divider};
`;

interface EditViewProps {
  isFullScreen: boolean;
  inputText: string;
}

/**
 * Configuration editing component with form and code editor modes
 */
export const EditView: React.FC<EditViewProps> = ({
  isFullScreen,
  inputText,
}) => {
  const { t } = useTranslation('agent');
  const agent = useAgentChatStore(state => state.agent);
  const [editorMode, setEditorMode] = useState<'form' | 'code'>('form');

  const {
    loading: handlerConfigLoading,
    config: handlerConfig,
    schema: handlerSchema,
    handleConfigChange,
  } = useHandlerConfigManagement({
    agentDefId: agent?.agentDefId,
    agentId: agent?.id,
  });

  const { getPreviewPromptResult } = useAgentChatStore(
    useShallow((state) => ({
      getPreviewPromptResult: state.getPreviewPromptResult,
    })),
  );

  const saveTimeoutReference = useRef<NodeJS.Timeout | null>(null);

  const handleFormChange = useCallback((updatedConfig: HandlerConfig) => {
    console.log('Form data changed', {
      configKeys: Object.keys(updatedConfig),
    });

    if (saveTimeoutReference.current) {
      clearTimeout(saveTimeoutReference.current);
    }

    saveTimeoutReference.current = setTimeout(async () => {
      try {
        await handleConfigChange(updatedConfig);
        if (agent?.agentDefId) {
          void getPreviewPromptResult(inputText, updatedConfig);
        }
      } catch (error) {
        console.error('EditView: Error auto-saving config:', error);
      }
    }, 1000);
  }, [handleConfigChange, agent?.agentDefId, getPreviewPromptResult, inputText]);

  const handleEditorModeChange = useCallback((_event: React.SyntheticEvent, newValue: 'form' | 'code') => {
    setEditorMode(newValue);
  }, []);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!value) return;
    try {
      const parsedConfig = JSON.parse(value) as HandlerConfig;
      handleFormChange(parsedConfig);
    } catch (error) {
      console.error('Invalid JSON in code editor:', error);
    }
  }, [handleFormChange]);

  return (
    <Box
      sx={{
        borderLeft: 1,
        borderColor: 'divider',
        pl: 2,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: isFullScreen ? '100%' : '70vh',
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
          <PromptConfigForm
            schema={handlerSchema ?? {}}
            formData={handlerConfig}
            onChange={handleFormChange}
            loading={handlerConfigLoading}
          />
        )}
        {editorMode === 'code' && (
          <MonacoEditor
            height='100%'
            defaultLanguage='json'
            value={handlerConfig ? JSON.stringify(handlerConfig, null, 2) : '{}'}
            onChange={handleEditorChange}
            options={{
              minimap: { enabled: true },
              fontSize: 14,
              wordWrap: 'on',
              automaticLayout: true,
              formatOnPaste: true,
              formatOnType: true,
              scrollBeyondLastLine: false,
            }}
          />
        )}
      </Box>
    </Box>
  );
};
