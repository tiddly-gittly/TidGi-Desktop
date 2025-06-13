import { FieldProps } from '@rjsf/utils';
import React, { useMemo } from 'react';
import { ConditionalFieldConfig, ExtendedFormContext } from '../index';

/**
 * ConditionalField wraps any field and conditionally shows/hides it based on sibling field values.
 *
 * Key design decisions:
 * 1. Uses `ui:condition` in uiSchema to avoid hardcoding any logic
 * 2. Accesses sibling field values via formContext.rootFormData and path parsing
 * 3. Removes `ui:field` when rendering to prevent infinite recursion
 * 4. Uses useMemo to prevent unnecessary recalculations
 */
export const ConditionalField: React.FC<FieldProps> = (props) => {
  const { uiSchema, registry, idSchema } = props;

  const condition = uiSchema?.['ui:condition'] as ConditionalFieldConfig | undefined;

  // Extract visibility logic into a memoized function to avoid recalculation
  const shouldShow = useMemo(() => {
    if (!condition) return true;

    const { dependsOn, showWhen, hideWhen = false } = condition;
    const formContext = registry.formContext as ExtendedFormContext | undefined;
    const rootFormData = formContext?.rootFormData;

    // If no root form data available, show field by default (graceful fallback)
    if (!rootFormData) return true;

    // Parse the field's path to find its parent object where sibling fields are located
    const fieldPath = idSchema.$id.replace(/^root_/, '');
    const pathParts = fieldPath.split('_');
    pathParts.pop(); // Remove current field name to get parent path

    // Navigate to parent object in the form data tree
    let parentData: unknown = rootFormData;
    for (const part of pathParts) {
      if (parentData && typeof parentData === 'object' && part in parentData) {
        parentData = (parentData as Record<string, unknown>)[part];
      } else {
        // If path navigation fails, show field by default (graceful fallback)
        return true;
      }
    }

    // Get the value of the field this conditional field depends on
    const dependentValue = (parentData as Record<string, unknown>)[dependsOn];

    // Determine if condition is met
    let conditionMet = false;
    if (Array.isArray(showWhen)) {
      // Support multiple acceptable values
      conditionMet = showWhen.includes(String(dependentValue));
    } else {
      // Support single value match
      conditionMet = dependentValue === showWhen;
    }

    // Apply inverse logic if specified
    return hideWhen ? !conditionMet : conditionMet;
  }, [condition, registry.formContext, idSchema.$id]);

  // Hidden fields return nothing
  if (!shouldShow) {
    return null;
  }

  // Render the actual field using RJSF's SchemaField
  const { SchemaField } = registry.fields;

  // Create clean uiSchema without 'ui:field' to prevent infinite recursion
  // This is safe because we're creating a shallow copy first
  const { 'ui:field': _, ...cleanUiSchema } = uiSchema || {};

  return <SchemaField {...props} uiSchema={cleanUiSchema} />;
};
