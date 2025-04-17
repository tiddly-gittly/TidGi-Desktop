import { z } from 'zod';

/**
 * 代表提示词部分的接口定义
 */
export interface IPromptPart {
  id: string;
  text?: string;
  tags?: string[];
  caption?: string;
  content?: string;
  name?: string;
  children?: IPromptPart[];
}

/**
 * Schema for a prompt part in the agent configuration
 */
// 使用前置声明解决递归类型引用问题，并使用具体的接口而不是 any
const PromptPartSchema: z.ZodType<IPromptPart> = z.lazy(() => 
  z.object({
    id: z.string().describe('唯一标识符'),
    text: z.string().optional().describe('提示词文本内容'),
    tags: z.array(z.string()).optional().describe('标签列表，用于分类和引用'),
    caption: z.string().optional().describe('提示词的简短描述'),
    content: z.string().optional().describe('提示词内容，通常用于动态修改的情况'),
    name: z.string().optional().describe('名称，用于特定场景的引用'),
    children: z.array(PromptPartSchema).optional().describe('子提示词列表')
  }).describe('表示提示词的一部分，可以是文本或嵌套结构')
);

/**
 * 提示词配置
 */
export const PromptSchema = z.object({
  id: z.string().describe('提示词配置的唯一标识符'),
  caption: z.string().describe('简短描述'),
  enabled: z.boolean().optional().default(true).describe('是否启用'),
  promptType: z.enum(['system', 'user']).optional().describe('提示词类型'),
  tags: z.array(z.string()).optional().describe('标签列表'),
  text: z.string().optional().describe('提示词内容'),
  children: z.array(PromptPartSchema).optional().describe('子提示词列表'),
}).describe('完整的提示词配置，包含类型和内容');

/**
 * 模型参数配置
 */
export const ModelParametersSchema = z.object({
  temperature: z.number().min(0).max(2).optional().describe('控制输出随机性，越高越随机'),
  frequency_penalty: z.number().optional().describe('频率惩罚，避免重复'),
  presence_penalty: z.number().optional().describe('存在惩罚，鼓励多样性'),
  top_p: z.number().optional().describe('Top-p 采样'),
  top_k: z.number().optional().describe('Top-k 采样'),
  top_a: z.number().optional().describe('Top-a 采样'),
  min_p: z.number().optional().describe('Min-p 采样'),
  repetition_penalty: z.number().optional().describe('重复惩罚'),
  max_context: z.number().optional().describe('最大上下文长度'),
  max_tokens: z.number().optional().describe('最大生成 token 数'),
  stream: z.boolean().optional().default(true).describe('是否使用流式输出'),
  function_calling: z.boolean().optional().describe('是否支持函数调用'),
  show_thoughts: z.boolean().optional().describe('是否展示思考过程'),
  reasoning_effort: z.enum(['low', 'medium', 'high']).optional().describe('推理努力程度'),
  seed: z.number().optional().describe('随机种子，-1 表示随机'),
}).describe('模型生成参数配置');

/**
 * Wiki 参数配置
 */
const WikiParameterSchema = z.object({
  workspaceName: z.string().describe('工作区名称'),
  filter: z.string().describe('筛选条件'),
}).describe('Wiki 参数配置');

/**
 * 触发条件配置
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
 * 位置参数配置
 */
const PositionParameterSchema = z.object({
  position: z.enum(['relative', 'absolute', 'before', 'after']).describe('位置类型'),
  targetId: z.string().describe('目标元素ID'),
  bottom: z.number().optional().describe('底部偏移'),
}).describe('位置参数配置');

/**
 * 完全替换参数配置
 */
const FullReplacementParameterSchema = z.object({
  targetId: z.string().describe('目标元素ID'),
  sourceType: z.enum(['historyOfSession', 'llmResponse']).describe('源类型'),
}).describe('完全替换参数配置');

/**
 * 动态位置参数配置
 */
const DynamicPositionParameterSchema = PositionParameterSchema.extend({}).describe('动态位置参数配置');

/**
 * 检索增强生成参数配置
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
 * 函数参数配置
 */
const FunctionParameterSchema = PositionParameterSchema.extend({
  functionId: z.string().describe('函数ID'),
  timeoutSecond: z.number().optional().describe('超时时间（秒）'),
  timeoutMessage: z.string().optional().describe('超时消息'),
  trigger: TriggerSchema.optional().describe('触发条件'),
}).describe('函数参数配置');

/**
 * JavaScript 工具参数配置
 */
const JavascriptToolParameterSchema = PositionParameterSchema.extend({
  uri: z.string().describe('JavaScript 工具 URI'),
}).describe('JavaScript 工具参数配置');

/**
 * 模型上下文协议参数配置
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
 * 工具调用参数配置
 */
