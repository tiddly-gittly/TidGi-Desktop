import { container } from '@services/container';
import { IExternalAPIService } from '@services/externalAPI/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { CoreMessage } from 'ai';
import { cloneDeep, pick } from 'lodash';
import { TaskContext, TaskYieldUpdate } from '../server';
import { TextPart } from '../server/schema';
import { DefaultAgentsSchema, Prompt, PromptDynamicModification, PromptPart } from './schemas';

/**
 * 提示词动态修改处理器函数类型
 */
type PromptDynamicModificationHandler = (
  prompts: Prompt[],
  modification: PromptDynamicModification,
  context: TaskContext,
) => Prompt[];

/**
 * 提示词动态修改处理器注册表
 */
const promptDynamicModificationHandlers: Record<string, PromptDynamicModificationHandler | undefined> = {};

/**
 * 注册提示词动态修改处理器
 * @param type 处理器类型
 * @param handler 处理函数
 */
function registerPromptDynamicModificationHandler(
  type: string,
  handler: PromptDynamicModificationHandler,
): void {
  promptDynamicModificationHandlers[type] = handler;
}

/**
 * 根据ID在提示词数组中查找提示词
 * @param prompts 提示词数组
 * @param id 目标ID
 * @returns 找到的提示词对象及其所在的父数组和索引
 */
