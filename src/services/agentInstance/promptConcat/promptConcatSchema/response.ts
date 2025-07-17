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
export const ResponseSchema = z.object({
  id: z.string().meta({
    title: t('Schema.Response.IdTitle'),
    description: t('Schema.Response.Id'),
  }),
  caption: z.string().meta({
    title: t('Schema.Response.CaptionTitle'),
    description: t('Schema.Response.Caption'),
  }),
  enabled: z.boolean().optional().meta({
    title: t('Schema.Response.EnabledTitle'),
    description: t('Schema.Response.Enabled'),
  }),
  role: z.enum(['system', 'user', 'assistant']).optional().meta({
    title: t('Schema.Response.RoleTitle'),
    description: t('Schema.Response.Role'),
  }),
  tags: z.array(z.string()).optional().meta({
    title: t('Schema.Response.TagsTitle'),
    description: t('Schema.Response.Tags'),
  }),
  text: z.string().optional().meta({
    title: t('Schema.Response.TextTitle'),
    description: t('Schema.Response.Text'),
  }),
  get children() {
    return z.array(ResponseSchema).optional().meta({
      title: t('Schema.Response.ChildrenTitle'),
      description: t('Schema.Response.Children'),
    });
  },
  source: z.array(z.string()).optional().meta({
    title: t('Schema.Response.SourceTitle'),
    description: t('Schema.Response.Source'),
  }),
}).meta({
  title: t('Schema.Response.Title'),
  description: t('Schema.Response.Description'),
});

export type Response = z.infer<typeof ResponseSchema>;
