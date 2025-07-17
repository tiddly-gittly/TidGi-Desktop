import { identity } from 'lodash';
import { z } from 'zod/v4';

/** Placeholder to trigger VSCode i18nAlly extension to show translated text. */
const t = identity;

/**
 * Complete prompt configuration schema
 * Defines a prompt with its metadata and content structure
 * The role field determines whether it's a system or user prompt
 * @example
 * ```json
 * {
 *   "id": "system",
 *   "caption": "Main Prompt",
 *   "enabled": true,
 *   "role": "system",
 *   "children": [
 *     {
 *       "id": "default-main",
 *       "caption": "Child prompt",
 *       "text": "Write {{char}}'s next reply..."
 *     }
 *   ]
 * }
 * ```
 */
export interface IPrompt {
  id: string;
  caption: string;
  enabled?: boolean;
  role?: 'system' | 'user' | 'assistant';
  tags?: string[];
  text?: string;
  children?: IPrompt[];
  source?: string[];
}

export const PromptSchema: z.ZodType<IPrompt> = z.object({
  id: z.string().meta({
    title: t('Schema.Prompt.IdTitle'),
    description: t('Schema.Prompt.Id'),
  }),
  caption: z.string().meta({
    title: t('Schema.Prompt.CaptionTitle'),
    description: t('Schema.Prompt.Caption'),
  }),
  enabled: z.boolean().optional().meta({
    title: t('Schema.Prompt.EnabledTitle'),
    description: t('Schema.Prompt.Enabled'),
  }),
  role: z.enum(['system', 'user', 'assistant']).optional().meta({
    title: t('Schema.Prompt.RoleTitle'),
    description: t('Schema.Prompt.Role'),
    enumOptions: [
      { value: 'system', label: t('Schema.Prompt.RoleType.System') },
      { value: 'user', label: t('Schema.Prompt.RoleType.User') },
      { value: 'assistant', label: t('Schema.Prompt.RoleType.Assistant') },
    ],
  }),
  tags: z.array(z.string()).optional().meta({
    title: t('Schema.Prompt.TagsTitle'),
    description: t('Schema.Prompt.Tags'),
  }),
  text: z.string().optional().meta({
    title: t('Schema.Prompt.TextTitle'),
    description: t('Schema.Prompt.Text'),
  }),
  get children() {
    return z.array(z.lazy(() => PromptSchema)).optional().meta({
      title: t('Schema.Prompt.ChildrenTitle'),
      description: t('Schema.Prompt.Children'),
    });
  },
  source: z.array(z.string()).optional().meta({
    title: t('Schema.Prompt.SourceTitle'),
    description: t('Schema.Prompt.Source'),
  }),
}).meta({
  title: t('Schema.Prompt.Title'),
  description: t('Schema.Prompt.Description'),
}) as z.ZodType<IPrompt>;
