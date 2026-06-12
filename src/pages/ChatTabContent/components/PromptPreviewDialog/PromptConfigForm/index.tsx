import { Box, CircularProgress, Paper, Typography } from '@mui/material';
import { IChangeEvent } from '@rjsf/core';
import type { UiSchema } from '@rjsf/utils';
import { ObjectFieldTemplateProps, RJSFSchema, RJSFValidationError } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import { ArrayItemProvider, Form, buildUiSchema, promptEditorTemplates, promptEditorWidgets } from '@memeloop/react-ui/web';
import { AgentFrameworkConfig } from '@services/agentInstance/schema';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorDisplay } from './components/ErrorDisplay';
import { useDefaultUiSchema } from './defaultUiSchema';
import { fields } from './fields';

/**
 * Extended form context that provides access to root form data
 * for conditional field logic and cross-field validation
 */
export interface ExtendedFormContext {
  rootFormData?: Record<string, unknown>;
  onFormDataChange?: (formData: AgentFrameworkConfig) => void;
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
  formData?: AgentFrameworkConfig;
  /** Change handler for form data */
  onChange?: (formData: AgentFrameworkConfig) => void;
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
  const buildSharedUiSchema = buildUiSchema as unknown as (
    schema?: Record<string, unknown> | null,
    overrides?: UiSchema,
  ) => UiSchema;
  const uiSchema = useDefaultUiSchema(buildSharedUiSchema(schema, uiSchemaOverride as UiSchema), schema);

  const templates = useMemo(() => {
    const sharedTemplates = promptEditorTemplates as unknown as {
      ObjectFieldTemplate?: React.ComponentType<ObjectFieldTemplateProps>;
    } & Record<string, unknown>;
    const rootObjectFieldTemplate = (props: ObjectFieldTemplateProps) => {
      const fieldTemplate = sharedTemplates.ObjectFieldTemplate;
      return fieldTemplate
        ? React.createElement(fieldTemplate, props)
        : props.properties[0]?.content ?? <div />;
    };

    return {
      ...sharedTemplates,
      ObjectFieldTemplate: rootObjectFieldTemplate,
    };
  }, []);

  const handleError = useCallback((errors: RJSFValidationError[]) => {
    setValidationErrors(errors);
    onError?.(errors);
  }, [onError]);

  const handleChange = useCallback((changeEvent: IChangeEvent<AgentFrameworkConfig>) => {
    const formData = changeEvent.formData;
    if (formData) {
      onChange?.(formData);
    }
  }, [onChange]);

  const formContext = useMemo((): ExtendedFormContext => ({
    rootFormData: formData,
    onFormDataChange: onChange,
  }), [formData, onChange]);

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
          <Typography
            variant='body2'
            sx={{
              color: 'text.secondary',
            }}
          >
            {t('Prompt.SchemaNotProvidedDescription')}
          </Typography>
        </Paper>
      </Box>
    );
  }

  const SharedForm = Form as unknown as React.ComponentType<{
    schema: RJSFSchema;
    uiSchema?: UiSchema;
    formData?: AgentFrameworkConfig;
    formContext?: ExtendedFormContext;
    validator: typeof validator;
    onChange?: (event: IChangeEvent<AgentFrameworkConfig>) => void;
    onError?: (errors: RJSFValidationError[]) => void;
    disabled?: boolean;
    templates?: Record<string, unknown>;
    widgets?: Record<string, unknown>;
    fields?: Record<string, unknown>;
    showErrorList?: boolean;
    liveValidate?: 'onChange';
    noHtml5Validate?: boolean;
    children?: React.ReactNode;
  }>;

  return (
    <ArrayItemProvider isInArrayItem={false} arrayItemCollapsible={false} itemData={undefined} itemIndex={0} arrayFieldPath={''} arrayFieldPathSegments={undefined}>
      <Box data-testid='prompt-config-form'>
        <SharedForm
          schema={schema}
          uiSchema={uiSchema as UiSchema}
          formData={formData}
          formContext={formContext}
          validator={validator}
          onChange={handleChange}
          onError={handleError}
          disabled={disabled}
          templates={templates}
          widgets={promptEditorWidgets as Record<string, unknown>}
          fields={fields}
          showErrorList={false}
          liveValidate='onChange'
          noHtml5Validate
        >
          <div />
        </SharedForm>
        <ErrorDisplay errors={validationErrors} />
      </Box>
    </ArrayItemProvider>
  );
};
