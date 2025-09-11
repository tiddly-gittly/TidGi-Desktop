import { i18n } from '@services/libs/i18n';
import { z } from 'zod/v4';

/**
 * Build a tool content string from a Zod schema's JSON Schema meta and supplied examples.
 * Inputs:
 *  - schema: Zod schema object
 *  - toolId: string tool id (for header)
 *  - examples: optional array of example strings (preformatted tool_use)
 */
export function schemaToToolContent(schema: z.ZodType) {
  const schemaUnknown: unknown = z.toJSONSchema(schema, { target: 'draft-7' });

  let parameterLines = '';
  let schemaTitle = '';
  let schemaDescription = '';

  if (schemaUnknown && typeof schemaUnknown === 'object' && schemaUnknown !== null) {
    const s = schemaUnknown as Record<string, unknown>;
    schemaTitle = s.title && typeof s.title === 'string'
      ? s.title
      : '';
    schemaDescription = s.description && typeof s.description === 'string'
      ? s.description
      : '';
    const props = s.properties as Record<string, unknown> | undefined;
    const requiredArray = Array.isArray(s.required) ? (s.required as string[]) : [];
    if (props) {
      parameterLines = Object.keys(props)
        .map((key) => {
          const property = props[key] as Record<string, unknown> | undefined;
          let type = property && typeof property.type === 'string' ? property.type : 'string';
          let desc = '';
          if (property) {
            if (typeof property.description === 'string') {
              // Try to translate the description if it looks like an i18n key
              desc = property.description.startsWith('Schema.')
                ? i18n.t(property.description)
                : property.description;
            } else if (property.title && typeof property.title === 'string') {
              // Try to translate the title if it looks like an i18n key
              desc = property.title.startsWith('Schema.')
                ? i18n.t(property.title)
                : property.title;
            }

            // Handle enum values
            if (property.enum && Array.isArray(property.enum)) {
              const enumValues = property.enum.map(value => `"${String(value)}"`).join(', ');
              desc = desc ? `${desc} (${enumValues})` : `Options: ${enumValues}`;
              type = 'enum';
            }
          }
          const required = requiredArray.includes(key)
            ? i18n.t('Tool.Schema.Required')
            : i18n.t('Tool.Schema.Optional');
          return `- ${key} (${type}, ${required}): ${desc}`;
        })
        .join('\n');
    }
  }

  const toolId = (schemaUnknown && typeof schemaUnknown === 'object' && schemaUnknown !== null && (schemaUnknown as Record<string, unknown>).title)
    ? String((schemaUnknown as Record<string, unknown>).title)
    : 'tool';

  let exampleSection = '';
  if (schemaUnknown && typeof schemaUnknown === 'object' && schemaUnknown !== null) {
    const s = schemaUnknown as Record<string, unknown>;
    const ex = s.examples;
    if (Array.isArray(ex)) {
      exampleSection = ex
        .map(exampleItem => `- <tool_use name="${toolId}">${JSON.stringify(exampleItem)}</tool_use>`)
        .join('\n');
    }
  }

  // Try to translate schema description if it looks like an i18n key
  const finalDescription = schemaDescription
    ? (schemaDescription.startsWith('在Wiki')
        ? schemaDescription // Already translated Chinese text
        : i18n.t(schemaDescription))
    : schemaTitle; // Fallback to title if no description

  const descriptionLabel = i18n.t('Tool.Schema.Description');
  const parametersLabel = i18n.t('Tool.Schema.Parameters');
  const examplesLabel = i18n.t('Tool.Schema.Examples');

  const content = `\n## ${toolId}\n**${descriptionLabel}**: ${finalDescription}\n**${parametersLabel}**:\n${parameterLines}\n\n**${examplesLabel}**:\n${exampleSection}\n`;
  return content;
}
