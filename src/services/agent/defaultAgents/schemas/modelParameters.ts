import { z } from 'zod';

/**
 * Model generation parameters that control AI response behavior
 * These settings affect how the AI generates text and its characteristics
 * @example
 * ```json
 * {
 *   "temperature": 0.85,
 *   "frequency_penalty": 0.5,
 *   "presence_penalty": 0.65,
 *   "top_p": 0.9,
 *   "max_context": 65535,
 *   "max_tokens": 3000,
 *   "stream": true,
 *   "show_thoughts": true,
 *   "reasoning_effort": "medium",
 *   "seed": -1
 * }
 * ```
 */
export const ModelParametersSchema = z.object({
  temperature: z.number().min(0).max(2).optional().describe('控制输出随机性，越高越随机'),
  frequency_penalty: z.number().optional().describe('频率惩罚，避免重复'),
  presence_penalty: z.number().optional().describe('存在惩罚，鼓励多样性'),
  top_p: z.number().optional().describe('Top-p 采样'),
  top_k: z.number().optional().describe('Top-k 采样'),
  top_a: z.number().optional().describe('Top-a 采样'),
  min_p: z.number().optional().describe('Min-p 采样'),
  repetition_penalty: z.number().optional().describe('重复惩罚'),
  max_context: z.number().optional().describe('最大上下文长度'),
  max_tokens: z.number().optional().describe('最大生成 token 数'),
  stream: z.boolean().optional().default(true).describe('是否使用流式输出'),
  function_calling: z.boolean().optional().describe('是否支持函数调用'),
  show_thoughts: z.boolean().optional().describe('是否展示思考过程'),
  reasoning_effort: z.enum(['low', 'medium', 'high']).optional().describe('推理努力程度'),
  seed: z.number().optional().describe('随机种子，-1 表示随机'),
}).describe('模型生成参数配置');

/**
 * Provider and model identifier configuration
 * Specifies which AI provider and model to use for the agent
 * @example
 * ```json
 * {
 *   "provider": "siliconflow",
 *   "model": "Qwen/Qwen2.5-7B-Instruct"
 * }
 * ```
 */
export const ProviderModelSchema = z.object({
  provider: z.string().describe('提供商'),
  model: z.string().describe('使用的模型'),
}).describe('模型提供商和模型名称配置');

export type ModelParameters = z.infer<typeof ModelParametersSchema>;
export type ProviderModel = z.infer<typeof ProviderModelSchema>;