const ToolCallingParameterSchema = z.object({
  targetId: z.string().describe('目标元素ID'),
  match: z.string().describe('匹配模式'),
}).describe('工具调用参数配置');

/**
 * 自动重新生成参数配置
 */
const AutoRerollParameterSchema = z.object({
  targetId: z.string().describe('目标元素ID'),
  search: z.string().describe('搜索关键词'),
  maxRetry: z.number().describe('最大重试次数'),
}).describe('自动重新生成参数配置');

/**
 * 自动回复参数配置
 */
const AutoReplyParameterSchema = z.object({
  targetId: z.string().describe('目标元素ID'),
  text: z.string().describe('回复文本'),
  trigger: TriggerSchema.describe('触发条件'),
  maxAutoReply: z.number().describe('最大自动回复次数'),
}).describe('自动回复参数配置');

/**
 * 提示词动态修改配置
 */
export const PromptDynamicModificationSchema = z.object({
  id: z.string().describe('唯一标识符'),
  caption: z.string().describe('简短描述'),
  description: z.string().optional().describe('详细描述'),
  content: z.string().optional().describe('内容'),
  forbidOverrides: z.boolean().optional().default(false).describe('是否禁止覆盖'),

  // 动态修改类型
  dynamicModificationType: z.enum([
    'fullReplacement',
    'dynamicPosition',
    'retrievalAugmentedGeneration',
    'function',
    'javascriptTool',
    'modelContextProtocol',
  ]).describe('动态修改类型'),

  // 各种参数配置
  fullReplacementParam: FullReplacementParameterSchema.optional().describe('完全替换参数'),
  dynamicPositionParam: DynamicPositionParameterSchema.optional().describe('动态位置参数'),
  retrievalAugmentedGenerationParam: RetrievalAugmentedGenerationParameterSchema.optional().describe('检索增强生成参数'),
  functionParam: FunctionParameterSchema.optional().describe('函数参数'),
  javascriptToolParam: JavascriptToolParameterSchema.optional().describe('JavaScript 工具参数'),
  modelContextProtocolParam: ModelContextProtocolParameterSchema.optional().describe('模型上下文协议参数'),
}).describe('提示词动态修改配置');

/**
 * 响应动态修改配置
 */
export const ResponseDynamicModificationSchema = z.object({
  id: z.string().describe('唯一标识符'),
  caption: z.string().optional().describe('简短描述'),
  dynamicModificationType: z.enum(['fullReplacement']).optional().describe('动态修改类型'),
  fullReplacementParam: FullReplacementParameterSchema.optional().describe('完全替换参数'),
  forbidOverrides: z.boolean().optional().default(false).describe('是否禁止覆盖'),

  // 响应处理类型
  responseProcessingType: z.enum(['toolCalling', 'autoReroll']).optional().describe('响应处理类型'),
  toolCallingParam: ToolCallingParameterSchema.optional().describe('工具调用参数'),
  autoRerollParam: AutoRerollParameterSchema.optional().describe('自动重新生成参数'),

  // 响应类型
  responseType: z.enum(['autoReply']).optional().describe('响应类型'),
  autoReplyParam: AutoReplyParameterSchema.optional().describe('自动回复参数'),
}).describe('响应动态修改配置');

/**
 * 响应配置
 */
export const ResponseSchema = z.object({
  id: z.string().describe('唯一标识符'),
  caption: z.string().describe('简短描述'),
}).describe('响应配置');

/**
 * 代理配置
 */
export const AgentSchema = z.object({
  id: z.string().describe('代理唯一标识符'),
  provider: z.string().describe('提供商'),
  model: z.string().describe('使用的模型'),
  modelParameters: ModelParametersSchema.describe('模型参数配置'),
  prompts: z.array(PromptSchema).describe('提示词配置列表'),
  promptDynamicModification: z.array(PromptDynamicModificationSchema).describe('提示词动态修改配置列表'),
  response: z.array(ResponseSchema).describe('响应配置列表'),
  responseDynamicModification: z.array(ResponseDynamicModificationSchema).describe('响应动态修改配置列表'),
}).describe('代理配置');

/**
 * 默认代理列表
 */
export const DefaultAgentsSchema = z.array(AgentSchema).describe('默认代理配置列表');

/**
 * 默认代理配置类型
 */
export type DefaultAgents = z.infer<typeof DefaultAgentsSchema>;
export type AgentPromptDescription = z.infer<typeof AgentSchema>;
export type ModelParameters = z.infer<typeof ModelParametersSchema>;
export type Prompt = z.infer<typeof PromptSchema>;
export type PromptDynamicModification = z.infer<typeof PromptDynamicModificationSchema>;
export type Response = z.infer<typeof ResponseSchema>;
export type ResponseDynamicModification = z.infer<typeof ResponseDynamicModificationSchema>;
