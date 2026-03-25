import type { FieldProps } from '@rjsf/utils';
import React, { useMemo } from 'react';
import type { ConditionalFieldConfig, ExtendedFormContext } from '../index';

/**
 * ConditionalField wraps any field and conditionally shows/hides it based on sibling field values.
 */
export const ConditionalField: React.FC<FieldProps> = (props) => {
  const { uiSchema, registry, fieldPathId } = props;

  const condition = uiSchema?.['ui:condition'] as ConditionalFieldConfig | undefined;

  const shouldShow = useMemo(() => {
    if (!condition) return true;

    const { dependsOn, showWhen, hideWhen = false } = condition;
    const formContext = registry.formContext as ExtendedFormContext | undefined;
    const rootFormData = formContext?.rootFormData;

    if (!rootFormData) return true;

    const fieldPathValue = fieldPathId?.$id ?? '';
    const fieldPath = (typeof fieldPathValue === 'string' ? fieldPathValue : '').replace(/^root_/, '');
    const pathParts = fieldPath.split('_').filter(Boolean);
    pathParts.pop();

    let parentData: unknown = rootFormData;
    for (const part of pathParts) {
      if (parentData && typeof parentData === 'object' && part in parentData) {
        parentData = (parentData as Record<string, unknown>)[part];
      } else {
        return true;
      }
    }

    const dependentValue = (parentData as Record<string, unknown>)[dependsOn];

    let conditionMet = false;
    if (Array.isArray(showWhen)) {
      conditionMet = showWhen.includes(String(dependentValue));
    } else {
      conditionMet = dependentValue === showWhen;
    }

    return hideWhen ? !conditionMet : conditionMet;
  }, [condition, registry.formContext, fieldPathId?.$id]);

  if (!shouldShow) {
    return null;
  }

  const { SchemaField } = registry.fields;
  const { 'ui:field': _, ...cleanUiSchema } = uiSchema || {};

  return <SchemaField {...props} uiSchema={cleanUiSchema} />;
};
