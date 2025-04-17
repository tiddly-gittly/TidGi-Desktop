import { createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { logger } from '@services/libs/log';
import { CoreMessage, Message, streamText } from 'ai';
import { createOllama } from 'ollama-ai-provider';

import type { AIProviderConfig, AISessionConfig } from './interface';

type AIStreamResult = ReturnType<typeof streamText>;

export function createProviderClient(providerConfig: { provider: string; providerClass?: string; baseURL?: string }, apiKey?: string) {
  // 首先检查 providerClass，如果没有则回退到基于名称的判断
  const providerClass = providerConfig.providerClass || providerConfig.provider;

  switch (providerClass) {
    case 'openai':
      return createOpenAI({ apiKey });
    case 'openAICompatible':
      if (!providerConfig.baseURL) {
        throw new Error(`OpenAI-compatible provider ${providerConfig.provider} requires baseURL`);
      }
      return createOpenAICompatible({
        name: providerConfig.provider,
        apiKey,
        baseURL: providerConfig.baseURL,
      });
    case 'deepseek':
      return createDeepSeek({ apiKey });
    case 'anthropic':
      return createAnthropic({ apiKey });
    case 'ollama':
      if (!providerConfig.baseURL) {
        throw new Error(`Ollama provider ${providerConfig.provider} requires baseURL`);
      }
      return createOllama({
        baseURL: providerConfig.baseURL,
      });
    default:
      throw new Error(`Unsupported AI provider: ${providerConfig.provider}`);
  }
}

export function streamFromProvider(
  config: AISessionConfig,
  messages: Array<CoreMessage> | Array<Omit<Message, 'id'>>,
  signal: AbortSignal,
  providerConfig?: AIProviderConfig,
): AIStreamResult {
  const { provider, model, modelParameters = {} } = config;
  const { temperature = 0.7, systemPrompt = 'You are a helpful assistant.' } = modelParameters;

  logger.info(`Using AI provider: ${provider}, model: ${model}`);

  try {
    if (!providerConfig?.apiKey && providerConfig?.providerClass !== 'ollama') {
      // Ollama doesn't require API key
      throw new Error(`API key for ${provider} not found！！！`);
    }

    const client = createProviderClient(
      providerConfig,
      providerConfig.apiKey,
    );

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
