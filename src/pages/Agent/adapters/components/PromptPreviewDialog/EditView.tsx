import { Box, CircularProgress, styled } from '@mui/material';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import debounce from 'lodash/debounce';

import React, { type Dispatch, FC, lazy, type SetStateAction, Suspense, SyntheticEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PromptConfigForm } from '@memeloop/react-ui/agent/prompts';
import type { AgentFrameworkConfig, PromptPreviewController, PromptPreviewDialogState } from 'memeloop';

// Lazy load Monaco Editor only when needed
const MonacoEditor = lazy(async () => await import('@monaco-editor/react'));

const EditorTabs = styled(Tabs)`
  margin-bottom: ${({ theme }) => theme.spacing(2)};
  border-bottom: 1px solid ${({ theme }) => theme.palette.divider};
`;

interface EditViewProps {
  isFullScreen: boolean;
  inputText: string;
  agentId: string;
  state: PromptPreviewDialogState;
  controller: PromptPreviewController;
  agentFrameworkConfigLoading: boolean;
  agentFrameworkConfig: AgentFrameworkConfig | undefined;
  setAgentFrameworkConfig: Dispatch<SetStateAction<AgentFrameworkConfig | undefined>>;
  handlerSchema: Record<string, unknown> | undefined;
  persistAgentFrameworkConfig: (config: AgentFrameworkConfig) => Promise<void>;
}

export const EditView: FC<EditViewProps> = ({
  isFullScreen,
  inputText,
  agentId,
  state,
  controller,
  agentFrameworkConfigLoading,
  agentFrameworkConfig,
  setAgentFrameworkConfig,
  handlerSchema,
  persistAgentFrameworkConfig,
}) => {
  const { t } = useTranslation('agent');
  const [editorMode, setEditorMode] = useState<'form' | 'code'>('form');
  const [monacoInitialized, setMonacoInitialized] = useState(false);
  const { formFieldsToScrollTo } = state;

  const persistAndRefresh = useCallback(async (updatedConfig: AgentFrameworkConfig) => {
    try {
      await persistAgentFrameworkConfig(updatedConfig);
      await controller.generate(
        updatedConfig,
        agentId,
        inputText.trim().length === 0 ? undefined : inputText,
      );
    } catch (error) {
      await window.service.native.log('error', 'EditView: Error auto-saving config:', { error });
    }
  }, [agentId, controller, inputText, persistAgentFrameworkConfig]);

  const handleFormChange = useMemo(
    () =>
      debounce(
        (updatedConfig: AgentFrameworkConfig) => {
          void persistAndRefresh(updatedConfig);
        },
        500,
        { leading: false, maxWait: 2000 },
      ),
    [persistAndRefresh],
  );
  useEffect(() => () => {
    handleFormChange.cancel();
  }, [handleFormChange]);

  // 输入时立即更新本地 config，避免 formData 滞后导致 RJSF 输入框光标跳动；持久化由 handleFormChange 防抖执行
  const handleInputChange = useCallback((changedFormData: AgentFrameworkConfig) => {
    setAgentFrameworkConfig(changedFormData);
    handleFormChange(changedFormData);
  }, [setAgentFrameworkConfig, handleFormChange]);

  const handleEditorModeChange = useCallback(async (_event: SyntheticEvent, newValue: 'form' | 'code') => {
    setEditorMode(newValue);
    // Only initialize Monaco when switching to code mode
    if (newValue === 'code' && !monacoInitialized) {
      const { initMonacoEditor } = await import('@/helpers/monacoConfig');
      initMonacoEditor();
      setMonacoInitialized(true);
    }
  }, [monacoInitialized]);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!value) return;
    try {
      const parsedConfig = JSON.parse(value) as AgentFrameworkConfig;
      setAgentFrameworkConfig(parsedConfig);
      handleFormChange(parsedConfig);
    } catch (error) {
      void window.service.native.log('error', 'EditView: Invalid JSON in code editor:', { error });
    }
  }, [handleFormChange, setAgentFrameworkConfig]);

  return (
    <Box
      sx={{
        borderLeft: { xs: 0, md: 1 },
        borderTop: { xs: 1, md: 0 },
        borderColor: 'divider',
        pl: { xs: 0, md: 2 },
        pt: { xs: 2, md: 0 },
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
          aria-label={t('Prompt.EditorModeTabs')}
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
            formData={agentFrameworkConfig}
            onChange={handleInputChange}
            loading={agentFrameworkConfigLoading}
            formFieldsToScrollTo={formFieldsToScrollTo}
            onFieldReveal={() => {
              controller.setFormFieldsToScrollTo([]);
            }}
          />
        )}
        {editorMode === 'code' && (
          <Suspense
            fallback={
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <CircularProgress />
              </Box>
            }
          >
            <MonacoEditor
              height='100%'
              defaultLanguage='json'
              value={agentFrameworkConfig ? JSON.stringify(agentFrameworkConfig, null, 2) : '{}'}
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
          </Suspense>
        )}
      </Box>
    </Box>
  );
};