function findPromptById(
  prompts: Prompt[] | PromptPart[],
  id: string,
): { prompt: Prompt | PromptPart; parent: (Prompt | PromptPart)[]; index: number } | undefined {
  for (let index = 0; index < prompts.length; index++) {
    const prompt = prompts[index];
    if (prompt.id === id) {
      return { prompt, parent: prompts, index: index };
    }
    if (prompt.children) {
      const found = findPromptById(prompt.children, id);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

/**
 * 将树状提示词结构转换为一维数组，用于语言模型输入
 * @param prompts 树状提示词数组
 * @returns 一维提示词数组
 */
function flattenPrompts(prompts: Prompt[]): CoreMessage[] {
  const result: CoreMessage[] = [];

  // 递归处理提示词树
  function processPrompt(prompt: Prompt | PromptPart): string {
    let text = prompt.text || '';
    if (prompt.children) {
      for (const child of prompt.children) {
        text += processPrompt(child);
      }
    }
    return text;
  }

  // 处理每个顶层提示词
  for (const prompt of prompts) {
    if (!prompt.enabled) continue;

    const content = processPrompt(prompt);
    if (content.trim()) {
      result.push({
        role: prompt.role || 'system',
        content,
      });
    }
  }

  return result;
}

// 注册 fullReplacement 处理器
registerPromptDynamicModificationHandler('fullReplacement', (prompts, modification, context) => {
  if (!modification.fullReplacementParam) return prompts;

  const { targetId, sourceType } = modification.fullReplacementParam;
  const target = findPromptById(prompts, targetId);

  if (!target) return prompts;

  // 根据源类型获取内容
  let content = '';
  if (sourceType === 'historyOfSession' && context.history) {
    // 将历史消息转换为文本
    content = context.history
      .map(message => {
        const role = message.role === 'agent' ? 'assistant' : message.role;
        const text = message.parts
          .filter(part => 'text' in part && part.text)
          .map(part => (part as any).text)
          .join('\n');
        return `${role}: ${text}`;
      })
      .join('\n\n');
  }

  // 更新目标提示词
  target.prompt.text = content;
  return prompts;
});

// 注册 dynamicPosition 处理器
registerPromptDynamicModificationHandler('dynamicPosition', (prompts, modification, context) => {
  if (!modification.dynamicPositionParam || !modification.content) return prompts;

  const { targetId, position } = modification.dynamicPositionParam;
  const target = findPromptById(prompts, targetId);

  if (!target) return prompts;

  // 创建新的提示词部分
  const newPart: PromptPart = {
    id: `dynamic-${Date.now()}`,
    text: modification.content,
  };

  // 根据位置插入
  if (position === 'before') {
    target.parent.splice(target.index, 0, newPart);
  } else if (position === 'after') {
    target.parent.splice(target.index + 1, 0, newPart);
  } else if (position === 'relative') {
    // 简化实现，仅考虑添加到目标提示词的children
    if (!target.prompt.children) {
      target.prompt.children = [];
    }
    target.prompt.children.push(newPart);
  }

  return prompts;
});

// 这里可以注册更多处理器...

/**
 * 示例代理处理器
 * 根据 TaskContext 中的 promptConfig 来处理用户消息并生成响应
 *
 * @param context - 任务上下文，包含用户消息和任务信息
 */
export async function* exampleAgentHandler(context: TaskContext) {
  // Send working status first
  yield {
    state: 'working',
    message: {
      role: 'agent',
      parts: [{ text: 'Processing your message...' }],
    },
  } as TaskYieldUpdate;

  // Get external API service
  const externalAPIService = container.get<IExternalAPIService>(serviceIdentifier.ExternalAPI);

  // 1. 从 context 中获取 promptConfig
  if (!context.task.aiConfig) {
    yield {
      state: 'completed',
      message: {
        role: 'agent',
        parts: [{ text: 'AI configuration not found. Please check agent setup.' }],
      },
    } as TaskYieldUpdate;
    return;
  }

  // 解析 aiConfig 中的 promptConfig
  let aiConfig;
  let agentConfig;
  
  try {
    aiConfig = JSON.parse(context.task.aiConfig);
    
    if (!aiConfig.promptConfig) {
      yield {
        state: 'completed',
        message: {
          role: 'agent',
          parts: [{ text: 'Prompt configuration not found in AI config. Please check agent setup.' }],
        },
      } as TaskYieldUpdate;
      return;
    }

    // 使用 Zod 验证 promptConfig
    agentConfig = DefaultAgentsSchema.parse([aiConfig.promptConfig])[0];
  } catch (error) {
    yield {
      state: 'completed',
      message: {
        role: 'agent',
        parts: [{ text: `Error parsing configuration: ${error instanceof Error ? error.message : String(error)}` }],
      },
    } as TaskYieldUpdate;
    return;
  }

  // Check if cancelled
  if (context.isCancelled()) {
    yield { state: 'canceled' } as TaskYieldUpdate;
    return;
  }

  // Get user message text
  const userText = context.userMessage.parts
    .filter((part): part is TextPart => 'text' in part && part.text !== undefined)
    .map((part) => part.text)
    .join(' ');

  // 1. 复制提示词配置，以便进行修改
  const promptsCopy = cloneDeep(agentConfig.prompts);

  // 2. 应用所有提示词动态修改
  let modifiedPrompts = promptsCopy;
  for (const modification of agentConfig.promptDynamicModification || []) {
    const handler = promptDynamicModificationHandlers[modification.dynamicModificationType];
    if (handler) {
      modifiedPrompts = handler(modifiedPrompts, modification, context);
    }
  }

  // 3. 将树状提示词转换为一维数组
  const flatPrompts = flattenPrompts(modifiedPrompts);

  // 4. 添加用户消息
  flatPrompts.push({ role: 'user', content: userText });

  // 获取AI配置 - 合并 aiConfig 中的 modelParameters
  const modelParams = aiConfig.modelParameters || {};
  const modelConfig = {
    ...agentConfig.modelParameters,
    ...modelParams,
  };

  // 生成AI响应
  let currentRequestId: string | null = null;

  try {
    for await (const response of externalAPIService.generateFromAI(flatPrompts, modelConfig)) {
      if (!currentRequestId && response.requestId) {
        currentRequestId = response.requestId;
      }

      if (context.isCancelled()) {
        if (currentRequestId) {
          await externalAPIService.cancelAIRequest(currentRequestId);
        }
        yield { state: 'canceled' } as TaskYieldUpdate;
        return;
      }

      if (response.status === 'update' || response.status === 'done') {
        yield {
          state: response.status === 'done' ? 'completed' : 'working',
          message: {
            role: 'agent',
            parts: [{ text: response.content }],
          },
        } as TaskYieldUpdate;
      } else if (response.status === 'error') {
        yield {
          state: 'completed',
          message: {
            role: 'agent',
            parts: [{ text: `Error: ${response.errorDetail?.message || 'Unknown error'}` }],
          },
        } as TaskYieldUpdate;
        return;
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    yield {
      state: 'completed',
      message: {
        role: 'agent',
        parts: [{ text: `Unexpected error: ${errorMessage}` }],
      },
    } as TaskYieldUpdate;
  } finally {
    if (context.isCancelled() && currentRequestId) {
      await externalAPIService.cancelAIRequest(currentRequestId);
    }
  }
}
