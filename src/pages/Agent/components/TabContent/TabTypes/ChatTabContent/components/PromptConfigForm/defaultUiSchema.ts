import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export function useDefaultUiSchema(uiSchemaOverride: Record<string, unknown> = {}): Record<string, unknown> {
  const defaultUiSchemaReference = useRef<Record<string, unknown> | null>(null);
  const { t } = useTranslation('agent');

  const defaultUiSchema = useMemo(() => {
    if (!defaultUiSchemaReference.current) {
      defaultUiSchemaReference.current = {
        'ui:title': t('Prompt.ConfigurationEditor'),
        'ui:description': t('Prompt.ConfigurationDescription'),
        'ui:order': ['prompts', 'promptDynamicModification', 'response', 'responseDynamicModification', '*'],
        prompts: {
          'ui:title': t('Schema.PromptPart.PromptsList'),
          'ui:description': t('Schema.PromptPart.Description'),
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
          'ui:title': t('Schema.PromptDynamicModification.DynamicModifications'),
          'ui:description': t('Schema.PromptDynamicModification.SchemaDescription'),
          'ui:options': {
            orderable: true,
            variant: 'info',
          },
          items: {
            'ui:order': ['id', 'enabled', 'sourceTag', 'targetTag', 'action', '*'],
          },
        },
        response: {
          'ui:title': t('Schema.Response.ResponseSettings'),
          'ui:description': t('Schema.Response.Description'),
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
          'ui:title': t('Schema.ResponseDynamicModification.ResponseModifications'),
          'ui:description': t('Schema.ResponseDynamicModification.Description'),
          'ui:options': {
            orderable: true,
            variant: 'warning',
          },
        },
      };
    }
    return defaultUiSchemaReference.current;
  }, []);

  // Merge default UI schema with provided override - memoized
  const uiSchema = useMemo(() => ({
    ...defaultUiSchema,
    ...uiSchemaOverride,
  }), [defaultUiSchema, uiSchemaOverride]);

  return uiSchema;
}
