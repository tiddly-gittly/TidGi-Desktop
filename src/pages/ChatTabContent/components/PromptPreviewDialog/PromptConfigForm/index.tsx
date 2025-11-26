import { Box, CircularProgress, Paper, Typography } from '@mui/material';
import { IChangeEvent } from '@rjsf/core';
import Form from '@rjsf/mui';
import { ObjectFieldTemplateProps, RJSFSchema, RJSFValidationError } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import { agentFrameworkConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorDisplay } from './components/ErrorDisplay';
import { ArrayItemProvider } from './context/ArrayItemContext';
import { useDefaultUiSchema } from './defaultUiSchema';
import { fields } from './fields';
import { ArrayFieldItemTemplate, ArrayFieldTemplate, FieldTemplate, ObjectFieldTemplate, RootObjectFieldTemplate } from './templates';
import { widgets } from './widgets';

/**
 * Extended form context that provides access to root form data
 * for conditional field logic and cross-field validation
 */
export interface ExtendedFormContext {
  rootFormData?: Record<string, unknown>;
}

/**
 * Configuration for conditional field display logic
 * Used with ConditionalField to show/hide fields based on other field values
 */
export interface ConditionalFieldConfig {
  dependsOn: string;
  showWhen: string | string[];
  hideWhen?: boolean;
}

interface PromptConfigFormProps {
  /** JSON Schema for form validation and generation */
  schema?: RJSFSchema;
  /** UI schema for layout customization */
  uiSchema?: Record<string, unknown>;
  /** Initial form data */
  formData?: agentFrameworkConfig;
  /** Change handler for form data */
  onChange?: (formData: agentFrameworkConfig) => void;
  /** Error handler for form validation errors */
  onError?: (errors: RJSFValidationError[]) => void;
  /** Whether the form is disabled */
  disabled?: boolean;
  /** Whether to show loading indicator */
  loading?: boolean;
}

/**
 * React JSON Schema Form component for prompt configuration
 * Uses custom templates and widgets for better styling and user experience
 */
export const PromptConfigForm: React.FC<PromptConfigFormProps> = ({
  schema,
  uiSchema: uiSchemaOverride,
  formData,
  onChange,
  onError,
  disabled = false,
  loading = false,
}) => {
  const { t } = useTranslation('agent');
  const [validationErrors, setValidationErrors] = useState<RJSFValidationError[]>([]);
  const uiSchema = useDefaultUiSchema(uiSchemaOverride, schema);

  const templates = useMemo(() => {
    const rootObjectFieldTemplate = (props: ObjectFieldTemplateProps) => {
      const isRootLevel = props.fieldPathId?.$id === 'root';
      return isRootLevel
        ? <RootObjectFieldTemplate {...props} />
        : <ObjectFieldTemplate {...props} />;
    };

    return {
      ArrayFieldTemplate,

      ArrayFieldItemTemplate,
      FieldTemplate,
      ObjectFieldTemplate: rootObjectFieldTemplate,
    };
  }, []);

  const handleError = useCallback((errors: RJSFValidationError[]) => {
    setValidationErrors(errors);
    onError?.(errors);
  }, [onError]);

  const handleChange = useCallback((changeEvent: IChangeEvent<agentFrameworkConfig>) => {
    const formData = changeEvent.formData;
    if (formData) {
      onChange?.(formData);
    }
  }, [onChange]);

  const formContext = useMemo((): ExtendedFormContext => ({
    rootFormData: formData,
  }), [formData]);

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
            {t('Prompt.SchemaNotProvided')}
          </Typography>
          <Typography variant='body2' color='text.secondary'>
            {t('Prompt.SchemaNotProvidedDescription')}
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <ArrayItemProvider isInArrayItem={false} arrayItemCollapsible={false}>
      <Box data-testid='prompt-config-form'>
        <Form
          schema={schema}
          uiSchema={uiSchema}
          formData={formData}
          formContext={formContext}
          validator={validator}
          onChange={handleChange}
          onError={handleError}
          disabled={disabled}
          templates={templates}
          widgets={widgets}
          fields={fields}
          showErrorList={false}
          liveValidate='onChange'
          noHtml5Validate
        >
          <div />
        </Form>
        <ErrorDisplay errors={validationErrors} />
      </Box>
    </ArrayItemProvider>
  );
};
