import { ChatTabContent } from '@/pages/ChatTabContent';
import { PromptConfigForm } from '@/pages/ChatTabContent/components/PromptPreviewDialog/PromptConfigForm';
import { Box, Button, Container, Step, StepLabel, Stepper, TextField, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import type { RJSFSchema } from '@rjsf/utils';
import type { AgentDefinition } from '@services/agentDefinition/interface';
import { HandlerConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import useDebouncedCallback from 'beautiful-react-hooks/useDebouncedCallback';
import { nanoid } from 'nanoid';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TemplateSearch } from '../../components/Search/TemplateSearch';
import { useTabStore } from '../../store/tabStore';
import { ICreateNewAgentTab, TabState, TabType } from '../../types/tab';

interface CreateNewAgentContentProps {
  tab: ICreateNewAgentTab;
}

const Container_ = styled(Container)`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  max-width: none !important;
  padding: 32px;
  overflow-y: auto;
  background-color: ${props => props.theme.palette.background.default};
`;

const StepSection = styled(Box)`
  margin-bottom: 32px;
  padding: 24px;
  border-radius: 8px;
  background-color: ${props => props.theme.palette.background.paper};
  border: 1px solid ${props => props.theme.palette.divider};
`;

const StepContainer = styled(Box)`
  min-height: 400px;
  display: flex;
  flex-direction: column;
`;

const ActionBar = styled(Box)`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  margin-top: auto;
`;

const STEPS = ['setupAgent', 'editPrompt', 'immediateUse'] as const;

export const CreateNewAgentContent: React.FC<CreateNewAgentContentProps> = ({ tab }) => {
  const { t } = useTranslation('agent');
  const { updateTabData, addTab, closeTab } = useTabStore();

  const [currentStep, setCurrentStep] = useState(tab.currentStep ?? 0);
  const [agentName, setAgentName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<AgentDefinition | null>(null);
  const [temporaryAgentDefinition, setTemporaryAgentDefinition] = useState<AgentDefinition | null>(null);
  const [previewAgentId, setPreviewAgentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [promptSchema, setPromptSchema] = useState<RJSFSchema | null>(null);

  // Restore state from backend when component mounts
  useEffect(() => {
    const restoreState = async () => {
      if (tab.agentDefId && window.service?.agentDefinition?.getAgentDef) {
        try {
          setIsLoading(true);

          // Load the temporary agent definition
          const agentDefinition = await window.service.agentDefinition.getAgentDef(tab.agentDefId);
          if (agentDefinition) {
            setTemporaryAgentDefinition(agentDefinition);
            setAgentName(agentDefinition.name ?? '');

            // If there's a template agent def ID, load it as selected template
            if (tab.templateAgentDefId) {
              const templateDefinition = await window.service.agentDefinition.getAgentDef(tab.templateAgentDefId);
              if (templateDefinition) {
                setSelectedTemplate(templateDefinition);
              }
            }
          }
        } catch (error) {
          console.error('Failed to restore CreateNewAgent state:', error);
        } finally {
          setIsLoading(false);
        }
      }
    };

    void restoreState();
  }, [tab.agentDefId, tab.templateAgentDefId]);

  // Load schema when temporaryAgentDefinition is available
  useEffect(() => {
    const loadSchema = async () => {
      if (temporaryAgentDefinition?.handlerID) {
        try {
          const schema = await window.service.agentInstance.getHandlerConfigSchema(temporaryAgentDefinition.handlerID);
          setPromptSchema(schema as RJSFSchema);
        } catch (error) {
          console.error('Failed to load handler config schema:', error);
          setPromptSchema(null);
        }
      }
    };

    void loadSchema();
  }, [temporaryAgentDefinition?.handlerID]);

  // Create preview agent when entering step 3
  useEffect(() => {
    const createPreviewAgent = async () => {
      if (currentStep === 2 && temporaryAgentDefinition && !previewAgentId) {
        try {
          setIsLoading(true);
          // Flush any pending debounced saves before creating preview agent
          await saveToBackendDebounced.flush();

          // Force save the latest agent definition before creating preview agent
          await window.service.agentDefinition.updateAgentDef(temporaryAgentDefinition);
          const previewAgent = await window.service.agentInstance.createAgent(
            temporaryAgentDefinition.id,
            { preview: true },
          );
          setPreviewAgentId(previewAgent.id);
        } catch (error) {
          console.error('Failed to create preview agent:', error);
          void window.service.native.log('error', 'CreateNewAgentContent: Failed to create preview agent', { error });
        } finally {
          setIsLoading(false);
        }
      }
    };

    void createPreviewAgent();
  }, [currentStep, temporaryAgentDefinition, previewAgentId]);

  // Auto-save to backend whenever temporaryAgentDefinition changes (debounced)
  const saveToBackendDebounced = useDebouncedCallback(
    async () => {
      if (temporaryAgentDefinition?.id) {
        try {
          await window.service.agentDefinition.updateAgentDef(temporaryAgentDefinition);
        } catch (error) {
          console.error('Failed to auto-save agent definition:', error);
        }
      }
    },
    [temporaryAgentDefinition],
    1000,
  );

  useEffect(() => {
    if (temporaryAgentDefinition) {
      void saveToBackendDebounced();
    }
  }, [temporaryAgentDefinition, saveToBackendDebounced]);

  // Update current step when tab changes
  useEffect(() => {
    setCurrentStep(tab.currentStep ?? 0);
  }, [tab.currentStep]);

  // Cleanup when component unmounts or tab closes
  useEffect(() => {
    return () => {
      // Cleanup temporary agent definition and preview agent when tab closes
      const cleanup = async () => {
        if (temporaryAgentDefinition?.id && temporaryAgentDefinition.id.startsWith('temp-')) {
          try {
            await window.service.agentDefinition.deleteAgentDef(temporaryAgentDefinition.id);
          } catch (error) {
            console.error('Failed to cleanup temporary agent definition:', error);
          }
        }
        if (previewAgentId) {
          try {
            await window.service.agentInstance.deleteAgent(previewAgentId);
          } catch (error) {
            console.error('Failed to cleanup preview agent:', error);
          }
        }
      };
      void cleanup();
    };
  }, [temporaryAgentDefinition?.id, previewAgentId]);

  const handleNext = async () => {
    if (currentStep < STEPS.length - 1) {
      // Force save before advancing to next step (especially step 3)
      if (temporaryAgentDefinition?.id) {
        try {
          await window.service.agentDefinition.updateAgentDef(temporaryAgentDefinition);
        } catch (error) {
          console.error('❌ Failed to force save agent definition:', error);
        }
      }

      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      updateTabData(tab.id, { currentStep: nextStep });
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      const previousStep = currentStep - 1;
      setCurrentStep(previousStep);
      updateTabData(tab.id, { currentStep: previousStep });
    }
  };

  const handleTemplateSelect = async (template: AgentDefinition) => {
    try {
      setIsLoading(true);
      setSelectedTemplate(template);

      // Create temporary agent definition based on template
      const temporaryId = `temp-${nanoid()}`;
      const newAgentDefinition: AgentDefinition = {
        ...template,
        id: temporaryId,
        name: agentName || `${template.name} (Copy)`,
      };

      const createdDefinition = await window.service.agentDefinition.createAgentDef(newAgentDefinition);
      setTemporaryAgentDefinition(createdDefinition);

      // Update agent name
      if (!agentName) {
        setAgentName(createdDefinition.name || newAgentDefinition.name || '');
      }

      // Update tab data
      updateTabData(tab.id, {
        agentDefId: createdDefinition.id,
        templateAgentDefId: template.id,
      });
    } catch (error) {
      console.error('Failed to create temporary agent definition:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAgentDefinitionChange = async (updatedDefinition: AgentDefinition) => {
    // Immediately update React state
    setTemporaryAgentDefinition(updatedDefinition);
  };

  const handleSaveAndUse = async () => {
    try {
      if (temporaryAgentDefinition) {
        // Remove 'temp-' prefix to make it permanent
        const permanentId = temporaryAgentDefinition.id?.replace('temp-', '') || nanoid();
        const permanentDefinition = {
          ...temporaryAgentDefinition,
          id: permanentId,
        };

        // Save as permanent agent definition
        await window.service.agentDefinition.createAgentDef(permanentDefinition);

        // Create chat tab
        await addTab(TabType.CHAT, {
          title: permanentDefinition.name || 'New Agent',
          agentDefId: permanentId,
        });

        // Close this create agent tab
        closeTab(tab.id);
      }
    } catch (error) {
      console.error('Failed to save and use agent:', error);
    }
  };

  const canProceed = () => {
    switch (STEPS[currentStep]) {
      case 'setupAgent':
        return selectedTemplate !== null && agentName.trim().length > 0;
      case 'editPrompt':
        return temporaryAgentDefinition !== null;
      case 'immediateUse':
        return temporaryAgentDefinition !== null;
      default:
        return false;
    }
  };

  const renderStepContent = () => {
    void window.service.native.log('debug', 'renderStepContent: ', { step: STEPS[currentStep] });
    switch (STEPS[currentStep]) {
      case 'setupAgent':
        return (
          <StepContainer>
            <Typography variant='h6' gutterBottom>
              {t('CreateAgent.SetupAgent')}
            </Typography>
            <Typography variant='body2' color='text.secondary' gutterBottom>
              {t('CreateAgent.SetupAgentDescription')}
            </Typography>

            {/* Agent Name Input - placed above template search */}
            <Box sx={{ marginTop: 2, marginBottom: 3 }}>
              <TextField
                fullWidth
                label={t('CreateAgent.AgentName')}
                value={agentName}
                onChange={(event) => {
                  setAgentName(event.target.value);
                }}
                margin='normal'
                variant='outlined'
                placeholder={selectedTemplate ? `${selectedTemplate.name} (Copy)` : t('CreateAgent.AgentNamePlaceholder')}
                helperText={t('CreateAgent.AgentNameHelper')}
                data-testid='agent-name-input'
                slotProps={{
                  htmlInput: {
                    'data-testid': 'agent-name-input-field',
                  },
                }}
              />
            </Box>

            {/* Template Selection */}
            <Box sx={{ marginBottom: 2 }}>
              <Typography variant='subtitle1' gutterBottom>
                {t('CreateAgent.SelectTemplate')}
              </Typography>
              <Typography variant='body2' color='text.secondary' gutterBottom>
                {t('CreateAgent.SelectTemplateDescription')}
              </Typography>
              <TemplateSearch
                placeholder={t('CreateAgent.SearchTemplates')}
                onTemplateSelect={handleTemplateSelect}
                testId='template-search-input'
              />
              {selectedTemplate && (
                <Box sx={{ marginTop: 2, padding: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <Typography variant='subtitle2'>{t('CreateAgent.SelectedTemplate')}: {selectedTemplate.name}</Typography>
                  {selectedTemplate.description && (
                    <Typography variant='body2' color='text.secondary'>
                      {selectedTemplate.description}
                    </Typography>
                  )}
                </Box>
              )}
            </Box>
          </StepContainer>
        );

      case 'editPrompt':
        return (
          <StepContainer>
            <Typography variant='h6' gutterBottom>
              {t('CreateAgent.EditPrompt')}
            </Typography>
            <Typography variant='body2' color='text.secondary' gutterBottom>
              {t('CreateAgent.EditPromptDescription')}
            </Typography>

            {temporaryAgentDefinition
              ? (
                <Box sx={{ mt: 2, height: 400, overflow: 'auto' }}>
                  <PromptConfigForm
                    schema={promptSchema || undefined}
                    formData={temporaryAgentDefinition.handlerConfig as HandlerConfig}
                    onChange={(updatedConfig) => {
                      void handleAgentDefinitionChange({
                        ...temporaryAgentDefinition,
                        handlerConfig: updatedConfig as Record<string, unknown>,
                      });
                    }}
                    loading={!promptSchema}
                  />
                </Box>
              )
              : (
                <Typography variant='body2' color='text.secondary'>
                  {t('CreateAgent.NoTemplateSelected')}
                </Typography>
              )}
          </StepContainer>
        );

      case 'immediateUse':
        return (
          <StepContainer>
            <Typography variant='h6' gutterBottom>
              {t('CreateAgent.ImmediateUse')}
            </Typography>
            <Typography variant='body2' color='text.secondary' gutterBottom>
              {t('CreateAgent.ImmediateUseDescription')}
            </Typography>

            {temporaryAgentDefinition && previewAgentId
              ? (
                <Box sx={{ flex: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                  <ChatTabContent
                    tab={{
                      id: `preview-${previewAgentId}`,
                      type: TabType.CHAT,
                      title: `${temporaryAgentDefinition.name} ${t('CreateAgent.Preview')}`,
                      agentId: previewAgentId,
                      state: TabState.ACTIVE,
                      isPinned: false,
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                    }}
                  />
                </Box>
              )
              : (
                <Typography variant='body2' color='text.secondary'>
                  {isLoading ? t('CreateAgent.CreatingPreview') : t('CreateAgent.NoTemplateSelected')}
                </Typography>
              )}
          </StepContainer>
        );

      default:
        return (
          <StepContainer>
            <Typography variant='h6' gutterBottom>
              Unknown Step: {STEPS[currentStep]}
            </Typography>
            <Typography variant='body2'>
              Current step index: {currentStep}, Step name: {STEPS[currentStep]}
            </Typography>
          </StepContainer>
        );
    }
  };

  return (
    <Container_>
      <Typography variant='h4' gutterBottom>
        {t('CreateAgent.Title')}
      </Typography>

      <Stepper activeStep={currentStep} alternativeLabel sx={{ mb: 4 }}>
        {STEPS.map((step) => (
          <Step key={step}>
            <StepLabel>{t(`CreateAgent.Steps.${step}`)}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <StepSection>
        {renderStepContent()}
      </StepSection>

      <ActionBar>
        <Button
          disabled={currentStep === 0}
          onClick={handleBack}
        >
          {t('CreateAgent.Back')}
        </Button>

        <Box>
          {currentStep === STEPS.length - 1
            ? (
              <Button
                variant='contained'
                onClick={handleSaveAndUse}
                disabled={!temporaryAgentDefinition}
                data-testid='save-and-use-button'
              >
                {t('CreateAgent.SaveAndUse')}
              </Button>
            )
            : (
              <Button
                variant='contained'
                onClick={handleNext}
                disabled={!canProceed()}
                data-testid='next-button'
              >
                {t('CreateAgent.Next')}
              </Button>
            )}
        </Box>
      </ActionBar>
    </Container_>
  );
};

export default CreateNewAgentContent;
