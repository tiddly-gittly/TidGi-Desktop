import { identity } from 'lodash';
import { z } from 'zod/v4';

/** Placeholder to trigger VSCode i18nAlly extension to show translated text. */
export const t = identity;

/**
 * Wiki parameters used when sourceType is "wiki" in retrievalAugmentedGeneration
 * Defines how to retrieve content from a wiki workspace
 * @example
 * ```json
 * {
 *   "workspaceName": "wiki1",
 *   "filter": "[[Title1]]"
 * }
 * ```
 */
export const WikiParameterSchema = z.object({
  workspaceName: z.string().meta({
    title: t('Schema.Wiki.WorkspaceNameTitle'),
    description: t('Schema.Wiki.WorkspaceName'),
  }),
  filter: z.string().meta({
    title: t('Schema.Wiki.FilterTitle'),
    description: t('Schema.Wiki.Filter'),
  }),
}).meta({
  title: t('Schema.Wiki.Title'),
  description: t('Schema.Wiki.Description'),
});

/**
 * Trigger conditions that determine when a dynamic modification procedure should be applied to prompt.
 * Used across various dynamicModificationType values to conditionally apply modifications
 * @example
 * ```json
 * {
 *   "search": "人名xxx",
 *   "model": {
 *     "preset": "defaultLite",
 *     "system": "你是一个对话分析师...",
 *     "user": "用户的消息内容为:<<input>>..."
 *   }
 * }
 * ```
 */
export const TriggerSchema = z.object({
  search: z.string().optional().meta({
    title: t('Schema.Trigger.SearchTitle'),
    description: t('Schema.Trigger.Search'),
  }),
  randomChance: z.number().min(0).max(1).optional().meta({
    title: t('Schema.Trigger.RandomChanceTitle'),
    description: t('Schema.Trigger.RandomChance'),
  }),
  filter: z.string().optional().meta({
    title: t('Schema.Trigger.FilterTitle'),
    description: t('Schema.Trigger.Filter'),
  }),
  model: z.object({
    preset: z.string().optional().meta({
      title: t('Schema.Trigger.Model.PresetTitle'),
      description: t('Schema.Trigger.Model.Preset'),
    }),
    system: z.string().optional().meta({
      title: t('Schema.Trigger.Model.SystemTitle'),
      description: t('Schema.Trigger.Model.System'),
    }),
    user: z.string().optional().meta({
      title: t('Schema.Trigger.Model.UserTitle'),
      description: t('Schema.Trigger.Model.User'),
    }),
  }).optional().meta({
    title: t('Schema.Trigger.Model.Title'),
    description: t('Schema.Trigger.Model.Description'),
  }),
}).meta({
  title: t('Schema.Trigger.Title'),
  description: t('Schema.Trigger.Description'),
});

/**
 * Base position parameters used by multiple modification types
 * Defines where to insert content relative to a target element
 * @example
 * ```json
 * {
 *   "position": "relative",
 *   "targetId": "default-history",
 *   "bottom": 2
 * }
 * ```
 */
export const PositionParameterSchema = z.object({
  position: z.enum(['relative', 'absolute', 'before', 'after']).meta({
    title: t('Schema.Position.TypeTitle'),
    description: t('Schema.Position.Type'),
    enumOptions: [
      { value: 'relative', label: t('Schema.Position.Types.Relative') },
      { value: 'absolute', label: t('Schema.Position.Types.Absolute') },
      { value: 'before', label: t('Schema.Position.Types.Before') },
      { value: 'after', label: t('Schema.Position.Types.After') },
    ],
  }),
  targetId: z.string().meta({
    title: t('Schema.Position.TargetIdTitle'),
    description: t('Schema.Position.TargetId'),
  }),
  bottom: z.number().optional().meta({
    title: t('Schema.Position.BottomTitle'),
    description: t('Schema.Position.Bottom'),
  }),
  top: z.number().optional().meta({
    title: t('Schema.Position.TopTitle'),
    description: t('Schema.Position.Top'),
  }),
}).meta({
  title: t('Schema.Position.Title'),
  description: t('Schema.Position.Description'),
});

/**
 * Common tool configuration parameters used by multiple modification types
 * Defines where to place tool prompts and execution results
 * @example
 * ```json
 * {
 *   "toolListPosition": {
 *     "position": "before",
 *     "targetId": "default-before-tool"
 *   },
 *   "resultPosition": {
 *     "position": "before",
 *     "targetId": "default-tool-result"
 *   }
 * }
 * ```
 */
export const ToolConfigurationParameterSchema = z.object({
  toolListPosition: PositionParameterSchema.optional().meta({
    title: t('Schema.ToolConfig.ToolListPositionTitle'),
    description: t('Schema.ToolConfig.ToolListPosition'),
  }),
  resultPosition: PositionParameterSchema.optional().meta({
    title: t('Schema.ToolConfig.ResultPositionTitle'),
    description: t('Schema.ToolConfig.ResultPosition'),
  }),
}).meta({
  title: t('Schema.ToolConfig.Title'),
  description: t('Schema.ToolConfig.Description'),
});

export type WikiParameter = z.infer<typeof WikiParameterSchema>;
export type Trigger = z.infer<typeof TriggerSchema>;
export type PositionParameter = z.infer<typeof PositionParameterSchema>;
export type ToolConfigurationParameter = z.infer<typeof ToolConfigurationParameterSchema>;
