import { container } from '@services/container';
import { IExternalAPIService } from '@services/externalAPI/interface';
import { IAgentService } from '@services/agent/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { TaskContext, TaskYieldUpdate } from '../server';
import { TextPart } from '../server/schema';
import { processPrompts } from './promptProcessor';

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

  // 获取服务实例
  const externalAPIService = container.get<IExternalAPIService>(serviceIdentifier.ExternalAPI);
  const agentService = container.get<IAgentService>(serviceIdentifier.Agent);

  // 获取提示词配置，如果上下文中已有就使用，否则从服务中获取
  const agentConfig = context.task.aiConfig;
  if (!agentConfig) {
    yield {
      state: 'completed',
      message: {
        role: 'agent',
        parts: [{ text: 'AI configuration not found. Please check agent setup.' }],
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

  // 使用通用处理函数处理提示词
  const { flatPrompts } = processPrompts(agentConfig, {
    history: context.history,
    userMessage: userText,
  });

  // 获取最新的 AI 配置 - 使用 agentService 的新方法获取
  // 这样即使用户在对话过程中修改了配置，也能获取到最新设置
  const aiConfig = await agentService.getAIConfigByIds(context.task.id, context.agentId);
  const modelConfig = aiConfig.modelParameters || {};

  // 生成AI响应
  let currentRequestId: string | null = null;

  try {
    for await (const response of externalAPIService.generateFromAI(flatPrompts, aiConfig)) {
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
