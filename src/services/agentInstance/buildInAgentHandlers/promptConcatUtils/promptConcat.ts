/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { CoreMessage } from 'ai';
import { cloneDeep } from 'lodash';
import { AgentHandlerContext } from '../type';
import { AgentPromptDescription, Prompt, PromptDynamicModification, PromptPart } from './promptConcatSchema';

/**
 * 提示词动态修改处理器函数类型
 */
export type PromptDynamicModificationHandler = (
  prompts: Prompt[],
  modification: PromptDynamicModification,
  context: AgentHandlerContext,
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
export function registerPromptDynamicModificationHandler(
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
export function findPromptById(
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
export function flattenPrompts(prompts: Prompt[]): CoreMessage[] {
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
  const [_userMessage, ...history] = context.agent.messages;

  if (sourceType === 'historyOfSession' && history) {
    // 将历史消息转换为文本
    content = history
      .map(message => {
        const role = message.role === 'agent' ? 'assistant' : message.role;
        const text = message.content;
        return `${role}: ${text}`;
      })
      .join('\n\n');
  }

  // 更新目标提示词
  target.prompt.text = content;
  return prompts;
});

// 注册 dynamicPosition 处理器
registerPromptDynamicModificationHandler('dynamicPosition', (prompts, modification, _context) => {
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

// 可以在这里注册更多处理器...

/**
 * 处理提示词配置，应用动态修改，并返回可用于语言模型的一维提示词数组
 * @param agentConfig 代理配置
 * @param context 处理上下文，包含历史消息等
 * @returns 处理后的一维提示词数组
 */
export function promptConcat(
  agentConfig: AgentPromptDescription,
  context: AgentHandlerContext,
): {
  flatPrompts: CoreMessage[];
  processedPrompts: Prompt[];
} {
  // 1. 复制提示词配置，以便进行修改
  const promptsCopy = cloneDeep(agentConfig.promptConfig.prompts);

  // 2. 应用所有提示词动态修改
  let modifiedPrompts = promptsCopy;
  for (const modification of agentConfig.promptConfig.promptDynamicModification || []) {
    const handler = promptDynamicModificationHandlers[modification.dynamicModificationType];
    if (handler) {
      modifiedPrompts = handler(modifiedPrompts, modification, context);
    }
  }

  // 3. 将树状提示词转换为一维数组
  const flatPrompts = flattenPrompts(modifiedPrompts);

  // 4. 如果有用户消息，添加到提示词中
  const [userMessage] = context.agent.messages;

  if (userMessage) {
    flatPrompts.push({ role: 'user', content: userMessage.content });
  }

  return {
    flatPrompts,
    processedPrompts: modifiedPrompts,
  };
}
