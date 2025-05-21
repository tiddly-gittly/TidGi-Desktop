import { i18n } from '@services/libs/i18n';
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
  targetId: z.string().describe(i18n.t('Schema.ToolCalling.TargetId')),
  match: z.string().describe(i18n.t('Schema.ToolCalling.Match')),
}).describe(i18n.t('Schema.ToolCalling.Description'));

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
  targetId: z.string().describe(i18n.t('Schema.AutoReroll.TargetId')),
  search: z.string().describe(i18n.t('Schema.AutoReroll.Search')),
  maxRetry: z.number().describe(i18n.t('Schema.AutoReroll.MaxRetry')),
}).describe(i18n.t('Schema.AutoReroll.Description'));

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
  targetId: z.string().describe(i18n.t('Schema.AutoReply.TargetId')),
  text: z.string().describe(i18n.t('Schema.AutoReply.Text')),
  trigger: TriggerSchema.describe(i18n.t('Schema.AutoReply.Trigger')),
  maxAutoReply: z.number().describe(i18n.t('Schema.AutoReply.MaxAutoReply')),
}).describe(i18n.t('Schema.AutoReply.Description'));

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
  id: z.string().describe(i18n.t('Schema.ResponseDynamicModification.Id')),
  caption: z.string().optional().describe(i18n.t('Schema.ResponseDynamicModification.Caption')),

  // 对响应内容做修改的过程
  dynamicModificationType: z.enum(['fullReplacement']).optional().describe(i18n.t('Schema.ResponseDynamicModification.DynamicModificationType')),
  fullReplacementParam: FullReplacementParameterSchema.optional().describe(i18n.t('Schema.ResponseDynamicModification.FullReplacementParam')),
  forbidOverrides: z.boolean().optional().default(false).describe(i18n.t('Schema.ResponseDynamicModification.ForbidOverrides')),

  // 基于响应结果，调用程序做额外处理的过程
  responseProcessingType: z.enum(['toolCalling', 'autoReroll', 'autoReply']).optional().describe(i18n.t('Schema.ResponseDynamicModification.ResponseProcessingType')),
  toolCallingParam: ToolCallingParameterSchema.optional().describe(i18n.t('Schema.ResponseDynamicModification.ToolCallingParam')),
  autoRerollParam: AutoRerollParameterSchema.optional().describe(i18n.t('Schema.ResponseDynamicModification.AutoRerollParam')),
  autoReplyParam: AutoReplyParameterSchema.optional().describe(i18n.t('Schema.ResponseDynamicModification.AutoReplyParam')),
}).describe(i18n.t('Schema.ResponseDynamicModification.Description'));

export { AutoReplyParameterSchema, AutoRerollParameterSchema, ToolCallingParameterSchema };

export type ResponseDynamicModification = z.infer<typeof ResponseDynamicModificationSchema>;
