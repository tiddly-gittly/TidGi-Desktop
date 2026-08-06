import { logger } from '@services/libs/log';
import type { AiAPIConfig, ILLMProvider } from 'memeloop';

import { createLLMProvider, type LLMProviderId } from 'memeloop/llm-providers';
import type { ModelMessage } from './interface';

import { AuthenticationError, MissingAPIKeyError, MissingBaseURLError, parseProviderError } from './errors';
import type { AIProviderConfig, ModelInfo } from './interface';
import { isLoopbackOpenAIBaseURL, normalizeOpenAIBaseURL } from './openAIBaseURL';

/**
 * Map Desktop's AIProviderConfig to a memeloop core ILLMProvider.
 *
 * Core owns the provider dispatch; Desktop only translates its own config
 * schema (providerClass, models array, apiKey, baseURL) into the core shape.
 */
export function toCoreProviderConfig(providerConfig: AIProviderConfig, model?: ModelInfo) {
  const providerClass = providerConfig.providerClass || providerConfig.provider;
  const isOllama = providerClass === 'ollama';
  const isLocalOpenAICompatible = providerClass === 'openAICompatible' && isLoopbackOpenAIBaseURL(providerConfig.baseURL);

  if (!providerConfig.apiKey && !isOllama && !isLocalOpenAICompatible) {
    throw new MissingAPIKeyError(providerConfig.provider);
  }

  if ((isOllama || providerClass === 'openAICompatible') && !providerConfig.baseURL) {
    throw new MissingBaseURLError(providerConfig.provider);
  }

  // Pick the first model as the default model id for core provider creation.
  const selectedModel = model ?? providerConfig.models?.[0];

  const coreConfig: Parameters<typeof createLLMProvider>[0] & {
    openAIApiMode?: ModelInfo['apiMode'];
  } = {
    provider: (providerClass === 'openAICompatible' ? 'openai' : providerClass) as LLMProviderId,
    name: providerConfig.provider,
    // The OpenAI SDK requires a non-empty value even when the loopback server
    // intentionally has no authentication. Keep this runtime-only; it is not
    // persisted or exposed as a configured credential.
    apiKey: providerConfig.apiKey ?? (isLocalOpenAICompatible ? 'local-no-auth' : undefined),
    baseUrl: providerConfig.baseURL && (providerClass === 'openAICompatible' || providerClass === 'openai')
      ? normalizeOpenAIBaseURL(providerConfig.baseURL)
      : providerConfig.baseURL,
    model: selectedModel?.name,
    options: selectedModel?.parameters,
    openAIApiMode: selectedModel?.apiMode,
  };
  return coreConfig;
}

export async function createProviderFromConfig(providerConfig: AIProviderConfig, model?: ModelInfo): Promise<ILLMProvider> {
  return createLLMProvider(toCoreProviderConfig(providerConfig, model));
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

    const selectedModel = providerConfig.models.find(candidate => candidate.name === model);
    const llmProvider = await createProviderFromConfig(providerConfig, selectedModel);

    // Pass memeloop's messages directly. The core has already built the correct
    // prompt structure (including agent-specific system prompts and tool
    // descriptions); merging system messages here can leak tools such as
    // wiki-operation into the first system prompt and break per-agent prompt
    // isolation.
    const chatResult = await llmProvider.chat({
      model,
      messages,
      stream: true,
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
