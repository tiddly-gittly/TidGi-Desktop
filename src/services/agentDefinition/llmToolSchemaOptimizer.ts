import { i18n } from '@services/libs/i18n';

export interface OptimizedToolSchema {
  description: string;
  parameters: string;
}

interface JSONSchemaProperty {
  default?: unknown;
  description?: string;
  example?: string;
  title?: string;
  type?: string;
}

interface JSONSchema {
  additionalProperties?: boolean;
  description?: string;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  title?: string;
  type?: string;
}

/**
 * Optimize and translate JSON schema for LLM consumption
 * @param schema Original JSON schema from zod
 * @returns Optimized and translated schema in compact text format
 */
export function optimizeToolSchema(schema: JSONSchema): OptimizedToolSchema {
  const translate = (text?: string) => (text ? i18n.t(text, { ns: 'agent' }) : '');
  const description = translate(schema.description ?? schema.title ?? '');

  // Generate compact parameters string
  const parameters: string[] = [];
  const required = schema.required ?? [];

  if (schema.properties && typeof schema.properties === 'object') {
    for (const [key, property] of Object.entries(schema.properties)) {
      const isRequired = required.includes(key);
      const parameterType = property.type ?? 'string';
      const parameterTitle = property.title ? (translate(property.title)) : '';
      const parameterDescription = property.description ? (translate(property.description)) : '';
      const example = property.example ? `示例: ${property.example}` : '';
      // 避免 title/description/参数名重复
      const metaList = [];
      if (parameterTitle && parameterTitle !== key && parameterTitle !== parameterDescription) metaList.push(parameterTitle);
      if (property.default !== undefined) metaList.push(`默认: ${JSON.stringify(property.default)}`);
      if (isRequired) metaList.push(i18n.t('Schema.Required', { ns: 'agent' }));
      if (example) metaList.push(example);
      const metaString = metaList.length ? `（${metaList.join('，')}）` : '';
      // 避免描述重复
      const desc = parameterDescription && parameterDescription !== parameterTitle ? ` - ${parameterDescription}` : '';
      parameters.push(`${key}${metaString}: ${parameterType}${desc}`);
    }
  }

  return {
    description,
    parameters: parameters.join('；'), // Use semicolon for better separation
  };
}

/**
 * Convert tool schema to a format optimized for LLM consumption
 * @param tool Tool object with schema
 * @returns Optimized tool description for LLM
 */
export function optimizeToolForLLM(tool: {
  id: string;
  name: string;
  description: string;
  parameterSchema: JSONSchema;
}) {
  const optimizedSchema = optimizeToolSchema(tool.parameterSchema);
  return {
    id: tool.id,
    name: i18n.t(tool.name, { ns: 'agent' }),
    description: optimizedSchema.description, // 只用 schema.description
    schema: optimizedSchema,
  };
}
