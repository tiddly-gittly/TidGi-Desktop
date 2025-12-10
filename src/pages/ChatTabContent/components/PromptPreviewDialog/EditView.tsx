import { useAgentFrameworkConfigManagement } from '@/windows/Preferences/sections/ExternalAPI/useAgentFrameworkConfigManagement';
import { Box, CircularProgress, styled } from '@mui/material';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import useDebouncedCallback from 'beautiful-react-hooks/useDebouncedCallback';

import React, { FC, lazy, Suspense, SyntheticEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import { AgentFrameworkConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { useAgentChatStore } from '../../../Agent/store/agentChatStore/index';
import { PromptConfigForm } from './PromptConfigForm';

// Lazy load Monaco Editor only when needed
const MonacoEditor = lazy(async () => await import('@monaco-editor/react'));

const EditorTabs = styled(Tabs)`
  margin-bottom: ${({ theme }) => theme.spacing(2)};
  border-bottom: 1px solid ${({ theme }) => theme.palette.divider};
`;

interface EditViewProps {
  isFullScreen: boolean;
  inputText: string;
}

export const EditView: FC<EditViewProps> = ({
  isFullScreen,
  inputText,
}) => {
  const { t } = useTranslation('agent');
  const agent = useAgentChatStore(state => state.agent);
  const [editorMode, setEditorMode] = useState<'form' | 'code'>('form');
  const [monacoInitialized, setMonacoInitialized] = useState(false);

  const { formFieldsToScrollTo, setFormFieldsToScrollTo, expandPathToTarget } = useAgentChatStore(
    useShallow((state) => ({
      formFieldsToScrollTo: state.formFieldsToScrollTo,
      setFormFieldsToScrollTo: state.setFormFieldsToScrollTo,
      expandPathToTarget: state.expandPathToTarget,
    })),
  );

  const {
    loading: agentFrameworkConfigLoading,
    config: agentFrameworkConfig,
    schema: handlerSchema,
    handleConfigChange,
  } = useAgentFrameworkConfigManagement({
    agentDefId: agent?.agentDefId,
    agentId: agent?.id,
  });

  useEffect(() => {
    if (formFieldsToScrollTo.length > 0 && editorMode === 'form') {
      expandPathToTarget(formFieldsToScrollTo);

      const scrollTimeout = setTimeout(() => {
        const targetId = formFieldsToScrollTo[formFieldsToScrollTo.length - 1];

        // Find input element whose value exactly matches the target ID
        const targetElement = document.querySelector(`input[value="${targetId}"]`);
        if (targetElement) {
          // Expand parent accordions
          let current = targetElement.parentElement;
          while (current) {
            const accordion = current.querySelector('[aria-expanded="false"]');
            if (accordion instanceof HTMLElement) {
              accordion.click();
            }
            current = current.parentElement;
          }

          // Scroll to element and highlight
          setTimeout(() => {
            if (targetElement instanceof HTMLElement) {
              targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              const originalStyle = targetElement.style.cssText;
              targetElement.style.cssText += '; outline: 2px solid #1976d2; outline-offset: 2px;';
              setTimeout(() => {
                targetElement.style.cssText = originalStyle;
              }, 2000);
            }
          }, 300);
        }

        setFormFieldsToScrollTo([]);
      }, 100);

      return () => {
        clearTimeout(scrollTimeout);
      };
    }
  }, [formFieldsToScrollTo, editorMode, setFormFieldsToScrollTo, expandPathToTarget]);

  const { getPreviewPromptResult } = useAgentChatStore(
    useShallow((state) => ({
      getPreviewPromptResult: state.getPreviewPromptResult,
    })),
  );

  // Keep local ref to track if preview should be updated
  const isUserEditingReference = React.useRef(false);

  const handleFormChange = useDebouncedCallback(
    async (updatedConfig: AgentFrameworkConfig) => {
      try {
        // Always persist the config change to backend
        await handleConfigChange(updatedConfig);
        
        // Only update preview if user is actually editing (not just drag-reordering)
        if (isUserEditingReference.current && agent?.agentDefId) {
          void getPreviewPromptResult(inputText, updatedConfig);
        }
      } catch (error) {
        await window.service.native.log('error', 'EditView: Error auto-saving config:', { error });
      }
    },
    [handleConfigChange, agent?.agentDefId, getPreviewPromptResult, inputText],
    500,
    { leading: false, maxWait: 2000 },
  );

  const handleInputChange = useCallback((changedFormData: AgentFrameworkConfig) => {
    // Mark as user editing when form data changes
    isUserEditingReference.current = true;
    void handleFormChange(changedFormData);
  }, [handleFormChange]);

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
      void handleFormChange(parsedConfig);
    } catch (error) {
      void window.service.native.log('error', 'EditView: Invalid JSON in code editor:', { error });
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
            formData={agentFrameworkConfig}
            onChange={handleInputChange}
            loading={agentFrameworkConfigLoading}
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
