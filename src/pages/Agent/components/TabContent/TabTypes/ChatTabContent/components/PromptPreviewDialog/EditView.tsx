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

export const EditView: React.FC<EditViewProps> = ({
  isFullScreen,
  inputText,
}) => {
  const { t } = useTranslation('agent');
  const agent = useAgentChatStore(state => state.agent);
  const [editorMode, setEditorMode] = useState<'form' | 'code'>('form');

  const { formFieldsToScrollTo, setFormFieldsToScrollTo, expandPathToTarget } = useAgentChatStore(
    useShallow((state) => ({
      formFieldsToScrollTo: state.formFieldsToScrollTo,
      setFormFieldsToScrollTo: state.setFormFieldsToScrollTo,
      expandPathToTarget: state.expandPathToTarget,
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

  React.useEffect(() => {
    if (formFieldsToScrollTo.length > 1 && editorMode === 'form') {
      expandPathToTarget(formFieldsToScrollTo);

      const scrollTimeout = setTimeout(() => {
        let targetElement: HTMLElement | null = null;
        const targetId = formFieldsToScrollTo[formFieldsToScrollTo.length - 1]; // Get the last segment (the actual ID)

        // Strategy 1: Try to find elements that contain the target ID in their input value or data attributes
        const candidateElements = Array.from(document.querySelectorAll('input, textarea, select')).filter(element => {
          const htmlElement = element as HTMLElement;
          // Check if the element's name, id, or value contains our target ID
          return htmlElement.id.includes(targetId) ||
            htmlElement.getAttribute('name')?.includes(targetId) ||
            (htmlElement as HTMLInputElement).value === targetId;
        });

        console.log(
          `Found ${candidateElements.length} candidate elements for ID "${targetId}":`,
          candidateElements.map(element => ({ id: element.id, name: element.getAttribute('name'), value: (element as HTMLInputElement).value })),
        );

        // Strategy 2: If we found candidates, pick the most relevant one
        if (candidateElements.length > 0) {
          // Prefer elements whose value exactly matches the target ID (for ID fields)
          const exactMatch = candidateElements.find(element => (element as HTMLInputElement).value === targetId);
          if (exactMatch) {
            targetElement = exactMatch as HTMLElement;
          } else {
            // If no exact value match, prefer elements whose ID contains the target ID
            const idMatch = candidateElements.find(element => element.id.includes(targetId));
            if (idMatch) {
              targetElement = idMatch as HTMLElement;
            } else {
              // Fallback to the first candidate
              targetElement = candidateElements[0] as HTMLElement;
            }
          }
        }

        // Strategy 3: Fallback to broader search if no candidates found
        if (!targetElement) {
          const selectors = [
            `[id*="${targetId}"]`,
            `[name*="${targetId}"]`,
            `[data-testid*="${targetId}"]`,
            `input[value="${targetId}"]`,
            `textarea[value="${targetId}"]`,
            // Look for fieldset or container elements
            `fieldset[id*="${targetId}"]`,
            `div[id*="${targetId}"]`,
          ];

          console.log('Trying broader selectors for:', targetId);
          for (const selector of selectors) {
            try {
              const elements = document.querySelectorAll(selector);
              if (elements.length > 0) {
                targetElement = elements[0] as HTMLElement;
                console.log(`Found element with selector "${selector}":`, targetElement.id);
                break;
              }
            } catch {
              // Ignore selector errors
            }
          }
        }

        // Strategy 4: If still not found, try to find the parent container by path structure
        if (!targetElement && formFieldsToScrollTo.length >= 2) {
          // For prompts path like ['prompts', 'some-id'], look for pattern root_prompts_*_id
          const pathPattern = formFieldsToScrollTo[0]; // 'prompts'
          const allInputs = document.querySelectorAll(`input[id^="root_${pathPattern}_"], textarea[id^="root_${pathPattern}_"], select[id^="root_${pathPattern}_"]`);

          console.log(`Found ${allInputs.length} inputs with path pattern "${pathPattern}"`);

          // Check each input to see if its value matches our target ID
          for (const input of Array.from(allInputs)) {
            const inputElement = input as HTMLInputElement;
            if (inputElement.value === targetId) {
              targetElement = inputElement;
              console.log(`Found target element by value match:`, targetElement.id);
              break;
            }
          }
        }

        if (targetElement) {
          const expandParents = (element: HTMLElement) => {
            let current = element.parentElement;
            while (current) {
              const accordionSummary = current.querySelector('[aria-expanded="false"]');
              if (accordionSummary instanceof HTMLElement) {
                accordionSummary.click();
              }

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

          setTimeout(() => {
            targetElement.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            });

            const originalStyle = targetElement.style.cssText;
            targetElement.style.cssText += '; outline: 2px solid #1976d2; outline-offset: 2px;';
            setTimeout(() => {
              targetElement.style.cssText = originalStyle;
            }, 2000);
          }, 300);

          setFormFieldsToScrollTo([]);
        } else {
          console.warn(`Could not find element for field path:`, formFieldsToScrollTo);
          console.log(
            'Available form elements:',
            Array.from(document.querySelectorAll('input, textarea, select')).map(element => ({
              id: element.id,
              name: element.getAttribute('name'),
              value: (element as HTMLInputElement).value,
            })),
          );
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
