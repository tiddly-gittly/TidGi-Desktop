import { i18n } from '@services/libs/i18n';
import { assertPortableLlmJsonValue, type PortableLlmJsonValue, type ToolSchemaInput, toolSchemaToJsonSchema } from 'memeloop';

const schemaMaps = new Set(['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas']);
const schemaArrays = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
const schemaChildren = new Set([
  'items',
  'additionalItems',
  'contains',
  'additionalProperties',
  'unevaluatedProperties',
  'propertyNames',
  'not',
  'if',
  'then',
  'else',
  'unevaluatedItems',
  'contentSchema',
]);

function translateMetadata(schema: PortableLlmJsonValue): void {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) return;
  for (const key of ['title', 'description']) {
    const text = schema[key];
    if (typeof text === 'string') schema[key] = i18n.t(text, { ns: 'agent', defaultValue: text });
  }
  for (const [key, value] of Object.entries(schema)) {
    if (schemaMaps.has(key) && value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.values(value).forEach(translateMetadata);
    } else if (schemaArrays.has(key) && Array.isArray(value)) {
      value.forEach(translateMetadata);
    } else if (schemaChildren.has(key)) {
      if (Array.isArray(value)) value.forEach(translateMetadata);
      else translateMetadata(value);
    }
  }
}

/** Translate detached request metadata at use time, never the Zod parser or example data. */
export function localizeToolSchema(schema: ToolSchemaInput): Record<string, PortableLlmJsonValue> {
  const projected = toolSchemaToJsonSchema(schema);
  assertPortableLlmJsonValue(projected);
  translateMetadata(projected);
  return projected;
}
