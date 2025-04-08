import { createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { logger } from '@services/libs/log';
import { streamText } from 'ai';

import type { AIMessage, AIProvider, AISessionConfig } from './interface';

type AIStreamResult = ReturnType<typeof streamText>;

export function createProviderClient(provider: AIProvider, apiKey: string) {
  switch (provider) {
    case 'openai':
      return createOpenAI({ apiKey });
    case 'siliconflow':
      return createOpenAICompatible({
        name: 'siliconflow',
        apiKey,
        baseURL: 'https://api.siliconflow.cn/v1',
      });
    case 'deepseek':
      return createDeepSeek({ apiKey });
    case 'anthropic':
      return createAnthropic({ apiKey });
    default:
      throw new Error(`Unsupported AI provider: ${provider as unknown as string}`);
  }
}

export function streamFromProvider(
  config: AISessionConfig,
  messages: AIMessage[],
  signal: AbortSignal,
  apiKey: string,
): AIStreamResult {
  const { provider, model, temperature = 0.7, systemPrompt = 'You are a helpful assistant.' } = config;

  logger.info(`Using AI provider: ${provider}, model: ${model}`);

  try {
    if (!apiKey) {
      throw new Error(`API key for ${provider} not found`);
    }

    const client = createProviderClient(provider, apiKey);

    return streamText({
      model: client(model),
      system: systemPrompt,
      messages,
      temperature,
      abortSignal: signal,
    });
  } catch (error) {
    if (!error) {
      logger.error(`${provider} streaming error:`, error);
      throw new Error(`${provider} error: Unknown error`);
    } else if ((error as Error).message.includes('401')) {
      throw new Error(`${provider} authentication failed: Invalid API key`);
    } else if ((error as Error).message.includes('404')) {
      throw new Error(`${provider} error: Model "${model}" not found`);
    } else if ((error as Error).message.includes('429')) {
      throw new Error(`${provider} too many requests: Reduce request frequency or check API limits`);
    } else {
      logger.error(`${provider} streaming error:`, error);
      throw new Error(`${provider} error: ${(error as Error).message || 'Unknown error'}`);
    }
  }
}
