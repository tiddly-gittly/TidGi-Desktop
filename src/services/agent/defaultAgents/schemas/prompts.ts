import { z } from 'zod';

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
    id: z.string().describe('唯一标识符，方便在 PromptDynamicModification 里通过 targetId 引用。'),
    text: z.string().optional().describe('提示词文本内容，可以包含维基文本支持的语法，例如<<变量名>>。'),
    tags: z.array(z.string()).optional().describe('标签列表，用于分类和引用'),
    caption: z.string().optional().describe('提示词的简短描述'),
    name: z.string().optional().describe('名称，用于特定场景的引用'),
    children: z.array(PromptPartSchema).optional().describe('子提示词列表，将从上到下，从外到里地拼接为最终的提示词文本。'),
  }).describe('表示提示词的一部分，可以是文本或嵌套结构')
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
  id: z.string().describe('提示词配置的唯一标识符，方便在 PromptDynamicModification 里通过 targetId 引用。'),
  caption: z.string().describe('简短描述'),
  enabled: z.boolean().optional().default(true).describe('是否启用此提示词，启用的才会拼入到最终的提示词中'),
  role: z.enum(['system', 'user', 'assistant']).optional().describe('OpenAI 兼容接口的提示词角色'),
  tags: z.array(z.string()).optional().describe('标签列表'),
  text: z.string().optional().describe('提示词内容，可以包含维基文本支持的语法，例如<<变量名>>。'),
  children: z.array(PromptPartSchema).optional().describe('子提示词列表，将从上到下，从外到里地拼接为最终的提示词文本。'),
}).describe('完整的提示词配置，包含类型和内容');

export { PromptPartSchema };
export type Prompt = z.infer<typeof PromptSchema>;
export type PromptPart = z.infer<typeof PromptPartSchema>;
