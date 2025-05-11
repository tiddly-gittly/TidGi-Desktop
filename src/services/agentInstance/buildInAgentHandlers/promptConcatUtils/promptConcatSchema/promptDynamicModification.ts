import { z } from 'zod';

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
  workspaceName: z.string().describe('工作区名称'),
  filter: z.string().describe('筛选器表达式，可以使用 TiddlyWiki 支持的筛选器，从知识库中提取数据'),
}).describe('Wiki 参数配置');

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
  search: z.string().optional().describe('搜索关键词'),
  randomChance: z.number().min(0).max(1).optional().describe('随机触发概率'),
  filter: z.string().optional().describe('筛选条件'),
  model: z.object({
    preset: z.string().optional().describe('预设模型'),
    system: z.string().optional().describe('系统提示词'),
    user: z.string().optional().describe('用户提示词'),
  }).optional().describe('基于模型判断的触发条件'),
}).describe('触发条件配置');

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
  position: z.enum(['relative', 'absolute', 'before', 'after']).describe('位置类型'),
  targetId: z.string().describe('目标元素ID'),
  bottom: z.number().optional().describe('自底部偏移几条消息'),
  top: z.number().optional().describe('自顶部偏移几条消息'),
}).describe('位置参数配置');

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
  targetId: z.string().describe('目标元素ID'),
  sourceType: z.enum(['historyOfSession', 'llmResponse']).describe('源类型'),
}).describe('完全替换参数配置');

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
const DynamicPositionParameterSchema = PositionParameterSchema.extend({}).describe('动态位置参数配置');

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
  sourceType: z.enum(['wiki']).describe('源类型'),
  wikiParam: WikiParameterSchema.optional().describe('Wiki 参数'),
  trigger: TriggerSchema.optional().describe('触发条件'),
  removal: z.object({
    expireAfterChatRound: z.number().optional().describe('多少轮对话后过期'),
    coolDownChatRoundAfterLastShown: z.number().optional().describe('上次展示后冷却轮数'),
  }).optional().describe('移除条件'),
}).describe('检索增强生成参数配置');

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
  functionId: z.string().describe('函数ID'),
  timeoutSecond: z.number().optional().describe('超时时间（秒）'),
  timeoutMessage: z.string().optional().describe('超时消息'),
  trigger: TriggerSchema.optional().describe('触发条件'),
}).describe('函数参数配置');

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
  uri: z.string().describe('JavaScript 工具 URI'),
}).describe('JavaScript 工具参数配置');

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
  id: z.string().describe('MCP 服务器 ID'),
  timeoutSecond: z.number().optional().describe('超时时间（秒）'),
  timeoutMessage: z.string().optional().describe('超时消息'),
  responseProcessing: z.object({
    id: z.array(z.string()).describe('响应处理器 ID'),
  }).optional().describe('响应处理配置'),
  trigger: TriggerSchema.optional().describe('触发条件'),
}).describe('模型上下文协议参数配置');

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
  id: z.string().describe('唯一标识符'),
  caption: z.string().describe('简短描述'),
  description: z.string().optional().describe('详细描述'),
  content: z.string().optional().describe('内容'),
  forbidOverrides: z.boolean().optional().default(false).describe('是否禁止覆盖'),

  // 动态修改过程的类型
  dynamicModificationType: z.enum([
    'fullReplacement',
    'dynamicPosition',
    'retrievalAugmentedGeneration',
    'function',
    'javascriptTool',
    'modelContextProtocol',
  ]).describe('动态修改类型'),

  // 根据 dynamicModificationType 不同，而使用不同的参数配置
  fullReplacementParam: FullReplacementParameterSchema.optional().describe('完全替换参数'),
  dynamicPositionParam: DynamicPositionParameterSchema.optional().describe('动态位置参数'),
  retrievalAugmentedGenerationParam: RetrievalAugmentedGenerationParameterSchema.optional().describe('检索增强生成参数'),
  functionParam: FunctionParameterSchema.optional().describe('函数参数'),
  javascriptToolParam: JavascriptToolParameterSchema.optional().describe('JavaScript 工具参数'),
  modelContextProtocolParam: ModelContextProtocolParameterSchema.optional().describe('模型上下文协议参数'),
}).describe('提示词动态修改配置');

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
