/* eslint-disable unicorn/prevent-abbreviations */
import { useAgentChatStore } from '@/pages/Agent/store/agentChatStore/index';
import { useHandlerConfigManagement } from '@/pages/Preferences/sections/ExternalAPI/useHandlerConfigManagement';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import { styled } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import Form, { IChangeEvent } from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import { AgentPromptDescription } from '@services/agentInstance/promptConcat/promptConcatSchema';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

// Define prompt config type alias for easier use
type PromptConfig = AgentPromptDescription['promptConfig'];

// Form container styling
const FormContainer = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  borderRadius: theme.shape.borderRadius,
  maxHeight: '70vh',
  overflow: 'auto',
  '& .MuiFormControl-root': {
    marginBottom: theme.spacing(2),
  },
}));

interface PromptConfigFormProps {
  agentId?: string;
  agentDefId?: string;
  onSave?: (config: PromptConfig) => Promise<void>;
  onCancel?: () => void;
}

export const PromptConfigForm: React.FC<PromptConfigFormProps> = ({
  agentId = '',
  agentDefId = '',
  onSave,
  onCancel,
}) => {
  const { t } = useTranslation('agent');
  const { loading, config, handleConfigChange } = useHandlerConfigManagement({
    agentId,
    agentDefId,
  });
  const { getHandlerId, getHandlerConfigSchema } = useAgentChatStore(useShallow(state => ({
    getHandlerId: state.getHandlerId,
    getHandlerConfigSchema: state.getHandlerConfigSchema,
  })));

  const [handlerId, setHandlerId] = useState<string | undefined>();
  const [formData, setFormData] = useState<PromptConfig | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formSchema, setFormSchema] = useState<Record<string, unknown>>({});
  const [loadingSchema, setLoadingSchema] = useState(true);
  const [handlerError, setHandlerError] = useState<string | null>(null);

  // 从 store 获取 handler ID
  useEffect(() => {
    const fetchHandlerId = async () => {
      try {
        const id = await getHandlerId();
        setHandlerId(id);
        setHandlerError(null);
      } catch (error) {
        console.error('Failed to fetch handler ID:', error);
        setHandlerError(error instanceof Error ? error.message : String(error));
      }
    };

    void fetchHandlerId();
  }, [getHandlerId]);

  // Update form data when configuration is loaded
  useEffect(() => {
    if (!loading && config) {
      setFormData(config);
    }
  }, [loading, config]);

  // Fetch JSON Schema from backend
  useEffect(() => {
    const fetchSchema = async () => {
      try {
        setLoadingSchema(true);
        const schema = await getHandlerConfigSchema();
        setFormSchema(schema);
      } catch (error) {
        console.error('Failed to fetch schema:', error);
      } finally {
        setLoadingSchema(false);
      }
    };

    void fetchSchema();
  }, [getHandlerConfigSchema]);

  // Handle form submission
  const handleSubmit = async (data: PromptConfig): Promise<void> => {
    if (!onSave) return;

    try {
      setIsSubmitting(true);
      await onSave(data);
      console.log('Configuration saved successfully');
    } catch (error) {
      console.error('Failed to save prompt configuration:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle internal save when applying changes
  const handleInternalSave = async (data: PromptConfig): Promise<void> => {
    try {
      setIsSubmitting(true);
      await handleConfigChange(data);
      console.log('Prompt configuration saved successfully');
    } catch (error) {
      console.error('Failed to save prompt configuration:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle form submit from react-jsonschema-form
  const onFormSubmit = (e: IChangeEvent<unknown>): void => {
    if (e.formData && typeof e.formData === 'object') {
      void handleSubmit(e.formData as PromptConfig);
    }
  };

  // Handle form change from react-jsonschema-form
  const onFormChange = (e: IChangeEvent<unknown>): void => {
    if (e.formData && typeof e.formData === 'object') {
      setFormData(e.formData as PromptConfig);
    }
  };

  if (loading || loadingSchema) {
    return (
      <Box display='flex' justifyContent='center' alignItems='center' minHeight={300}>
        <CircularProgress />
      </Box>
    );
  }

  if (handlerError) {
    return (
      <Box display='flex' flexDirection='column' alignItems='center' justifyContent='center' minHeight={300}>
        <Typography variant='body1' color='error'>
          {handlerError}
        </Typography>
      </Box>
    );
  }

  if (!handlerId) {
    return (
      <Box display='flex' flexDirection='column' alignItems='center' justifyContent='center' minHeight={300}>
        <Typography variant='body1' color='textSecondary'>
          {t('Prompt.NoHandlerFound')}
        </Typography>
      </Box>
    );
  }

  if (!config) {
    return (
      <Box display='flex' flexDirection='column' alignItems='center' justifyContent='center' minHeight={300}>
        <Typography variant='body1' color='textSecondary'>
          {t('Prompt.NoConfigFound')}
        </Typography>
      </Box>
    );
  }

  return (
    <FormContainer elevation={0}>
      <Typography variant='h6' gutterBottom color='primary'>
        {t('Prompt.ConfigurationEditor')}
      </Typography>
      <Typography variant='body2' color='textSecondary' component='div'>
        {t('Prompt.ConfigurationDescription')}
      </Typography>

      <Form
        schema={formSchema} // Schema fetched from the server
        formData={formData}
        onChange={onFormChange}
        onSubmit={onFormSubmit}
        validator={validator}
      >
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3, gap: 2 }}>
          {onCancel && (
            <Button
              onClick={() => {
                onCancel();
              }}
              disabled={isSubmitting}
            >
              {t('Cancel', 'Cancel')}
            </Button>
          )}
          <Button
            type='submit'
            variant='contained'
            color='primary'
            disabled={isSubmitting}
            startIcon={isSubmitting ? <CircularProgress size={20} /> : null}
          >
            {isSubmitting ? t('Saving', 'Saving...') : t('Save', 'Save')}
          </Button>
          {!onSave && formData && (
            <Button
              variant='contained'
              color='primary'
              disabled={isSubmitting}
              onClick={() => {
                void handleInternalSave(formData);
              }}
              startIcon={isSubmitting ? <CircularProgress size={20} /> : null}
            >
              {isSubmitting ? t('Applying', 'Applying...') : t('Apply', 'Apply')}
            </Button>
          )}
        </Box>
      </Form>
    </FormContainer>
  );
};
