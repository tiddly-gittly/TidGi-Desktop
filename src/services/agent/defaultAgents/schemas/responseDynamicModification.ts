import { z } from 'zod';
import { FullReplacementParameterSchema, TriggerSchema } from './promptDynamicModification';

/**
 * Parameters for responseProcessingType: "toolCalling"
 * Processes tool function calls in the AI response
 * @example
 * ```json
 * {
 *   "targetId": "default-response",
 *   "match": "/<functions_result>(.+)</functions_result>/g"
 * }
 * ```
 */
const ToolCallingParameterSchema = z.object({
  targetId: z.string().describe('目标元素ID'),
  match: z.string().describe('匹配模式'),
}).describe('工具调用参数配置');

/**
 * Parameters for responseProcessingType: "autoReroll"
 * Automatically regenerates responses that match certain criteria
 * @example
 * ```json
 * {
 *   "targetId": "default-response",
 *   "search": "自杀",
 *   "maxRetry": 5
 * }
 * ```
 */
const AutoRerollParameterSchema = z.object({
  targetId: z.string().describe('目标元素ID'),
  search: z.string().describe('搜索关键词'),
  maxRetry: z.number().describe('最大重试次数'),
}).describe('自动重新生成参数配置');

/**
 * Parameters for responseType: "autoReply"
 * Automatically sends follow-up messages based on trigger conditions
 * @example
 * ```json
 * {
 *   "targetId": "default-response",
 *   "text": "继续工作直到你自己觉得工作已经完全完成。",
 *   "trigger": {
 *     "model": {
 *       "preset": "defaultLite",
 *       "system": "你是一个对话分析师...",
 *       "user": "用户的消息内容为:<<input>>..."
 *     }
 *   },
 *   "maxAutoReply": 5
 * }
 * ```
 */
const AutoReplyParameterSchema = z.object({
  targetId: z.string().describe('目标元素ID'),
  text: z.string().describe('回复文本'),
  trigger: TriggerSchema.describe('触发条件'),
  maxAutoReply: z.number().describe('最大自动回复次数'),
}).describe('自动回复参数配置');

/**
 * Main schema for response dynamic modifications
 * Defines how to process and modify AI responses
 * Different modification types require different parameter schemas:
 * - dynamicModificationType: "fullReplacement" → fullReplacementParam
 * - responseProcessingType: "toolCalling" → toolCallingParam
 * - responseProcessingType: "autoReroll" → autoRerollParam
 * - responseType: "autoReply" → autoReplyParam
 * @example
 * ```json
 * {
 *   "id": "a0f1b2c3-4d5e-6f7g-8h9i-j0k1l2m3n4o5",
 *   "responseProcessingType": "toolCalling",
 *   "toolCallingParam": {
 *     "targetId": "default-response",
 *     "match": "/<functions_result>(.+)</functions_result>/g"
 *   }
 * }
 * ```
 */
export const ResponseDynamicModificationSchema = z.object({
  id: z.string().describe('唯一标识符'),
  caption: z.string().optional().describe('简短描述'),

  // 对响应内容做修改的过程
  dynamicModificationType: z.enum(['fullReplacement']).optional().describe('动态修改类型'),
  fullReplacementParam: FullReplacementParameterSchema.optional().describe('完全替换参数'),
  forbidOverrides: z.boolean().optional().default(false).describe('是否禁止覆盖'),

  // 基于响应结果，调用程序做额外处理的过程
  responseProcessingType: z.enum(['toolCalling', 'autoReroll', 'autoReply']).optional().describe('响应处理类型'),
  toolCallingParam: ToolCallingParameterSchema.optional().describe('工具调用参数'),
  autoRerollParam: AutoRerollParameterSchema.optional().describe('自动重新生成参数'),
  autoReplyParam: AutoReplyParameterSchema.optional().describe('自动回复参数'),
}).describe('响应动态修改配置');

export { AutoReplyParameterSchema, AutoRerollParameterSchema, ToolCallingParameterSchema };

export type ResponseDynamicModification = z.infer<typeof ResponseDynamicModificationSchema>;
