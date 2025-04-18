import { z } from 'zod';
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
  '外部API的响应，通常作为响应动态修改的目标，结构与提示词的一样，可以填写预置内容，也可以作为占位符或容器，由 ResponseDynamicModification 填入外部API的响应的具体内容。',
);

export type Response = z.infer<typeof ResponseSchema>;
