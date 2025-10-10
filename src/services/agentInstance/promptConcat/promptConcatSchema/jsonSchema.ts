import { z } from 'zod/v4';
import { getHandlerConfigSchema } from './index';

/**
 * Get the dynamically generated JSON Schema for handler configuration
 * This allows the frontend to generate forms based on currently registered plugins
 *
 * Pre-generated JSON Schema for just the handler configuration part
 * This can be used when only the handler configuration is needed
 * It contains the prompt configuration without the parent agent structure
 *
 * Description field is i18n key, use i18nAlly extension to see it on VSCode. And use react-i18next to translate it on frontend.
 */
export function getPromptConcatHandlerConfigJsonSchema() {
  const dynamicHandlerConfigSchema = getHandlerConfigSchema();
  return z.toJSONSchema(dynamicHandlerConfigSchema, { target: 'draft-7' });
}
