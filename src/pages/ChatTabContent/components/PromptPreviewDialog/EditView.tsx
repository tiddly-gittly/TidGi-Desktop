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
import { useArrayFieldStore } from './PromptConfigForm/store/arrayFieldStore';

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

  const { formFieldsToScrollTo, setFormFieldsToScrollTo } = useAgentChatStore(
    useShallow((state) => ({
      formFieldsToScrollTo: state.formFieldsToScrollTo,
      setFormFieldsToScrollTo: state.setFormFieldsToScrollTo,
    })),
  );

  // Use a stable reference for expandItemsByPath
  const expandItemsByPath = useArrayFieldStore(useCallback((state) => state.expandItemsByPath, []));

  const {
    loading: agentFrameworkConfigLoading,
    config: agentFrameworkConfig,
    schema: handlerSchema,
    handleConfigChange,
  } = useAgentFrameworkConfigManagement({
    agentDefId: agent?.agentDefId,
    agentId: agent?.id,
  });

  // Use a ref to track if we're currently processing a scroll request
  const isProcessingScrollReference = React.useRef(false);
  const savedPathReference = React.useRef<string[]>([]);
  
  useEffect(() => {
    if (formFieldsToScrollTo.length > 0 && editorMode === 'form' && agentFrameworkConfig && !isProcessingScrollReference.current) {
      // Mark as processing and save the path
      isProcessingScrollReference.current = true;
      savedPathReference.current = [...formFieldsToScrollTo];
      const savedPath = savedPathReference.current;
      
      // NOTE: Don't clear formFieldsToScrollTo immediately!
      // RootObjectFieldTemplate also listens to this to switch tabs.
      // We'll clear it after the tab has had time to switch.
      
      // Path format: ['prompts', 'system', 'child-id', 'child-id'] or ['prompts', 'system']
      // - savedPath[0]: top-level key (prompts, plugins, response)
      // - savedPath[1]: parent item id
      // - savedPath[2+]: nested child item ids (if present)
      
      // Step 1: Wait for RootObjectFieldTemplate to switch tabs, then expand items
      setTimeout(() => {
        // Now clear the path after tab has switched
        setFormFieldsToScrollTo([]);
        
        const topLevelKey = savedPath[0];
        if (savedPath.length > 1) {
          const firstItemId = savedPath[1];
          expandItemsByPath(topLevelKey, [firstItemId]);
        }
      }, 100);
      
      // Step 2: After the parent expands and children render, expand nested items
      // If path has more than 2 elements, we have nested children to expand
      const hasNestedChildren = savedPath.length > 2;
      if (hasNestedChildren) {
        setTimeout(() => {
          const topLevelKey = savedPath[0];
          const firstItemId = savedPath[1];
          const topLevelArray = agentFrameworkConfig[topLevelKey as keyof typeof agentFrameworkConfig];
          if (Array.isArray(topLevelArray)) {
            const parentIndex = topLevelArray.findIndex((item: unknown) => {
              const data = item as Record<string, unknown> | null;
              return data?.id === firstItemId || data?.caption === firstItemId || data?.title === firstItemId;
            });
            
            if (parentIndex !== -1) {
              const nestedFieldPath = `${topLevelKey}_${parentIndex}_children`;
              // Get the nested item IDs (from savedPath[2] onwards)
              const nestedItemIds = savedPath.slice(2);
              expandItemsByPath(nestedFieldPath, nestedItemIds);
            }
          }
        }, 300); // Longer delay to wait for nested array to render
      }

      // Step 3: Scroll to the target element (after nested items have expanded)
      const scrollDelay = hasNestedChildren ? 500 : 200;
      setTimeout(() => {
        const targetId = savedPath[savedPath.length - 1];

        // Find input element whose value exactly matches the target ID
        const targetElement = document.querySelector(`input[value="${targetId}"]`);
        if (targetElement) {
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
        
        // Mark processing as complete
        isProcessingScrollReference.current = false;
      }, scrollDelay);
    }
  }, [formFieldsToScrollTo, editorMode, expandItemsByPath, agentFrameworkConfig, setFormFieldsToScrollTo]);

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
