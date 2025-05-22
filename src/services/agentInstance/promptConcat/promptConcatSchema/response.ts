import { i18n } from '@services/libs/i18n';
import { z } from 'zod/v4';
import { PromptSchema } from './prompts';

/**
 * Basic response configuration schema
 * Defines identifiers for AI responses that can be referenced by response modifications
 * Usually serves as a target for responseDynamicModification operations
 * @example
 * ```json
 * {
 *   "id": "default-response",
 *   "caption": "LLM response"
 * }
 * ```
 */
export const ResponseSchema = PromptSchema.extend({}).describe(
  i18n.t('Schema.Response.Description'),
);

export type Response = z.infer<typeof ResponseSchema>;
