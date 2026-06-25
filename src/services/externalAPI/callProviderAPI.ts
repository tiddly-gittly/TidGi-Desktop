import { logger } from '@services/libs/log';
import type { AiAPIConfig, ILLMProvider } from 'memeloop';

import { createLLMProvider, type LLMProviderId } from 'memeloop/llm-providers';
import type { ModelMessage } from './interface';

import { AuthenticationError, MissingAPIKeyError, MissingBaseURLError, parseProviderError } from './errors';
import type { AIProviderConfig } from './interface';

interface ModelMessageContent {
  text?: string;
  content?: string;
}

function getFormattedContent(content: ModelMessage['content']): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part;
        const typedPart = part as ModelMessageContent;
        if (typedPart.text) return typedPart.text;
        if (typedPart.content) return typedPart.content;
        return '';
      })
      .join('');
  }
  return '';
}

/**
 * Map Desktop's AIProviderConfig to a memeloop core ILLMProvider.
 *
 * Core owns the provider dispatch; Desktop only translates its own config
 * schema (providerClass, models array, apiKey, baseURL) into the core shape.
 */
export async function createProviderFromConfig(providerConfig: AIProviderConfig): Promise<ILLMProvider> {
  const providerClass = providerConfig.providerClass || providerConfig.provider;
  const isOllama = providerClass === 'ollama';
  const isLocalOpenAICompatible = providerClass === 'openAICompatible' &&
    providerConfig.baseURL &&
    (providerConfig.baseURL.includes('localhost') || providerConfig.baseURL.includes('127.0.0.1'));

  if (!providerConfig.apiKey && !isOllama && !isLocalOpenAICompatible) {
    throw new MissingAPIKeyError(providerConfig.provider);
  }

  if ((isOllama || providerClass === 'openAICompatible') && !providerConfig.baseURL) {
    throw new MissingBaseURLError(providerConfig.provider);
  }

  // Pick the first model as the default model id for core provider creation.
  const firstModel = providerConfig.models?.[0];

  return createLLMProvider({
    provider: (providerClass === 'openAICompatible' ? 'openai' : providerClass) as LLMProviderId,
    name: providerConfig.provider,
    apiKey: providerConfig.apiKey,
    baseUrl: providerConfig.baseURL,
    model: firstModel?.name,
    options: firstModel?.parameters,
  });
}

export async function streamFromProvider(
  config: AiAPIConfig,
  messages: Array<ModelMessage>,
  signal: AbortSignal,
  providerConfig?: AIProviderConfig,
): Promise<AsyncIterable<string>> {
  // Get default model configuration
  const modelConfig = config.default;
  if (!modelConfig?.provider || !modelConfig?.model) {
    throw new Error('No default model configured');
  }

  const provider = modelConfig.provider;
  const model = modelConfig.model;
  const modelParameters = config.modelParameters || {};
  const { temperature = 0.7 } = modelParameters;

  logger.info(`Using AI provider: ${provider}, model: ${model}`);

  try {
    if (!providerConfig) {
      throw new Error(`Provider configuration not found: ${provider}`);
    }

    const llmProvider = await createProviderFromConfig(providerConfig);

    // Extract system message from messages if present
    const systemMessage = messages.find(message => message.role === 'system');
    const systemPrompt = systemMessage ? getFormattedContent(systemMessage.content) : undefined;

    // Filter out system messages from the messages array since we're handling them separately
    const nonSystemMessages = messages.filter(message => message.role !== 'system');

    // Ensure we have at least one message to avoid AI library errors
    const finalMessages: Array<ModelMessage> = nonSystemMessages.length > 0 ? nonSystemMessages : [{ role: 'user' as const, content: 'Hi' }];

    const chatResult = await llmProvider.chat({
      model,
      messages: finalMessages,
      stream: true,
      system: systemPrompt,
      temperature,
      abortSignal: signal,
    });

    const isIterable = typeof chatResult === 'object' &&
      chatResult !== null &&
      (Symbol.asyncIterator in chatResult || Symbol.iterator in chatResult);
    if (!isIterable) {
      throw new Error(`${provider} provider did not return a stream`);
    }

    return chatResult as AsyncIterable<string>;
  } catch (error) {
    if (!error) {
      throw new Error(`${provider} error: Unknown error`);
    } else if ((error as Error).message.includes('401')) {
      throw new AuthenticationError(provider);
    } else if ((error as Error).message.includes('404')) {
      throw new Error(`${provider} error: Model "${model}" not found`);
    } else if ((error as Error).message.includes('429')) {
      throw new Error(`${provider} too many requests: Reduce request frequency or check API limits`);
    } else {
      logger.error(`${provider} streaming error:`, error);
      throw parseProviderError(error as Error, provider);
    }
  }
}
