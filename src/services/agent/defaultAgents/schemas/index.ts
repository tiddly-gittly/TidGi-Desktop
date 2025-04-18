import { z } from 'zod';
import { ModelParametersSchema, ProviderModelSchema } from './modelParameters';
import { PromptDynamicModificationSchema } from './promptDynamicModification';
import { PromptSchema } from './prompts';
import { ResponseSchema } from './response';
import { ResponseDynamicModificationSchema } from './responseDynamicModification';

/**
 * Agent configuration schema
 * @example
 * ```json
 * {
 *   "id": "example-agent",
 *   "provider": "siliconflow",
 *   "model": "Qwen/Qwen2.5-7B-Instruct",
 *   "modelParameters": { ... },
 *   "prompts": [ ... ],
 *   "promptDynamicModification": [ ... ],
 *   "response": [ ... ],
 *   "responseDynamicModification": [ ... ]
 * }
 * ```
 */
export const AgentSchema = z.object({
  id: z.string().describe('代理唯一标识符'),
  api: ProviderModelSchema.describe('API 提供商和模型名称配置'),
  modelParameters: ModelParametersSchema.describe('模型参数配置'),
  prompts: z.array(PromptSchema).describe('提示词配置列表'),
  promptDynamicModification: z.array(PromptDynamicModificationSchema).describe('提示词动态修改配置列表'),
  response: z.array(ResponseSchema).describe('响应配置列表'),
  responseDynamicModification: z.array(ResponseDynamicModificationSchema).describe('响应动态修改配置列表'),
}).describe('代理配置');

/**
 * Default agents list schema
 * Contains an array of agent configurations
 */
export const DefaultAgentsSchema = z.array(AgentSchema).describe('默认代理配置列表');

export type DefaultAgents = z.infer<typeof DefaultAgentsSchema>;
export type AgentPromptDescription = z.infer<typeof AgentSchema>;

// Re-export all schemas and types
export * from './modelParameters';
export * from './promptDynamicModification';
export * from './prompts';
export * from './response';
export * from './responseDynamicModification';
