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
export const ToolCallingParameterSchema = z.object({
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
  responseProcessingType: z.enum(['toolCalling']).optional().meta({
    title: t('Schema.ResponseDynamicModification.ResponseProcessingTypeTitle'),
    description: t('Schema.ResponseDynamicModification.ResponseProcessingType'),
    enumOptions: [
      { value: 'toolCalling', label: t('Schema.ResponseDynamicModification.ToolCallingParamTitle') },
    ],
  }),
  toolCallingParam: ToolCallingParameterSchema.optional().meta({
    title: t('Schema.ResponseDynamicModification.ToolCallingParamTitle'),
    description: t('Schema.ResponseDynamicModification.ToolCallingParam'),
  }),
}).meta({
  title: t('Schema.ResponseDynamicModification.Title'),
  description: t('Schema.ResponseDynamicModification.Description'),
});

export type ResponseDynamicModification = z.infer<typeof ResponseDynamicModificationSchema>;
