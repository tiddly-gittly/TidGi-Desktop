import { container } from '@services/container';
import { IExternalAPIService } from '@services/externalAPI/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import * as fs from 'fs/promises';
import path from 'path';
import { TaskContext, TaskYieldUpdate } from '../server';
import * as schema from '../server/schema';
import { AgentPromptDescription, DefaultAgentsSchema } from './defaultAgentsSchema';

/**
 * 示例代理处理器
 * 根据 defaultAgents.json 中的配置来处理用户消息并生成响应
 *
 * @param context - 任务上下文，包含用户消息和任务信息
 */
export async function* exampleAgentHandler(context: TaskContext) {
  // 发送工作中状态
  yield {
    state: 'working',
    message: {
      role: 'agent',
      parts: [{ text: '正在处理您的消息...' }],
    },
  } as TaskYieldUpdate;

  // 获取 AI API 服务
  const externalAPIService = container.get<IExternalAPIService>(serviceIdentifier.ExternalAPI);

  // 检查是否被取消
  if (context.isCancelled()) {
    yield { state: 'canceled' } as TaskYieldUpdate;
    return;
  }

  try {
    // 读取默认代理配置文件
    const agentsConfigPath = path.join(__dirname, '../defaultAgents.json');
    const agentsConfigContent = await fs.readFile(agentsConfigPath, 'utf-8');

    // 解析配置文件
    const agentsConfig = DefaultAgentsSchema.parse(JSON.parse(agentsConfigContent));

    // 查找示例代理配置
    const exampleAgent = agentsConfig.find(agent => agent.id === 'example-agent');

    if (!exampleAgent) {
      throw new Error('找不到示例代理配置');
    }

    // 获取用户消息文本
    const userText = (context.userMessage.parts as schema.TextPart[])
      .filter((part) => part.text)
      .map((part) => part.text)
      .join(' ');

    // 提供初步反馈
    yield {
      state: 'working',
      message: {
        role: 'agent',
        parts: [{ text: `您说: ${userText}\n\n正在使用 ${exampleAgent.provider} 的 ${exampleAgent.model} 模型生成回复...` }],
      },
    } as TaskYieldUpdate;

    // 构建提示词
    const systemPrompt = generateSystemPrompt(exampleAgent);

    // 获取 AI 配置
    const aiConfig = await externalAPIService.getAIConfig({
      provider: exampleAgent.provider,
      model: exampleAgent.model,
      modelParameters: {
        temperature: exampleAgent.modelParameters.temperature,
        maxTokens: exampleAgent.modelParameters.max_tokens,
        topP: exampleAgent.modelParameters.top_p,
      },
    });

    // 跟踪当前请求 ID 用于可能的取消
    let currentRequestId: string | null = null;

    try {
      // 使用 AI 服务生成回复
      for await (
        const response of externalAPIService.generateFromAI(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText },
          ],
          aiConfig,
        )
      ) {
        // 存储请求 ID 用于潜在的取消
        if (!currentRequestId && response.requestId) {
          currentRequestId = response.requestId;
        }

        // 检查取消
        if (context.isCancelled()) {
          if (currentRequestId) {
            await externalAPIService.cancelAIRequest(currentRequestId);
          }
          yield { state: 'canceled' } as TaskYieldUpdate;
          return;
        }

        // 处理不同的响应状态
        if (response.status === 'update' || response.status === 'done') {
          yield {
            state: response.status === 'done' ? 'completed' : 'working',
            message: {
              role: 'agent',
              parts: [{ text: response.content }],
            },
          } as TaskYieldUpdate;
        } else if (response.status === 'error') {
          // 处理错误响应
          const parts: schema.Part[] = [
            { text: `遇到错误: ${response.errorDetail?.message || '未知错误'}` },
          ];

          // 如果有结构化错误详情，添加它们
          if (response.errorDetail) {
            parts.push({
              type: 'error',
              error: {
                name: response.errorDetail.name,
                code: response.errorDetail.code,
                provider: response.errorDetail.provider,
              },
            });
          }

          yield {
            state: 'failed',
            message: {
              role: 'agent',
              parts,
            },
          } as TaskYieldUpdate;
          return;
        }
      }
    } catch (error) {
      // 处理未预期的错误
      const errorMessage = error instanceof Error ? error.message : String(error);

      yield {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [{ text: `处理时遇到意外错误: ${errorMessage}` }],
        },
      } as TaskYieldUpdate;
    } finally {
      // 确保在需要时取消请求
      if (context.isCancelled() && currentRequestId) {
        await externalAPIService.cancelAIRequest(currentRequestId);
      }
    }
  } catch (error) {
    // 处理配置文件处理错误
    const errorMessage = error instanceof Error ? error.message : String(error);

    yield {
      state: 'failed',
      message: {
        role: 'agent',
        parts: [{ text: `配置处理错误: ${errorMessage}` }],
      },
    } as TaskYieldUpdate;
  }
}

/**
 * 根据代理配置生成系统提示词
 *
 * @param agent - 代理配置
 * @returns 构建好的系统提示词
 */
function generateSystemPrompt(agent: AgentPromptDescription): string {
  // 查找系统提示词
  const systemPrompt = agent.prompts.find(prompt => prompt.id === 'system');
  if (!systemPrompt || !systemPrompt.children) {
    return '你是一个AI助手，请回答用户的问题。';
  }

  // 构建提示词
  let finalPrompt = '';

  // 添加主要提示词
  const mainPrompt = systemPrompt.children.find(child => child.id === 'default-main');
  if (mainPrompt && mainPrompt.text) {
    finalPrompt = `${mainPrompt.text}\n\n`;
  }

  // 添加其他标记为 SystemPrompt 的提示词
  systemPrompt.children
    .filter(child => child.tags?.includes('SystemPrompt') && child.id !== 'default-main')
    .forEach(prompt => {
      if (prompt.text) {
        finalPrompt = `${finalPrompt}${prompt.text}\n\n`;
      }
    });

  // 添加工具提示词，如果存在
  const toolsPrompt = systemPrompt.children.find(child => child.id === 'default-tools');
  if (toolsPrompt && toolsPrompt.children) {
    const beforeTool = toolsPrompt.children.find(child => child.id === 'default-before-tool');
    const postTool = toolsPrompt.children.find(child => child.id === 'default-post-tool');

    if (beforeTool && beforeTool.text && postTool && postTool.text) {
      finalPrompt = `${finalPrompt}${beforeTool.text}\n\n${postTool.text}\n\n`;
    }
  }

  return finalPrompt.trim();
}
