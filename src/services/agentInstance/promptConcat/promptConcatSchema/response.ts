import { t } from '@services/libs/i18n/placeholder';
import { z } from 'zod/v4';

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
export const ResponseSchema = z.object({
  id: z.string().meta({
    title: t('Schema.Response.IdTitle'),
    description: t('Schema.Response.Id'),
  }),
  caption: z.string().meta({
    title: t('Schema.Response.CaptionTitle'),
    description: t('Schema.Response.Caption'),
  }),
}).meta({
  title: t('Schema.Response.Title'),
  description: t('Schema.Response.Description'),
});

export type Response = z.infer<typeof ResponseSchema>;
