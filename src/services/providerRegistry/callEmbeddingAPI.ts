import { logger } from '@services/libs/log';

import { AiAPIConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { AuthenticationError, MissingAPIKeyError, MissingBaseURLError } from './errors';
import type { AIEmbeddingResponse, AIProviderConfig } from './interface';

interface EmbeddingAPIResponse {
  data?: Array<{ embedding: number[] }>;
  object?: string;
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

interface EmbeddingOptions {
  /** Dimensions for the embedding (supported by some providers) */
  dimensions?: number;
  /** Encoding format for the embedding */
  encoding_format?: 'float' | 'base64';
}

/**
 * Generate embeddings from an AI provider
 */
export async function generateEmbeddingsFromProvider(
  inputs: string[],
  config: AiAPIConfig,
  signal: AbortSignal,
  providerConfig?: AIProviderConfig,
  options: EmbeddingOptions = {},
): Promise<AIEmbeddingResponse> {
  // Extract provider and model from config
  // Use embedding config if available, fallback to default
  const embeddingConfig = config.embedding || config.default;
  if (!embeddingConfig) {
    throw new Error('No embedding model or default model configured');
  }
  const provider = embeddingConfig.provider;
  const model = embeddingConfig.model;

  logger.info(`Using AI embedding provider: ${provider}, model: ${model}`);

  try {
    // Check if API key is required
    const isOllama = providerConfig?.providerClass === 'ollama';
    const isLocalOpenAICompatible = providerConfig?.providerClass === 'openAICompatible' &&
      providerConfig?.baseURL &&
      (providerConfig.baseURL.includes('localhost') || providerConfig.baseURL.includes('127.0.0.1'));

    if (!providerConfig?.apiKey && !isOllama && !isLocalOpenAICompatible) {
      throw new MissingAPIKeyError(provider);
    }

    // Get base URL and prepare headers
    let baseURL = providerConfig?.baseURL || '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Set up provider-specific configuration
    switch (providerConfig?.providerClass || provider) {
      case 'openai':
        baseURL = 'https://api.openai.com/v1';
        headers['Authorization'] = `Bearer ${providerConfig?.apiKey}`;
        break;
      case 'openAICompatible':
        if (!providerConfig?.baseURL) {
          throw new MissingBaseURLError(provider);
        }
        baseURL = providerConfig.baseURL;
        if (providerConfig.apiKey) {
          headers['Authorization'] = `Bearer ${providerConfig.apiKey}`;
        }
        break;
      case 'deepseek':
        baseURL = 'https://api.deepseek.com/v1';
        headers['Authorization'] = `Bearer ${providerConfig?.apiKey}`;
        break;
      case 'anthropic':
        throw new Error(`Anthropic provider does not support embeddings`);
      case 'ollama':
        if (!providerConfig?.baseURL) {
          throw new MissingBaseURLError(provider);
        }
        baseURL = providerConfig.baseURL;
        break;
      default:
        // For silicon flow and other openai-compatible providers
        if (!providerConfig?.baseURL) {
          throw new MissingBaseURLError(provider);
        }
        baseURL = providerConfig.baseURL;
        if (providerConfig.apiKey) {
          headers['Authorization'] = `Bearer ${providerConfig.apiKey}`;
        }
        break;
    }

    // Prepare request body
    const requestBody: Record<string, unknown> = {
      model,
      input: inputs,
    };

    // Add optional parameters based on provider support
    if (options.dimensions && (providerConfig?.providerClass === 'openAICompatible' || provider === 'siliconflow')) {
      requestBody.dimensions = options.dimensions;
    }

    if (options.encoding_format) {
      requestBody.encoding_format = options.encoding_format;
    }

    // Make the API call
    const response = await fetch(`${baseURL}/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Embedding API error', {
        function: 'generateEmbeddingsFromProvider',
        status: response.status,
        errorText,
      });

      if (response.status === 401) {
        throw new AuthenticationError(provider);
      } else if (response.status === 404) {
        throw new Error(`${provider} error: Model "${model}" not found`);
      } else if (response.status === 429) {
        throw new Error(`${provider} too many requests: Reduce request frequency or check API limits`);
      } else {
        throw new Error(`${provider} embedding error: ${errorText}`);
      }
    }

    const data = await response.json() as EmbeddingAPIResponse;

    // Transform the response to our standard format
    const embeddings = data.data?.map(item => item.embedding) || [];

    return {
      requestId: crypto.randomUUID(),
      embeddings,
      model,
      object: data.object || 'list',
      usage: data.usage,
      status: 'done' as const,
    };
  } catch (error) {
    logger.error(`${provider} embedding error:`, error);

    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }

    // Return error response for consistency
    return {
      requestId: crypto.randomUUID(),
      embeddings: [],
      model,
      object: 'error',
      status: 'error' as const,
      errorDetail: {
        name: error instanceof Error ? error.name : 'UnknownError',
        code: 'EMBEDDING_FAILED',
        provider,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
