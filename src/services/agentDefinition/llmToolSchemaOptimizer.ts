import { i18n } from '@services/libs/i18n';

export interface OptimizedToolSchema {
  description: string;
  parameters: string;
}

interface JSONSchemaProperty {
  default?: unknown;
  description?: string;
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
  const optimizeText = (text: string): string => {
    // Balanced optimization - remove noise but preserve meaningful content
    return text
      .replace(/^Schema\./, '') // Remove "Schema." prefix only at start
      .replace(/\bTitle\b/gi, '') // Remove "Title" word
      .replace(/\./g, ' ') // Replace dots with spaces
      .replace(/([A-Z])/g, ' $1') // Add space before capitals (camelCase to words)
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim(); // Keep original case for better readability
  };

  const translateAndOptimize = (text: string): string => {
    const translated = i18n.t(text, { ns: 'agent' });
    return optimizeText(translated);
  };

  // Generate compact description
  const description = translateAndOptimize(schema.description ?? schema.title ?? '');

  // Generate compact parameters string
  const parameters: string[] = [];
  const required = schema.required ?? [];

  if (schema.properties && typeof schema.properties === 'object') {
    for (const [key, property] of Object.entries(schema.properties)) {
      const isRequired = required.includes(key);
      const parameterType = property.type ?? 'string';
      const parameterTitle = property.title ? i18n.t(property.title, { ns: 'agent' }) : '';
      const parameterDescription = translateAndOptimize(property.description ?? '');
      const defaultValue = property.default !== undefined ? `default: ${JSON.stringify(property.default)}` : '';
      const requiredMark = isRequired ? 'required' : '';
      const metaList = [parameterTitle, defaultValue, requiredMark].filter(Boolean).join(', ');
      const metaString = metaList ? ` (${metaList})` : '';
      const example = (property as unknown as { example?: string }).example ? `, Example: ${(property as unknown as { example?: string }).example}` : '';
      parameters.push(`${key}${metaString}: ${parameterType} - ${parameterDescription}${example}`);
    }
  }

  return {
    description,
    parameters: parameters.join('; '), // Use semicolon for better separation
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
    name: optimizeTextForLLM(tool.name),
    description: optimizeTextForLLM(tool.description),
    schema: optimizedSchema,
  };
}

/**
 * Helper function to optimize text by removing redundant information and JSON noise
 */
function optimizeTextForLLM(text: string): string {
  const translated = i18n.t(text);
  const finalText = translated === text ? text : translated;

  return finalText
    .replace(/^Schema\./, '') // Remove "Schema." prefix only at start
    .replace(/\bTitle\b/gi, '') // Remove "Title" word
    .replace(/([A-Z])/g, ' $1') // Add space before capitals
    .replace(/\s+/g, ' ') // Clean up multiple spaces
    .trim();
}
