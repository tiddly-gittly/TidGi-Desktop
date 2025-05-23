import SaveIcon from '@mui/icons-material/Save';
import { Box, Button, CircularProgress, Divider, Paper, Tooltip, Typography } from '@mui/material';
import type { IChangeEvent } from '@rjsf/core';
import Form from '@rjsf/mui';
import { ErrorSchema, RJSFValidationError } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import { AgentInstance } from '@services/agentInstance/interface';
import { HandlerConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CustomArrayFieldTemplate } from './templates/ArrayFieldTemplate';
import { CustomFieldTemplate } from './templates/FieldTemplate';
import { CustomObjectFieldTemplate } from './templates/ObjectFieldTemplate';
import { customWidgets } from './widgets';

interface PromptConfigFormProps {
  /** JSON Schema for form validation and generation */
  schema: Record<string, unknown>;
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
  /** Whether the form is disabled */
  disabled?: boolean;
  /** Whether to show the submit button */
  showSubmitButton?: boolean;
  /** Whether to show loading indicator */
  loading?: boolean;
}

/**
 * React JSON Schema Form component for prompt configuration
 * Uses custom templates and widgets for better styling and user experience
 * Features:
 * - Type-safe form handling with zod schema validation
 * - Custom widgets and templates for enhanced visual design
 * - Integration with agent update system
 * - Real-time validation and feedback
 */
export const PromptConfigForm: React.FC<PromptConfigFormProps> = ({
  schema,
  uiSchema: uiSchemaOverride = {},
  formData: initialFormData,
  onSubmit: externalSubmit,
  onChange: externalChange,
  onError: externalError,
  onUpdate,
  disabled = false,
  showSubmitButton = true,
  loading = false,
}) => {
  const { t } = useTranslation('agent');
  const [validationErrors, setValidationErrors] = useState<ErrorSchema[]>([]);
  const [localFormData, setLocalFormData] = useState<HandlerConfig | undefined>(initialFormData);
  const [formKey, setFormKey] = useState<number>(0); // Used to force re-render when schema changes

  // Set form data from initial form data if provided
  useEffect(() => {
    if (initialFormData && initialFormData !== localFormData) {
      setLocalFormData(initialFormData);
      // Force re-render when data is loaded
      setFormKey(previous => previous + 1);
    }
  }, [initialFormData, localFormData]);

  // Log error if no schema is available
  if (!schema) {
    console.error('PromptConfigForm: No schema provided or fetched. Form cannot be rendered.');
  }

  // Enhanced UI schema with better layout and grouping
  const defaultUiSchema = {
    'ui:title': t('Prompt.Configuration'),
    'ui:description': t('Prompt.ConfigurationDescription'),
    'ui:order': ['prompts', 'promptDynamicModification', 'response', 'responseDynamicModification', '*'],
    prompts: {
      'ui:title': t('Prompt.PromptsList'),
      'ui:description': t('Prompt.PromptsDescription'),
      'ui:options': {
        orderable: true,
        variant: 'primary',
      },
      items: {
        'ui:order': ['id', 'caption', 'enabled', 'role', 'text', 'children', '*'],
        children: {
          'ui:options': {
            orderable: true,
          },
          items: {
            'ui:order': ['id', 'text', 'tags', '*'],
          },
        },
      },
    },
    promptDynamicModification: {
      'ui:title': t('Prompt.DynamicModifications'),
      'ui:description': t('Prompt.DynamicModificationsDescription'),
      'ui:options': {
        orderable: true,
        variant: 'info',
      },
      items: {
        'ui:order': ['id', 'enabled', 'sourceTag', 'targetTag', 'action', '*'],
      },
    },
    response: {
      'ui:title': t('Prompt.ResponseSettings'),
      'ui:description': t('Prompt.ResponseDescription'),
      'ui:options': {
        variant: 'success',
      },
      items: {
        'ui:order': ['id', 'enabled', 'type', 'config', '*'],
        config: {
          'ui:options': {
            variant: 'info',
          },
        },
      },
    },
    responseDynamicModification: {
      'ui:title': t('Prompt.ResponseModifications'),
      'ui:description': t('Prompt.ResponseModificationsDescription'),
      'ui:options': {
        orderable: true,
        variant: 'warning',
      },
    },
  };

  // Merge default UI schema with provided override
  const uiSchema = { ...defaultUiSchema, ...uiSchemaOverride };

  const handleChange = (event: IChangeEvent<HandlerConfig, Record<string, unknown>, Record<string, unknown>>) => {
    // 确保我们有一个有效的表单数据对象
    if (event.formData) {
      // TypeScript 类型安全处理
      const updatedFormData: HandlerConfig = event.formData;
      setLocalFormData(updatedFormData);

      if (externalChange) {
        externalChange(updatedFormData);
      }
    }
  };

  const handleError = (errors: RJSFValidationError[]) => {
    // 转换错误为统一格式
    const errorSchemas = errors.map(error => {
      return { [error.property]: { __errors: [error.message] } } as unknown as ErrorSchema;
    });
    setValidationErrors(errorSchemas);

    if (externalError) {
      // 构建一个符合 ErrorSchema 格式的对象
      const combinedErrors = errors.reduce<ErrorSchema>((accumulator, error) => {
        accumulator[error.property] = { __errors: [error.message] };
        return accumulator;
      }, {});
      externalError(combinedErrors);
    }
  };
  const handleSubmit = async (event: IChangeEvent<HandlerConfig, Record<string, unknown>, Record<string, unknown>>) => {
    try {
      // 确保我们有一个有效的表单数据对象
      if (event.formData) {
        // TypeScript 类型安全处理
        const typedFormData: HandlerConfig = event.formData;

        if (externalSubmit) {
          externalSubmit(typedFormData);
        } else if (agent?.id && onUpdate) {
          // 使用提供的更新方法
          await onUpdate({
            id: agent.id,
            handlerConfig: typedFormData,
          });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to submit form data:', errorMessage);
    }
  };

  // Custom field templates and widgets
  const templates = {
    ArrayFieldTemplate: CustomArrayFieldTemplate,
    FieldTemplate: CustomFieldTemplate,
    ObjectFieldTemplate: CustomObjectFieldTemplate,
  };

  // Show loading indicator if in loading state
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress size={40} />
      </Box>
    );
  }

  // Show error message if no schema is available
  if (!schema) {
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
    <Box sx={{ width: '100%' }}>
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 2,
          bgcolor: 'background.paper',
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography variant='h6' gutterBottom>
          {t('Prompt.EditConfiguration')}
        </Typography>
        <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
          {t('Prompt.ConfigurationHelp')}
        </Typography>
        <Divider sx={{ my: 2 }} />

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
          widgets={customWidgets}
          showErrorList={false}
          liveValidate
          noHtml5Validate
        >
          {showSubmitButton && (
            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2 }}>
              {validationErrors.length > 0 && (
                <Typography variant='caption' color='error'>
                  {t('Common.FixErrorsBeforeSaving')}
                </Typography>
              )}
              <Tooltip
                title={validationErrors.length > 0 ? t('Common.FixErrorsBeforeSaving') : ''}
                arrow
              >
                <span>
                  <Button
                    type='submit'
                    variant='contained'
                    color='primary'
                    disabled={disabled || validationErrors.length > 0}
                    startIcon={<SaveIcon />}
                  >
                    {t('Common.Save', 'Save')}
                  </Button>
                </span>
              </Tooltip>
            </Box>
          )}
        </Form>
      </Paper>
    </Box>
  );
};
