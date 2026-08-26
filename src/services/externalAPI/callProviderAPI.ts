import { logger } from '@services/libs/log';
import { assertPortableLlmRequest, assertPortableLlmStreamPart, type ILLMProvider, type PortableLlmMessage, type PortableLlmRequest, type PortableLlmStreamPart } from 'memeloop';

import { createLLMProvider, type LLMProviderId } from 'memeloop/llm-providers';
import type { ModelMessage } from './interface';

import { MissingAPIKeyError, MissingBaseURLError, parseProviderError } from './errors';
import type { AIProviderConfig, DesktopAIConfig, ModelInfo, ReasoningEffort } from './interface';
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

interface ModelRequestParameters {
  maxOutputTokens?: number;
  maxTokens?: number;
  reasoningEffort?: ReasoningEffort;
  temperature?: number;
  topP?: number;
}

export function resolveModelRequestSettings(model: ModelInfo | undefined, parameters: ModelRequestParameters): {
  maxOutputTokens: number | undefined;
  providerOptions: { openai: { reasoningEffort: ReasoningEffort } } | undefined;
  temperature: number;
  topP: number | undefined;
} {
  const reasoningEffort = parameters.reasoningEffort;
  const supportsEffort = reasoningEffort !== undefined && model?.supportsReasoningEffort?.includes(reasoningEffort);
  return {
    maxOutputTokens: parameters.maxOutputTokens ?? parameters.maxTokens ?? model?.maxOutputTokens,
    providerOptions: supportsEffort && model?.reasoningEffortFormat === 'chat-completions'
      ? { openai: { reasoningEffort } }
      : undefined,
    temperature: parameters.temperature ?? 0.7,
    topP: parameters.topP ?? model?.modelOptions?.top_p,
  };
}

export async function streamFromProvider(
  config: DesktopAIConfig,
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

  logger.info(`Using AI provider: ${provider}, model: ${model}`);

  try {
    if (!providerConfig) {
      throw new Error(`Provider configuration not found: ${provider}`);
    }

    const selectedModel = providerConfig.models.find(candidate => candidate.name === model);
    const llmProvider = await createProviderFromConfig(providerConfig, selectedModel);
    const { maxOutputTokens, providerOptions, temperature, topP } = resolveModelRequestSettings(selectedModel, modelParameters);

    const request: PortableLlmRequest = {
      providerId: provider,
      modelId: model,
      logicalModelId: model,
      wireModelId: model,
      apiMode: selectedModel?.apiMode ?? 'chat-completions',
      messages: toPortableStandaloneMessages(messages),
      stream: true,
      signal,
      ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
      ...(temperature === undefined ? {} : { temperature }),
      ...(topP === undefined ? {} : { topP }),
      ...(providerOptions === undefined ? {} : { providerOptions }),
    };
    assertPortableLlmRequest(request);
    return portableTextStream(await llmProvider.chat(request), signal);
  } catch (error) {
    logger.error(`${provider} streaming error:`, error);
    throw parseProviderError(error, provider);
  }
}

function toPortableStandaloneMessages(messages: readonly ModelMessage[]): PortableLlmMessage[] {
  return messages.map((message): PortableLlmMessage => {
    const content = typeof message.content === 'string'
      ? message.content
      : message.content.map(part => part.text ?? part.content ?? '').join('\n');
    // The standalone helper predates native tool-call messages. Preserve its
    // textual tool result without forging a Core toolCallId/toolName pair.
    if (message.role === 'tool') return { role: 'user', content: `Tool result:\n${content}` };
    if (message.role === 'system') return { role: 'system', content };
    if (message.role === 'assistant') return { role: 'assistant', content };
    return { role: 'user', content };
  });
}

async function* portableTextStream(
  result: string | PortableLlmStreamPart | AsyncIterable<PortableLlmStreamPart>,
  signal: AbortSignal,
): AsyncGenerator<string, void, unknown> {
  signal.throwIfAborted();
  if (typeof result === 'string') {
    yield result;
    return;
  }
  if (isAsyncIterable(result)) {
    for await (const part of result) {
      signal.throwIfAborted();
      assertPortableLlmStreamPart(part);
      if (part.type === 'text-delta') yield part.text;
    }
    return;
  }
  assertPortableLlmStreamPart(result);
  if (result.type === 'text-delta') yield result.text;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<PortableLlmStreamPart> {
  return value !== null && typeof value === 'object' &&
    typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function';
}
