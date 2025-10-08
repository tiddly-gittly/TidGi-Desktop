import { Box, Button, CircularProgress, Container, Divider, TextField, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import type { RJSFSchema } from '@rjsf/utils';
import type { AgentDefinition } from '@services/agentDefinition/interface';
import { HandlerConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import useDebouncedCallback from 'beautiful-react-hooks/useDebouncedCallback';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatTabContent } from '../../../ChatTabContent';
import { PromptConfigForm } from '../../../ChatTabContent/components/PromptPreviewDialog/PromptConfigForm';
import type { IEditAgentDefinitionTab } from '../../types/tab';
import { TabState, TabType } from '../../types/tab';

interface EditAgentDefinitionContentProps {
  tab: IEditAgentDefinitionTab;
}

const Container_ = styled(Container)`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  max-width: none !important;
  padding: 32px 32px 0 32px;
  overflow: hidden;
  background-color: ${props => props.theme.palette.background.default};
`;

const ScrollableContent = styled(Box)`
  flex: 1;
  overflow-y: auto;
  padding-bottom: 16px;
`;

const SectionContainer = styled(Box)`
  margin-bottom: 32px;
  padding: 24px;
  border-radius: 8px;
  background-color: ${props => props.theme.palette.background.paper};
  border: 1px solid ${props => props.theme.palette.divider};
`;

const SectionTitle = styled(Typography)`
  margin-bottom: 16px;
  font-weight: 600;
  color: ${props => props.theme.palette.primary.main};
`;

const ActionBar = styled(Box)`
  background-color: ${props => props.theme.palette.background.paper};
  padding: 16px 32px;
  border-top: 1px solid ${props => props.theme.palette.divider};
  display: flex;
  justify-content: center;
  flex-shrink: 0;
`;

export const EditAgentDefinitionContent: React.FC<EditAgentDefinitionContentProps> = ({ tab }) => {
  const { t } = useTranslation('agent');

  const [agentDefinition, setAgentDefinition] = useState<AgentDefinition | null>(null);
  const [agentName, setAgentName] = useState('');
  const [previewAgentId, setPreviewAgentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const previewTabId = `preview-${tab.agentDefId}`;
  const [isSaving, setIsSaving] = useState(false);
  const [promptSchema, setPromptSchema] = useState<RJSFSchema | null>(null);
  // Use stable timestamp to avoid recreating tab on every render
  const [tabTimestamp] = useState(() => Date.now());
  const [forceRecreatePreview, setForceRecreatePreview] = useState(0);

  // Load agent definition
  useEffect(() => {
    const loadAgentDefinition = async () => {
      if (!tab.agentDefId) return;

      try {
        setIsLoading(true);
        const definition = await window.service.agentDefinition.getAgentDef(tab.agentDefId);
        if (definition) {
          setAgentDefinition(definition);
          setAgentName(definition.name || '');

          // Agent definition loaded successfully
        }
      } catch (error) {
        void window.service.native.log('error', 'Failed to load agent definition', { error, agentDefId: tab.agentDefId });
        console.error('Failed to load agent definition:', error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadAgentDefinition();
  }, [tab.agentDefId]);

  // Load handler config schema
  useEffect(() => {
    const loadSchema = async () => {
      if (!agentDefinition?.handlerID) {
        // No handlerID found
        return;
      }

      try {
        // Loading handler config schema
        const schema = await window.service.agentInstance.getHandlerConfigSchema(agentDefinition.handlerID);
        // Schema loaded successfully
        setPromptSchema(schema);
      } catch (error) {
        void window.service.native.log('error', 'EditAgentDefinitionContent: Failed to load handler config schema', {
          error,
          handlerID: agentDefinition.handlerID,
        });
        console.error('Failed to load handler config schema:', error);
      }
    };

    void loadSchema();
  }, [agentDefinition?.handlerID]);

  // Auto-save to backend whenever agentDefinition changes (debounced)
  const saveToBackendDebounced = useDebouncedCallback(
    async () => {
      if (!agentDefinition) return;

      try {
        setIsSaving(true);

        // Auto-save agent definition changes

        await window.service.agentDefinition.updateAgentDef(agentDefinition);

        // Agent definition auto-saved successfully
      } catch (error) {
        void window.service.native.log('error', 'Failed to auto-save agent definition', { error, agentDefId: agentDefinition.id });
        console.error('Failed to save agent definition:', error);
      } finally {
        setIsSaving(false);
      }
    },
    [agentDefinition],
    1000,
  );

  useEffect(() => {
    if (agentDefinition) {
      void saveToBackendDebounced();
    }
  }, [agentDefinition, saveToBackendDebounced]);

  // Create preview agent for testing - ensure latest config is saved first
  useEffect(() => {
    const createPreviewAgent = async () => {
      if (!agentDefinition) {
        // No agent definition available
        return;
      }

      // Create preview agent for testing

      try {
        setIsLoading(true);

        // Delete existing preview agent first to ensure we use fresh config
        if (previewAgentId) {
          await window.service.agentInstance.deleteAgent(previewAgentId);
          setPreviewAgentId(null);
        }

        // Flush any pending debounced saves and force save latest config
        await saveToBackendDebounced.flush();
        await window.service.agentDefinition.updateAgentDef(agentDefinition);

        // Create new preview agent
        const agent = await window.service.agentInstance.createAgent(
          agentDefinition.id,
          { preview: true },
        );
        setPreviewAgentId(agent.id);

        // Preview agent created successfully

        // Preview agent creation completed
      } catch (error) {
        void window.service.native.log('error', 'EditAgent: Failed to create preview agent', {
          error: error instanceof Error ? error.message : String(error),
          agentDefId: agentDefinition.id,
        });
        console.error('Failed to create preview agent:', error);
      } finally {
        setIsLoading(false);
      }
    };

    // Create or recreate preview agent when definition changes

    // If forceRecreatePreview > 0, recreate immediately; otherwise debounce to avoid too many recreations during typing
    if (forceRecreatePreview > 0) {
      void createPreviewAgent();
    } else {
      // Debounce preview agent creation to avoid too many recreations during typing
      const debounceTimer = setTimeout(() => {
        void createPreviewAgent();
      }, 500);

      return () => {
        clearTimeout(debounceTimer);
      };
    }
  }, [agentDefinition, saveToBackendDebounced, forceRecreatePreview]); // Recreate preview agent when the agent definition changes or when forced to recreate

  // Cleanup preview agent when component unmounts
  useEffect(() => {
    return () => {
      if (previewAgentId) {
        void window.service.agentInstance.deleteAgent(previewAgentId);
      }
    };
  }, [previewAgentId]);

  const handleAgentNameChange = useCallback((name: string) => {
    setAgentName(name);
    setAgentDefinition(previous => previous ? { ...previous, name } : null);
  }, []);

  const handleAgentDescriptionChange = useCallback((description: string) => {
    setAgentDefinition(previous => previous ? { ...previous, description } : null);
  }, []);

  const handlePromptConfigChange = useCallback((formData: unknown) => {
    setAgentDefinition(
      previous => {
        if (!previous) return null;

        return {
          ...previous,
          handlerConfig: formData as Record<string, unknown>,
        };
      },
    );

    // Force recreate the preview agent to use the new configuration
    setForceRecreatePreview(previous => previous + 1);
  }, []);

  const handleSave = useCallback(async () => {
    if (!agentDefinition) return;

    try {
      setIsLoading(true);

      // Save the final version
      await window.service.agentDefinition.updateAgentDef(agentDefinition);

      // Agent definition saved successfully
    } catch (error) {
      void window.service.native.log('error', 'Failed to save agent definition', { error, agentDefId: agentDefinition.id });
      console.error('Failed to save agent definition:', error);
    } finally {
      setIsLoading(false);
    }
  }, [agentDefinition]);

  if (isLoading && !agentDefinition) {
    return (
      <Container_>
        <Box display='flex' justifyContent='center' alignItems='center' height='100%'>
          <CircularProgress />
          <Typography variant='body1' sx={{ ml: 2 }}>
            {t('EditAgent.Loading')}
          </Typography>
        </Box>
      </Container_>
    );
  }

  if (!agentDefinition) {
    return (
      <Container_>
        <Box display='flex' justifyContent='center' alignItems='center' height='100%'>
          <Typography variant='h6' color='error'>
            {t('EditAgent.AgentNotFound')}
          </Typography>
        </Box>
      </Container_>
    );
  }

  return (
    <Container_>
      <ScrollableContent>
        <Typography variant='h4' gutterBottom>
          {t('EditAgent.Title')}
        </Typography>

        {/* Basic Information Section */}
        <SectionContainer>
          <SectionTitle variant='h6'>
            {t('EditAgent.EditBasic')}
          </SectionTitle>
          <Typography variant='body2' color='text.secondary' gutterBottom>
            {t('EditAgent.EditBasicDescription')}
          </Typography>

          <TextField
            label={t('EditAgent.AgentName')}
            value={agentDefinition?.name || ''}
            onChange={(event) => {
              handleAgentNameChange(event.target.value);
            }}
            margin='normal'
            variant='outlined'
            fullWidth
            placeholder={t('EditAgent.AgentNamePlaceholder')}
            helperText={t('EditAgent.AgentNameHelper')}
            data-testid='edit-agent-name-input'
            slotProps={{
              input: {
                inputProps: {
                  'data-testid': 'edit-agent-name-input-field',
                },
              },
            }}
          />

          <TextField
            label={t('EditAgent.AgentDescription')}
            value={agentDefinition?.description || ''}
            onChange={(event) => {
              handleAgentDescriptionChange(event.target.value);
            }}
            margin='normal'
            variant='outlined'
            fullWidth
            multiline
            minRows={3}
            maxRows={8}
            placeholder={t('EditAgent.AgentDescriptionPlaceholder')}
            helperText={t('EditAgent.AgentDescriptionHelper')}
            data-testid='edit-agent-description-input'
          />
        </SectionContainer>

        {/* Prompt Configuration Section */}
        <SectionContainer>
          <SectionTitle variant='h6'>
            {t('EditAgent.EditPrompt')}
          </SectionTitle>
          <Typography variant='body2' color='text.secondary' gutterBottom>
            {t('EditAgent.EditPromptDescription')}
          </Typography>

          {promptSchema
            ? (
              <Box sx={{ mt: 2 }} data-testid='edit-agent-prompt-form'>
                <PromptConfigForm
                  schema={promptSchema}
                  formData={agentDefinition.handlerConfig as HandlerConfig}
                  onChange={handlePromptConfigChange}
                />
              </Box>
            )
            : (
              <Box sx={{ mt: 2 }}>
                <Typography variant='body2' color='text.secondary'>
                  {t('EditAgent.LoadingPromptConfig')}
                </Typography>
              </Box>
            )}
        </SectionContainer>

        <Divider sx={{ my: 3 }} />

        {/* Live Testing Section */}
        <SectionContainer>
          <SectionTitle variant='h6'>
            {t('EditAgent.ImmediateUse')}
          </SectionTitle>
          <Typography variant='body2' color='text.secondary' gutterBottom>
            {t('EditAgent.ImmediateUseDescription')}
          </Typography>

          {previewAgentId && (
            <Box sx={{ height: '400px', border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <ChatTabContent
                tab={{
                  id: previewTabId,
                  type: TabType.CHAT,
                  state: TabState.ACTIVE,
                  title: t('EditAgent.PreviewChat'),
                  agentId: previewAgentId,
                  isPinned: false,
                  createdAt: tabTimestamp,
                  updatedAt: tabTimestamp,
                }}
              />
            </Box>
          )}
        </SectionContainer>
      </ScrollableContent>

      {/* Action Bar */}
      <ActionBar>
        <Button
          variant='contained'
          size='large'
          onClick={handleSave}
          disabled={isLoading || isSaving || !agentName.trim()}
          data-testid='edit-agent-save-button'
          sx={{ minWidth: 200 }}
        >
          {isSaving
            ? (
              <>
                <CircularProgress size={20} sx={{ mr: 1 }} />
                {t('EditAgent.Saving')}
              </>
            )
            : (
              t('EditAgent.Save')
            )}
        </Button>
      </ActionBar>
    </Container_>
  );
};

export default EditAgentDefinitionContent;
