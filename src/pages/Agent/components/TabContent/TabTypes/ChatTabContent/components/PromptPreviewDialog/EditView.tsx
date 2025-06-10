import { useHandlerConfigManagement } from '@/pages/Preferences/sections/ExternalAPI/useHandlerConfigManagement';
import MonacoEditor from '@monaco-editor/react';
import { Box, styled } from '@mui/material';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import useDebouncedCallback from 'beautiful-react-hooks/useDebouncedCallback';

import React, { useCallback, useState } from 'react';
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

  const { formFieldsToScrollTo, setFormFieldsToScrollTo } = useAgentChatStore(
    useShallow((state) => ({
      formFieldsToScrollTo: state.formFieldsToScrollTo,
      setFormFieldsToScrollTo: state.setFormFieldsToScrollTo,
    })),
  );

  const {
    loading: handlerConfigLoading,
    config: handlerConfig,
    schema: handlerSchema,
    handleConfigChange,
  } = useHandlerConfigManagement({
    agentDefId: agent?.agentDefId,
    agentId: agent?.id,
  });

  // Effect to handle field scrolling when formFieldsToScrollTo changes
  React.useEffect(() => {
    if (formFieldsToScrollTo.length > 1 && editorMode === 'form') {
      const formFieldToScrollTo = formFieldsToScrollTo[1]; // Second element is the actual target field
      // Use setTimeout to ensure the form is rendered before scrolling
      const scrollTimeout = setTimeout(() => {
        // Try multiple possible ID formats for the field
        const possibleIds = [
          `root_${formFieldToScrollTo}`,
          formFieldToScrollTo,
          `root_prompts_${formFieldToScrollTo}`,
          `root_promptDynamicModification_${formFieldToScrollTo}`,
          `root_response_${formFieldToScrollTo}`,
          `root_responseDynamicModification_${formFieldToScrollTo}`,
        ];

        // Also try to find nested fields (like children arrays)
        const fieldParts = formFieldToScrollTo.split('.');
        if (fieldParts.length > 1) {
          const [section, ...rest] = fieldParts;
          const nestedPath = rest.join('_');
          possibleIds.push(`root_${section}_${nestedPath}`);

          // For array items, try with numeric indices
          const arrayPattern = /(\w+)\[(\d+)\]/g;
          let transformedId = `root_${formFieldToScrollTo}`;
          transformedId = transformedId.replace(arrayPattern, '$1_$2');
          transformedId = transformedId.replace(/\./g, '_');
          possibleIds.push(transformedId);
        }

        let targetElement: HTMLElement | null = null;

        // Try to find the element with any of the possible IDs
        for (const id of possibleIds) {
          targetElement = document.getElementById(id);
          if (targetElement) {
            console.log(`Found element with ID: ${id}`);
            break;
          }
        }

        // If direct ID lookup fails, try querySelector with more flexible patterns
        if (!targetElement) {
          const selectors = [
            `[id*="${formFieldToScrollTo}"]`,
            `[data-testid*="${formFieldToScrollTo}"]`,
            `[aria-label*="${formFieldToScrollTo}"]`,
            `.field-${formFieldToScrollTo}`,
          ];

          for (const selector of selectors) {
            try {
              targetElement = document.querySelector(selector);
              if (targetElement) {
                console.log(`Found element with selector: ${selector}`);
                break;
              }
            } catch {
              // Ignore selector errors
            }
          }
        }

        if (targetElement) {
          // Check if the element is in a collapsed parent (like accordion or tab)
          const expandParents = (element: HTMLElement) => {
            let current = element.parentElement;
            while (current) {
              // Expand MUI Accordion
              const accordionSummary = current.querySelector('[aria-expanded="false"]');
              if (accordionSummary instanceof HTMLElement) {
                accordionSummary.click();
              }

              // Switch to correct tab if element is in a hidden tab panel
              const tabPanel = current.closest('[role="tabpanel"][hidden]');
              if (tabPanel) {
                const tabPanelId = tabPanel.getAttribute('aria-labelledby');
                if (tabPanelId) {
                  const correspondingTab = document.getElementById(tabPanelId);
                  if (correspondingTab instanceof HTMLElement) {
                    correspondingTab.click();
                  }
                }
              }

              current = current.parentElement;
            }
          };

          expandParents(targetElement);

          // Wait a bit for expansions/tab switches to complete, then scroll
          setTimeout(() => {
            targetElement.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            });

            // Highlight the element briefly
            const originalStyle = targetElement.style.cssText;
            targetElement.style.cssText += '; outline: 2px solid #1976d2; outline-offset: 2px;';
            setTimeout(() => {
              targetElement.style.cssText = originalStyle;
            }, 2000);
          }, 300);

          // Clear the field to scroll to after scrolling
          setFormFieldsToScrollTo([]);
        } else {
          console.warn(`Could not find element for field: ${formFieldToScrollTo}`);
          setFormFieldsToScrollTo([]);
        }
      }, 100);

      return () => {
        clearTimeout(scrollTimeout);
      };
    }
  }, [formFieldsToScrollTo, editorMode, setFormFieldsToScrollTo]);

  const { getPreviewPromptResult } = useAgentChatStore(
    useShallow((state) => ({
      getPreviewPromptResult: state.getPreviewPromptResult,
    })),
  );

  const handleFormChange = useDebouncedCallback(
    async (updatedConfig: HandlerConfig) => {
      try {
        await handleConfigChange(updatedConfig);
        if (agent?.agentDefId) {
          void getPreviewPromptResult(inputText, updatedConfig);
        }
      } catch (error) {
        console.error('EditView: Error auto-saving config:', error);
      }
    },
    [handleConfigChange, agent?.agentDefId, getPreviewPromptResult, inputText],
    1000,
  );
  const handleEditorModeChange = useCallback((_event: React.SyntheticEvent, newValue: 'form' | 'code') => {
    setEditorMode(newValue);
  }, []);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!value) return;
    try {
      const parsedConfig = JSON.parse(value) as HandlerConfig;
      void handleFormChange(parsedConfig);
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
