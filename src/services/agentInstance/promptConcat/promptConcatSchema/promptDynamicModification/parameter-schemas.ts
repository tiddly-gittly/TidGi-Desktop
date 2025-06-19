import { identity } from 'lodash';
import { z } from 'zod/v4';
import { PositionParameterSchema, TriggerSchema, WikiParameterSchema } from './base-schemas';

/** Placeholder to trigger VSCode i18nAlly extension to show translated text. */
export const t = identity;

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
export const FullReplacementParameterSchema = z.object({
  targetId: z.string().meta({
    title: t('Schema.FullReplacement.TargetIdTitle'),
    description: t('Schema.FullReplacement.TargetId'),
  }),
  sourceType: z.enum(['historyOfSession', 'llmResponse']).meta({
    title: t('Schema.FullReplacement.SourceTypeTitle'),
    description: t('Schema.FullReplacement.SourceType'),
    enumOptions: [
      { value: 'historyOfSession', label: t('Schema.FullReplacement.SourceTypes.HistoryOfSession') },
      { value: 'llmResponse', label: t('Schema.FullReplacement.SourceTypes.LlmResponse') },
    ],
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
export const DynamicPositionParameterSchema = PositionParameterSchema.extend({}).meta({
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
export const RetrievalAugmentedGenerationParameterSchema = PositionParameterSchema.extend({
  sourceType: z.enum(['wiki']).meta({
    title: t('Schema.RAG.SourceTypeTitle'),
    description: t('Schema.RAG.SourceType'),
    enumOptions: [
      { value: 'wiki', label: t('Schema.RAG.SourceTypes.Wiki') },
    ],
  }),
  wikiParam: WikiParameterSchema.optional().meta({
    title: t('Schema.RAG.WikiParamTitle'),
    description: t('Schema.RAG.WikiParam'),
  }),
  trigger: TriggerSchema.optional().meta({
    title: t('Schema.RAG.TriggerTitle'),
    description: t('Schema.RAG.Trigger'),
  }),
  toolListPosition: PositionParameterSchema.optional().meta({
    title: t('Schema.ToolConfig.ToolListPositionTitle'),
    description: t('Schema.ToolConfig.ToolListPosition'),
  }),
  resultPosition: PositionParameterSchema.optional().meta({
    title: t('Schema.ToolConfig.ResultPositionTitle'),
    description: t('Schema.ToolConfig.ResultPosition'),
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
export const FunctionParameterSchema = PositionParameterSchema.extend({
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
export const JavascriptToolParameterSchema = PositionParameterSchema.extend({
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
export const ModelContextProtocolParameterSchema = PositionParameterSchema.extend({
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
  toolListPosition: PositionParameterSchema.optional().meta({
    title: t('Schema.ToolConfig.ToolListPositionTitle'),
    description: t('Schema.ToolConfig.ToolListPosition'),
  }),
  resultPosition: PositionParameterSchema.optional().meta({
    title: t('Schema.ToolConfig.ResultPositionTitle'),
    description: t('Schema.ToolConfig.ResultPosition'),
  }),
  trigger: TriggerSchema.optional().meta({
    title: t('Schema.MCP.TriggerTitle'),
    description: t('Schema.MCP.Trigger'),
  }),
}).meta({
  title: t('Schema.MCP.Title'),
  description: t('Schema.MCP.Description'),
});

export type FullReplacementParameter = z.infer<typeof FullReplacementParameterSchema>;
export type DynamicPositionParameter = z.infer<typeof DynamicPositionParameterSchema>;
export type RetrievalAugmentedGenerationParameter = z.infer<typeof RetrievalAugmentedGenerationParameterSchema>;
export type FunctionParameter = z.infer<typeof FunctionParameterSchema>;
export type JavascriptToolParameter = z.infer<typeof JavascriptToolParameterSchema>;
export type ModelContextProtocolParameter = z.infer<typeof ModelContextProtocolParameterSchema>;
