import { identity } from 'lodash';
import { z } from 'zod/v4';

/** Placeholder to trigger VSCode i18nAlly extension to show translated text. */
const t = identity;

/**
 * Base interface for prompt parts in the agent configuration
 * Used for building hierarchical prompt structures with parent-child relationships
 * @example
 * ```json
 * {
 *   "id": "default-main",
 *   "tags": ["SystemPrompt"],
 *   "text": "Write <<char>>'s next reply in a fictional chat between <<charIfNotGroup>> and <<user>>."
 * }
 * ```
 */
export interface IPromptPart {
  id: string;
  text?: string;
  tags?: string[];
  caption?: string;
  content?: string;
  name?: string;
  children?: IPromptPart[];
}

/**
 * Schema for prompt parts that can be nested within a prompt
 * Supports recursive structures through lazy evaluation
 * @example
 * ```json
 * {
 *   "id": "default-main",
 *   "tags": ["SystemPrompt"],
 *   "text": "Write <<char>>'s next reply in a fictional chat between <<charIfNotGroup>> and <<user>>."
 * }
 * ```
 */
const PromptPartSchema: z.ZodType<IPromptPart> = z.lazy(() =>
  z.object({
    id: z.string().describe(t('Schema.PromptPart.Id')),
    text: z.string().optional().describe(t('Schema.PromptPart.Text')),
    tags: z.array(z.string()).optional().describe(t('Schema.PromptPart.Tags')),
    caption: z.string().optional().describe(t('Schema.PromptPart.Caption')),
    name: z.string().optional().describe(t('Schema.PromptPart.Name')),
    children: z.array(PromptPartSchema).optional().describe(t('Schema.PromptPart.Children')),
  }).describe(t('Schema.PromptPart.Description'))
);

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
 *       "tags": ["SystemPrompt"],
 *       "text": "Write {{char}}'s next reply..."
 *     }
 *   ]
 * }
 * ```
 */
export const PromptSchema = z.object({
  id: z.string().describe(t('Schema.Prompt.Id')),
  caption: z.string().describe(t('Schema.Prompt.Caption')),
  enabled: z.boolean().optional().describe(t('Schema.Prompt.Enabled')),
  role: z.enum(['system', 'user', 'assistant']).optional().describe(t('Schema.Prompt.Role')),
  tags: z.array(z.string()).optional().describe(t('Schema.Prompt.Tags')),
  text: z.string().optional().describe(t('Schema.Prompt.Text')),
  children: z.array(PromptPartSchema).optional().describe(t('Schema.Prompt.Children')),
}).describe(t('Schema.Prompt.Description'));

export { PromptPartSchema };
export type Prompt = z.infer<typeof PromptSchema>;
export type PromptPart = z.infer<typeof PromptPartSchema>;
