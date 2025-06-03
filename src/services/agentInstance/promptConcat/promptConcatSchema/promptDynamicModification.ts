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
  workspaceName: z.string().describe(t('Schema.Wiki.WorkspaceName')),
  filter: z.string().describe(t('Schema.Wiki.Filter')),
}).describe(t('Schema.Wiki.Description'));

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
  search: z.string().optional().meta({ description: t('Schema.Trigger.Search') }),
  randomChance: z.number().min(0).max(1).optional().meta({ description: t('Schema.Trigger.RandomChance') }),
  filter: z.string().optional().meta({ description: t('Schema.Trigger.Filter') }),
  model: z.object({
    preset: z.string().optional().meta({ description: t('Schema.Trigger.Model.Preset') }),
    system: z.string().optional().meta({ description: t('Schema.Trigger.Model.System') }),
    user: z.string().optional().meta({ description: t('Schema.Trigger.Model.User') }),
  }).optional().meta({ description: t('Schema.Trigger.Model.Description') }),
}).meta({ description: t('Schema.Trigger.Description') });

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
  position: z.enum(['relative', 'absolute', 'before', 'after']).meta({ description: t('Schema.Position.Type') }),
  targetId: z.string().meta({ description: t('Schema.Position.TargetId') }),
  bottom: z.number().optional().meta({ description: t('Schema.Position.Bottom') }),
  top: z.number().optional().meta({ description: t('Schema.Position.Top') }),
}).meta({ description: t('Schema.Position.Description')});

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
  targetId: z.string().meta({ description: t('Schema.FullReplacement.TargetId') }),
  sourceType: z.enum(['historyOfSession', 'llmResponse']).meta({ description: t('Schema.FullReplacement.SourceType') }),
}).meta({ description: t('Schema.FullReplacement.Description')});

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
const DynamicPositionParameterSchema = PositionParameterSchema.extend({}).describe(t('Schema.DynamicPosition.Description'));

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
  sourceType: z.enum(['wiki']).meta({ description: t('Schema.RAG.SourceType') }),
  wikiParam: WikiParameterSchema.optional().meta({ description: t('Schema.RAG.WikiParam') }),
  trigger: TriggerSchema.optional().meta({ description: t('Schema.RAG.Trigger') }),
  removal: z.object({
    expireAfterChatRound: z.number().optional().meta({ description: t('Schema.RAG.Removal.ExpireAfterChatRound') }),
    coolDownChatRoundAfterLastShown: z.number().optional().meta({ description: t('Schema.RAG.Removal.CoolDownChatRound') }),
  }).optional().meta({ description: t('Schema.RAG.Removal.Description') }),
}).meta({ description: t('Schema.RAG.Description')});

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
  functionId: z.string().meta({ description: t('Schema.Function.FunctionId') }),
  timeoutSecond: z.number().optional().meta({ description: t('Schema.Function.TimeoutSecond') }),
  timeoutMessage: z.string().optional().meta({ description: t('Schema.Function.TimeoutMessage') }),
  trigger: TriggerSchema.optional().meta({ description: t('Schema.Function.Trigger') }),
}).meta({ description: t('Schema.Function.Description')});

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
  uri: z.string().meta({ description: t('Schema.JavascriptTool.URI') }),
}).meta({ description: t('Schema.JavascriptTool.Description')});

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
  id: z.string().meta({ description: t('Schema.MCP.Id') }),
  timeoutSecond: z.number().optional().meta({ description: t('Schema.MCP.TimeoutSecond') }),
  timeoutMessage: z.string().optional().meta({ description: t('Schema.MCP.TimeoutMessage') }),
  responseProcessing: z.object({
    id: z.array(z.string()).meta({ description: t('Schema.MCP.ResponseProcessing.Id') }),
  }).optional().meta({ description: t('Schema.MCP.ResponseProcessing.Description') }),
  trigger: TriggerSchema.optional().meta({ description: t('Schema.MCP.Trigger') }),
}).meta({ description: t('Schema.MCP.Description')});

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
  id: z.string().meta({ description: t('Schema.PromptDynamicModification.Id') }),
  caption: z.string().meta({ description: t('Schema.PromptDynamicModification.Caption') }),
  content: z.string().optional().meta({ description: t('Schema.PromptDynamicModification.Content') }),
  forbidOverrides: z.boolean().optional().default(false).meta({ description: t('Schema.PromptDynamicModification.ForbidOverrides') }),

  // 动态修改过程的类型
  dynamicModificationType: z.enum([
    'fullReplacement',
    'dynamicPosition',
    'retrievalAugmentedGeneration',
    'function',
    'javascriptTool',
    'modelContextProtocol',
  ]).meta({ description: t('Schema.PromptDynamicModification.DynamicModificationType') }),

  // 根据 dynamicModificationType 不同，而使用不同的参数配置
  fullReplacementParam: FullReplacementParameterSchema.optional().meta({ description: t('Schema.PromptDynamicModification.FullReplacementParam') }),
  dynamicPositionParam: DynamicPositionParameterSchema.optional().meta({ description: t('Schema.PromptDynamicModification.DynamicPositionParam') }),
  retrievalAugmentedGenerationParam: RetrievalAugmentedGenerationParameterSchema.optional().meta({ description: t('Schema.PromptDynamicModification.RAGParam') }),
  functionParam: FunctionParameterSchema.optional().meta({ description: t('Schema.PromptDynamicModification.FunctionParam') }),
  javascriptToolParam: JavascriptToolParameterSchema.optional().meta({ description: t('Schema.PromptDynamicModification.JavascriptToolParam') }),
  modelContextProtocolParam: ModelContextProtocolParameterSchema.optional().meta({ description: t('Schema.PromptDynamicModification.MCPParam') }),
}).meta({ description: t('Schema.PromptDynamicModification.SchemaDescription') });

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
