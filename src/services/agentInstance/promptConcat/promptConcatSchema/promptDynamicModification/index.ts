import { z } from 'zod/v4';
import {
  DynamicPositionParameterSchema,
  FullReplacementParameterSchema,
  FunctionParameterSchema,
  JavascriptToolParameterSchema,
  ModelContextProtocolParameterSchema,
  RetrievalAugmentedGenerationParameterSchema,
} from './parameter-schemas';
export { RetrievalAugmentedGenerationParameter } from './parameter-schemas';
import { identity } from 'lodash';

/** Placeholder to trigger VSCode i18nAlly extension to show translated text. */
export const t = identity;

/**
 * Main schema for prompt dynamic modifications
 * Defines how to dynamically modify prompts based on various conditions and sources
 * Each dynamicModificationType requires its corresponding parameter schema:
 * - fullReplacement → fullReplacementParam
 * - dynamicPosition → dynamicPositionParam
 * - retrievalAugmentedGeneration → retrievalAugmentedGenerationParam
 * - function → functionParam
 * - javascriptTool → javascriptToolParam
 * - modelContextProtocol → modelContextProtocolParam
 * @example
 * ```json
 * {
 *   "id": "efe5be74-540d-487d-8a05-7377e486953d",
 *   "dynamicModificationType": "fullReplacement",
 *   "fullReplacementParam": {
 *     "targetId": "default-history",
 *     "sourceType": "historyOfSession"
 *   },
 *   "caption": "聊天历史",
 *   "forbidOverrides": true
 * }
 * ```
 */
export const PromptDynamicModificationSchema = z.object({
  id: z.string().meta({
    title: t('Schema.PromptDynamicModification.IdTitle'),
    description: t('Schema.PromptDynamicModification.Id'),
  }),
  caption: z.string().meta({
    title: t('Schema.PromptDynamicModification.CaptionTitle'),
    description: t('Schema.PromptDynamicModification.Caption'),
  }),
  content: z.string().optional().meta({
    title: t('Schema.PromptDynamicModification.ContentTitle'),
    description: t('Schema.PromptDynamicModification.Content'),
  }),
  forbidOverrides: z.boolean().optional().default(false).meta({
    title: t('Schema.PromptDynamicModification.ForbidOverridesTitle'),
    description: t('Schema.PromptDynamicModification.ForbidOverrides'),
  }),

  // 动态修改过程的类型
  dynamicModificationType: z.enum([
    'fullReplacement',
    'dynamicPosition',
    'retrievalAugmentedGeneration',
    'function',
    'javascriptTool',
    'modelContextProtocol',
  ]).meta({
    title: t('Schema.PromptDynamicModification.DynamicModificationTypeTitle'),
    description: t('Schema.PromptDynamicModification.DynamicModificationType'),
    enumOptions: [
      { value: 'fullReplacement', label: t('Schema.PromptDynamicModification.FullReplacementParamTitle') },
      { value: 'dynamicPosition', label: t('Schema.PromptDynamicModification.DynamicPositionParamTitle') },
      { value: 'retrievalAugmentedGeneration', label: t('Schema.PromptDynamicModification.RAGParamTitle') },
      { value: 'function', label: t('Schema.PromptDynamicModification.FunctionParamTitle') },
      { value: 'javascriptTool', label: t('Schema.PromptDynamicModification.JavascriptToolParamTitle') },
      { value: 'modelContextProtocol', label: t('Schema.PromptDynamicModification.MCPParamTitle') },
    ],
  }),

  // 根据 dynamicModificationType 不同，而使用不同的参数配置
  fullReplacementParam: FullReplacementParameterSchema.optional().meta({
    title: t('Schema.PromptDynamicModification.FullReplacementParamTitle'),
    description: t('Schema.PromptDynamicModification.FullReplacementParam'),
  }),
  dynamicPositionParam: DynamicPositionParameterSchema.optional().meta({
    title: t('Schema.PromptDynamicModification.DynamicPositionParamTitle'),
    description: t('Schema.PromptDynamicModification.DynamicPositionParam'),
  }),
  retrievalAugmentedGenerationParam: RetrievalAugmentedGenerationParameterSchema.optional().meta({
    title: t('Schema.PromptDynamicModification.RAGParamTitle'),
    description: t('Schema.PromptDynamicModification.RAGParam'),
  }),
  functionParam: FunctionParameterSchema.optional().meta({
    title: t('Schema.PromptDynamicModification.FunctionParamTitle'),
    description: t('Schema.PromptDynamicModification.FunctionParam'),
  }),
  javascriptToolParam: JavascriptToolParameterSchema.optional().meta({
    title: t('Schema.PromptDynamicModification.JavascriptToolParamTitle'),
    description: t('Schema.PromptDynamicModification.JavascriptToolParam'),
  }),
  modelContextProtocolParam: ModelContextProtocolParameterSchema.optional().meta({
    title: t('Schema.PromptDynamicModification.MCPParamTitle'),
    description: t('Schema.PromptDynamicModification.MCPParam'),
  }),
}).meta({
  title: t('Schema.PromptDynamicModification.Title'),
  description: t('Schema.PromptDynamicModification.SchemaDescription'),
});

export type PromptDynamicModification = z.infer<typeof PromptDynamicModificationSchema>;
export { TriggerSchema } from './base-schemas';
export { FullReplacementParameterSchema } from './parameter-schemas';
