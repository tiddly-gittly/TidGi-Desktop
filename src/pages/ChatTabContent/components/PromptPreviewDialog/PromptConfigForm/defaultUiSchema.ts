import { UiSchema } from '@rjsf/utils';
import { useMemo } from 'react';

export function useDefaultUiSchema(
  uiSchemaOverride: UiSchema = {},
  schema?: Record<string, unknown>,
): UiSchema {
  return useMemo(() => {
    return {
      // We put uiSchema into the meta of zod, so it will be available in the top level
      ...(schema?.uiSchema || {}) as UiSchema,
      ...uiSchemaOverride,
    };
  }, [schema, uiSchemaOverride]);
}
