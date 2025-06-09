import { identity } from 'lodash';
import { z } from 'zod/v4';

/** Placeholder to trigger VSCode i18nAlly extension to show translated text. */
const t = identity;

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
const WikiParameterSchema = z.object({
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
const TriggerSchema = z.object({
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
const PositionParameterSchema = z.object({
  position: z.enum(['relative', 'absolute', 'before', 'after']).meta({
    title: t('Schema.Position.TypeTitle'),
    description: t('Schema.Position.Type'),
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
 * Parameters for dynamicModificationType: "fullReplacement"
 * Completely replaces target with content from a specified source
 * @example
 * ```json
 * {
 *   "targetId": "default-history",
 *   "sourceType": "historyOfSession"
 * }
 * ```
 */
const FullReplacementParameterSchema = z.object({
  targetId: z.string().meta({
    title: t('Schema.FullReplacement.TargetIdTitle'),
    description: t('Schema.FullReplacement.TargetId'),
  }),
  sourceType: z.enum(['historyOfSession', 'llmResponse']).meta({
    title: t('Schema.FullReplacement.SourceTypeTitle'),
    description: t('Schema.FullReplacement.SourceType'),
  }),
}).meta({
  title: t('Schema.FullReplacement.Title'),
  description: t('Schema.FullReplacement.Description'),
});

/**
 * Parameters for dynamicModificationType: "dynamicPosition"
 * Positions content at a specific location relative to a target element
 * @example
 * ```json
 * {
 *   "position": "relative",
 *   "targetId": "default-history",
 *   "bottom": 2
 * }
 * ```
 */
const DynamicPositionParameterSchema = PositionParameterSchema.extend({}).meta({
  title: t('Schema.DynamicPosition.Title'),
  description: t('Schema.DynamicPosition.Description'),
});

/**
 * Parameters for dynamicModificationType: "retrievalAugmentedGeneration"
 * Enhances prompts with content retrieved from external sources like a wiki
 * @example
 * ```json
 * {
 *   "position": "relative",
 *   "targetId": "system",
 *   "bottom": 0,
 *   "sourceType": "wiki",
 *   "wikiParam": {
 *     "workspaceName": "wiki1",
 *     "filter": "[[Title1]]"
 *   },
 *   "trigger": {
 *     "search": "人名xxx"
 *   }
 * }
 * ```
 */
const RetrievalAugmentedGenerationParameterSchema = PositionParameterSchema.extend({
  sourceType: z.enum(['wiki']).meta({
    title: t('Schema.RAG.SourceTypeTitle'),
    description: t('Schema.RAG.SourceType'),
  }),
  wikiParam: WikiParameterSchema.optional().meta({
    title: t('Schema.RAG.WikiParamTitle'),
    description: t('Schema.RAG.WikiParam'),
  }),
  trigger: TriggerSchema.optional().meta({
    title: t('Schema.RAG.TriggerTitle'),
    description: t('Schema.RAG.Trigger'),
  }),
  removal: z.object({
    expireAfterChatRound: z.number().optional().meta({
      title: t('Schema.RAG.Removal.ExpireAfterChatRoundTitle'),
      description: t('Schema.RAG.Removal.ExpireAfterChatRound'),
    }),
    coolDownChatRoundAfterLastShown: z.number().optional().meta({
      title: t('Schema.RAG.Removal.CoolDownChatRoundTitle'),
      description: t('Schema.RAG.Removal.CoolDownChatRound'),
    }),
  }).optional().meta({
    title: t('Schema.RAG.Removal.Title'),
    description: t('Schema.RAG.Removal.Description'),
  }),
}).meta({
  title: t('Schema.RAG.Title'),
  description: t('Schema.RAG.Description'),
});

/**
 * Parameters for dynamicModificationType: "function"
 * Executes a function and inserts its result at the specified position
 * @example
 * ```json
 * {
 *   "functionId": "default-ai-search-function",
 *   "timeoutSecond": 15,
 *   "position": "relative",
 *   "targetId": "default-history",
 *   "bottom": 0,
 *   "trigger": {
 *     "model": {
 *       "preset": "defaultLite",
 *       "system": "你是一个对话分析师...",
 *       "user": "用户的消息内容为:<<input>>..."
 *     }
 *   }
 * }
 * ```
 */
const FunctionParameterSchema = PositionParameterSchema.extend({
  functionId: z.string().meta({
    title: t('Schema.Function.FunctionIdTitle'),
    description: t('Schema.Function.FunctionId'),
  }),
  timeoutSecond: z.number().optional().meta({
    title: t('Schema.Function.TimeoutSecondTitle'),
    description: t('Schema.Function.TimeoutSecond'),
  }),
  timeoutMessage: z.string().optional().meta({
    title: t('Schema.Function.TimeoutMessageTitle'),
    description: t('Schema.Function.TimeoutMessage'),
  }),
  trigger: TriggerSchema.optional().meta({
    title: t('Schema.Function.TriggerTitle'),
    description: t('Schema.Function.Trigger'),
  }),
}).meta({
  title: t('Schema.Function.Title'),
  description: t('Schema.Function.Description'),
});

/**
 * Parameters for dynamicModificationType: "javascriptTool"
 * Loads and executes a JavaScript tool at the specified position
 * @example
 * ```json
 * {
 *   "uri": "tidgi://wiki/xxx.js",
 *   "position": "before",
 *   "targetId": "default-post-tool"
 * }
 * ```
 */
const JavascriptToolParameterSchema = PositionParameterSchema.extend({
  uri: z.string().meta({
    title: t('Schema.JavascriptTool.URITitle'),
    description: t('Schema.JavascriptTool.URI'),
  }),
}).meta({
  title: t('Schema.JavascriptTool.Title'),
  description: t('Schema.JavascriptTool.Description'),
});

/**
 * Parameters for dynamicModificationType: "modelContextProtocol"
 * Integrates with external model context protocol servers
 * @example
 * ```json
 * {
 *   "id": "@amap/amap-maps-mcp-server",
 *   "timeoutSecond": 1.5,
 *   "responseProcessing": {
 *     "id": ["a0f1b2c3-4d5e-6f7g-8h9i-j0k1l2m3n4o5"]
 *   },
 *   "position": "after",
 *   "targetId": "default-before-tool",
 *   "trigger": {
 *     "search": "地图,规划行程,路线,导航,交通,出行,天气,地点,位置..."
 *   }
 * }
 * ```
 */
const ModelContextProtocolParameterSchema = PositionParameterSchema.extend({
  id: z.string().meta({
    title: t('Schema.MCP.IdTitle'),
    description: t('Schema.MCP.Id'),
  }),
  timeoutSecond: z.number().optional().meta({
    title: t('Schema.MCP.TimeoutSecondTitle'),
    description: t('Schema.MCP.TimeoutSecond'),
  }),
  timeoutMessage: z.string().optional().meta({
    title: t('Schema.MCP.TimeoutMessageTitle'),
    description: t('Schema.MCP.TimeoutMessage'),
  }),
  responseProcessing: z.object({
    id: z.array(z.string()).meta({
      title: t('Schema.MCP.ResponseProcessing.IdTitle'),
      description: t('Schema.MCP.ResponseProcessing.Id'),
    }),
  }).optional().meta({
    title: t('Schema.MCP.ResponseProcessing.Title'),
    description: t('Schema.MCP.ResponseProcessing.Description'),
  }),
  trigger: TriggerSchema.optional().meta({
    title: t('Schema.MCP.TriggerTitle'),
    description: t('Schema.MCP.Trigger'),
  }),
}).meta({
  title: t('Schema.MCP.Title'),
  description: t('Schema.MCP.Description'),
});

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

export {
  DynamicPositionParameterSchema,
  FullReplacementParameterSchema,
  FunctionParameterSchema,
  JavascriptToolParameterSchema,
  ModelContextProtocolParameterSchema,
  PositionParameterSchema,
  RetrievalAugmentedGenerationParameterSchema,
  TriggerSchema,
  WikiParameterSchema,
};

export type PromptDynamicModification = z.infer<typeof PromptDynamicModificationSchema>;
export type DynamicPositionParameter = z.infer<typeof DynamicPositionParameterSchema>;
export type FullReplacementParameter = z.infer<typeof FullReplacementParameterSchema>;
export type FunctionParameter = z.infer<typeof FunctionParameterSchema>;
export type JavascriptToolParameter = z.infer<typeof JavascriptToolParameterSchema>;
export type ModelContextProtocolParameter = z.infer<typeof ModelContextProtocolParameterSchema>;
export type PositionParameter = z.infer<typeof PositionParameterSchema>;
export type RetrievalAugmentedGenerationParameter = z.infer<typeof RetrievalAugmentedGenerationParameterSchema>;
export type Trigger = z.infer<typeof TriggerSchema>;
export type WikiParameter = z.infer<typeof WikiParameterSchema>;
