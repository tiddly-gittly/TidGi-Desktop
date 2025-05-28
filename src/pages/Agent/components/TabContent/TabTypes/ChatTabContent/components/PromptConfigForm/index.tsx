import { AgentWithoutMessages } from '@/pages/Agent/store/agentChatStore/types';
import { Box, CircularProgress, Paper, Typography } from '@mui/material';
import Form from '@rjsf/mui';
import { ErrorSchema, ObjectFieldTemplateProps } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import { AgentInstance } from '@services/agentInstance/interface';
import { HandlerConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDefaultUiSchema } from './defaultUiSchema';
import { ArrayFieldTemplate, FieldTemplate, ObjectFieldTemplate, RootObjectFieldTemplate } from './templates';
import { usePromptConfigForm } from './usePromptConfigForm';
import { widgets } from './widgets';

interface PromptConfigFormProps {
  /** JSON Schema for form validation and generation */
  schema?: Record<string, unknown>;
  /** UI schema for layout customization */
  uiSchema?: Record<string, unknown>;
  /** Initial form data */
  formData?: HandlerConfig;
  /** Submit handler for form data */
  onSubmit?: (formData: HandlerConfig) => void;
  /** Change handler for form data */
  onChange?: (formData: HandlerConfig) => void;
  /** Error handler for validation errors */
  onError?: (errors: ErrorSchema) => void;
  /** Agent update handler */
  onUpdate?: (data: Partial<AgentInstance>) => Promise<void>;
  /** Agent instance (without messages) */
  agent?: AgentWithoutMessages;
  /** Whether the form is disabled */
  disabled?: boolean;
  /** Whether to show loading indicator */
  loading?: boolean;
}

/**
 * React JSON Schema Form component for prompt configuration
 * Uses custom templates and widgets for better styling and user experience
 */
export const PromptConfigForm: React.FC<PromptConfigFormProps> = React.memo(({
  schema,
  uiSchema: uiSchemaOverride = {},
  formData: initialFormData,
  onSubmit: externalSubmit,
  onChange: externalChange,
  onError: externalError,
  onUpdate,
  agent,
  disabled = false,
  loading = false,
}) => {
  const { t } = useTranslation('agent');

  // Add debug render tracking in development
  if (process.env.NODE_ENV === 'development') {
    React.useEffect(() => {
      console.log('🔄 PromptConfigForm render with props:', {
        hasSchema: schema && Object.keys(schema).length > 0,
        hasFormData: !!initialFormData,
        hasAgent: !!agent,
        disabled,
        loading,
      });
    });
  }

  const uiSchema = useDefaultUiSchema(uiSchemaOverride);

  const {
    localFormData,
    formKey,
    handleChange,
    handleError,
    handleSubmit,
  } = usePromptConfigForm({
    initialFormData,
    schema,
    onSubmit: externalSubmit,
    onChange: externalChange,
    onError: externalError,
      onUpdate,
    agent,
  });

  if (!schema || Object.keys(schema).length === 0) {
    console.error('PromptConfigForm: No schema provided or fetched. Form cannot be rendered.');
  }

  const templates = useMemo(() => {
    const rootObjectFieldTemplate = (props: ObjectFieldTemplateProps) => {
      const isRootLevel = props.idSchema.$id === 'root';
      return isRootLevel
        ? <RootObjectFieldTemplate {...props} />
        : <ObjectFieldTemplate {...props} />;
    };

    return {
      ArrayFieldTemplate,
      FieldTemplate,
      ObjectFieldTemplate: rootObjectFieldTemplate,
    };
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress size={40} />
      </Box>
    );
  }

  if (!schema || Object.keys(schema).length === 0) {
    return (
      <Box sx={{ width: '100%' }}>
        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 2,
            bgcolor: 'background.paper',
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'error.main',
          }}
        >
          <Typography variant='h6' color='error' gutterBottom>
            {t('Prompt.SchemaNotProvided', 'Schema Not Provided')}
          </Typography>
          <Typography variant='body2' color='text.secondary'>
            {t('Prompt.SchemaNotProvidedDescription', 'No schema was provided or could be fetched. Form cannot be rendered.')}
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Form
      key={formKey}
      schema={schema}
      uiSchema={uiSchema}
      formData={localFormData}
      validator={validator}
      onChange={handleChange}
      onSubmit={handleSubmit}
      onError={handleError}
      disabled={disabled}
      templates={templates}
      widgets={widgets}
      showErrorList={false}
      liveValidate
      noHtml5Validate
    >
      <div />
    </Form>
  );
});
