import { identity } from 'lodash';
import { z } from 'zod/v4';
import { FullReplacementParameterSchema, TriggerSchema } from './promptDynamicModification';

/** Placeholder to trigger VSCode i18nAlly extension to show translated text. */
const t = identity;

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
  targetId: z.string().meta({
    title: t('Schema.ToolCalling.TargetIdTitle'),
    description: t('Schema.ToolCalling.TargetId'),
  }),
  match: z.string().meta({
    title: t('Schema.ToolCalling.MatchTitle'),
    description: t('Schema.ToolCalling.Match'),
  }),
}).meta({
  title: t('Schema.ToolCalling.Title'),
  description: t('Schema.ToolCalling.Description'),
});

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
  targetId: z.string().meta({
    title: t('Schema.AutoReroll.TargetIdTitle'),
    description: t('Schema.AutoReroll.TargetId'),
  }),
  search: z.string().meta({
    title: t('Schema.AutoReroll.SearchTitle'),
    description: t('Schema.AutoReroll.Search'),
  }),
  maxRetry: z.number().meta({
    title: t('Schema.AutoReroll.MaxRetryTitle'),
    description: t('Schema.AutoReroll.MaxRetry'),
  }),
}).meta({
  title: t('Schema.AutoReroll.Title'),
  description: t('Schema.AutoReroll.Description'),
});

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
  targetId: z.string().meta({
    title: t('Schema.AutoReply.TargetIdTitle'),
    description: t('Schema.AutoReply.TargetId'),
  }),
  text: z.string().meta({
    title: t('Schema.AutoReply.TextTitle'),
    description: t('Schema.AutoReply.Text'),
  }),
  trigger: TriggerSchema.meta({
    title: t('Schema.AutoReply.TriggerTitle'),
    description: t('Schema.AutoReply.Trigger'),
  }),
  maxAutoReply: z.number().meta({
    title: t('Schema.AutoReply.MaxAutoReplyTitle'),
    description: t('Schema.AutoReply.MaxAutoReply'),
  }),
}).meta({
  title: t('Schema.AutoReply.Title'),
  description: t('Schema.AutoReply.Description'),
});

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
  id: z.string().meta({
    title: t('Schema.ResponseDynamicModification.IdTitle'),
    description: t('Schema.ResponseDynamicModification.Id'),
  }),
  caption: z.string().optional().meta({
    title: t('Schema.ResponseDynamicModification.CaptionTitle'),
    description: t('Schema.ResponseDynamicModification.Caption'),
  }),

  // 对响应内容做修改的过程
  dynamicModificationType: z.enum(['fullReplacement']).optional().meta({
    title: t('Schema.ResponseDynamicModification.DynamicModificationTypeTitle'),
    description: t('Schema.ResponseDynamicModification.DynamicModificationType'),
    enumOptions: [
      { value: 'fullReplacement', label: t('Schema.ResponseDynamicModification.FullReplacementParamTitle') },
    ],
  }),
  fullReplacementParam: FullReplacementParameterSchema.optional().meta({
    title: t('Schema.ResponseDynamicModification.FullReplacementParamTitle'),
    description: t('Schema.ResponseDynamicModification.FullReplacementParam'),
  }),
  forbidOverrides: z.boolean().optional().default(false).meta({
    title: t('Schema.ResponseDynamicModification.ForbidOverridesTitle'),
    description: t('Schema.ResponseDynamicModification.ForbidOverrides'),
  }),

  // 基于响应结果，调用程序做额外处理的过程
  responseProcessingType: z.enum(['toolCalling', 'autoReroll', 'autoReply']).optional().meta({
    title: t('Schema.ResponseDynamicModification.ResponseProcessingTypeTitle'),
    description: t('Schema.ResponseDynamicModification.ResponseProcessingType'),
    enumOptions: [
      { value: 'toolCalling', label: t('Schema.ResponseDynamicModification.ToolCallingParamTitle') },
      { value: 'autoReroll', label: t('Schema.ResponseDynamicModification.AutoRerollParamTitle') },
      { value: 'autoReply', label: t('Schema.ResponseDynamicModification.AutoReplyParamTitle') },
    ],
  }),
  toolCallingParam: ToolCallingParameterSchema.optional().meta({
    title: t('Schema.ResponseDynamicModification.ToolCallingParamTitle'),
    description: t('Schema.ResponseDynamicModification.ToolCallingParam'),
  }),
  autoRerollParam: AutoRerollParameterSchema.optional().meta({
    title: t('Schema.ResponseDynamicModification.AutoRerollParamTitle'),
    description: t('Schema.ResponseDynamicModification.AutoRerollParam'),
  }),
  autoReplyParam: AutoReplyParameterSchema.optional().meta({
    title: t('Schema.ResponseDynamicModification.AutoReplyParamTitle'),
    description: t('Schema.ResponseDynamicModification.AutoReplyParam'),
  }),
}).meta({
  title: t('Schema.ResponseDynamicModification.Title'),
  description: t('Schema.ResponseDynamicModification.Description'),
});

export { AutoReplyParameterSchema, AutoRerollParameterSchema, ToolCallingParameterSchema };

export type ResponseDynamicModification = z.infer<typeof ResponseDynamicModificationSchema>;
