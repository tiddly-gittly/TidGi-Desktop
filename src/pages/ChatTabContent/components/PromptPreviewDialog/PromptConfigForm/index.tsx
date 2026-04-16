import type { ExtendedFormContext as MemeloopExtendedFormContext } from '@memeloop/prompt-editor/web';
import { Box, CircularProgress, Paper, Typography } from '@mui/material';
import { IChangeEvent } from '@rjsf/core';
import Form, { Theme } from '@rjsf/mui';
import { ObjectFieldTemplateProps, RJSFSchema, RJSFValidationError } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';

/** Same as `@memeloop/prompt-editor/web` Theme defaults; use local Theme so bundler resolves one @rjsf/mui + React. */
const baseTemplates = Theme.templates ?? {};
const baseWidgets = Theme.widgets ?? {};
import { AgentFrameworkConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorDisplay } from './components/ErrorDisplay';
import { ArrayItemProvider } from './context/ArrayItemContext';
import { useDefaultUiSchema } from './defaultUiSchema';
import { fields } from './fields';
import { ArrayFieldItemTemplate, ArrayFieldTemplate, FieldTemplate, ObjectFieldTemplate, RootObjectFieldTemplate } from './templates';
import { widgets } from './widgets';

/** Desktop form context: memeloop core + optional callback for cross-field updates */
export interface ExtendedFormContext extends MemeloopExtendedFormContext {
  onFormDataChange?: (formData: AgentFrameworkConfig) => void;
}

export type { ConditionalFieldConfig } from '@memeloop/prompt-editor/web';

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
 * React JSON Schema Form component for prompt configuration.
 * Merges @memeloop/prompt-editor/web Theme templates/widgets with TidGi custom layout/widgets; hooks stay local to avoid duplicate React.
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
      ...baseTemplates,
      ArrayFieldTemplate,
      ArrayFieldItemTemplate,
      FieldTemplate,
      ObjectFieldTemplate: rootObjectFieldTemplate,
    };
  }, []);

  const mergedWidgets = useMemo(() => ({
    ...baseWidgets,
    ...widgets,
  }), []);

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
          widgets={mergedWidgets}
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
