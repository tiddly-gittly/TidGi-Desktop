import { identity } from 'lodash';
import { z } from 'zod/v4';
import { PromptSchema } from './prompts';

/** Placeholder to trigger VSCode i18nAlly extension to show translated text. */
const t = identity;

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
  t('Schema.Response.Description'),
);

export type Response = z.infer<typeof ResponseSchema>;
