import { logger } from '@services/libs/log';
import type { ModelAssignments, ProviderAccountConfig } from 'memeloop';

import { resolveProviderModelRoute } from './callProviderAPI';
import { AuthenticationError, MissingAPIKeyError, MissingBaseURLError } from './errors';
import type { AIEmbeddingResponse } from './interface';

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
  config: ModelAssignments,
  signal: AbortSignal,
  account: ProviderAccountConfig,
  apiKey: string,
  options: EmbeddingOptions = {},
): Promise<AIEmbeddingResponse> {
  // Extract provider and model from config
  // Use embedding config if available, fallback to default
  const embeddingConfig = config.embedding || config.default;
  if (!embeddingConfig) {
    throw new Error('No embedding model or default model configured');
  }
  const providerId = embeddingConfig.providerId;
  const logicalModelId = embeddingConfig.modelId;
  const route = resolveProviderModelRoute(account, embeddingConfig.modelId);
  const wireModelId = route.wireModelId;

  logger.info(`Using AI embedding provider: ${providerId}, logical model: ${logicalModelId}`);

  try {
    // Check if API key is required
    const isOllama = account.providerType === 'ollama';
    const isLocalOpenAICompatible = account.providerType === 'openai-compatible' &&
      account.baseUrl !== undefined && new URL(account.baseUrl).protocol === 'http:';

    if (!apiKey && !isOllama && !isLocalOpenAICompatible) {
      throw new MissingAPIKeyError(providerId);
    }

    // Get base URL and prepare headers
    let baseUrl = account.baseUrl || '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Set up provider-specific configuration
    switch (account.providerType) {
      case 'openai':
        baseUrl ||= 'https://api.openai.com/v1';
        headers['Authorization'] = `Bearer ${apiKey}`;
        break;
      case 'openai-compatible':
        if (!account.baseUrl) {
          throw new MissingBaseURLError(providerId);
        }
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
        break;
      case 'deepseek':
        baseUrl ||= 'https://api.deepseek.com/v1';
        headers['Authorization'] = `Bearer ${apiKey}`;
        break;
      case 'anthropic':
        throw new Error(`Anthropic provider does not support embeddings`);
      case 'ollama':
        if (!account.baseUrl) {
          throw new MissingBaseURLError(providerId);
        }
        break;
      default:
        // For silicon flow and other openai-compatible providers
        if (!account.baseUrl) {
          throw new MissingBaseURLError(providerId);
        }
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
        break;
    }

    // Prepare request body
    const requestBody: Record<string, unknown> = {
      model: wireModelId,
      input: inputs,
    };

    // Add optional parameters based on provider support
    if (options.dimensions && (account.providerType === 'openai-compatible' || providerId === 'siliconflow')) {
      requestBody.dimensions = options.dimensions;
    }

    if (options.encoding_format) {
      requestBody.encoding_format = options.encoding_format;
    }

    // Make the API call
    const response = await fetch(`${baseUrl}/embeddings`, {
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
        throw new AuthenticationError(providerId);
      } else if (response.status === 404) {
        throw new Error(`${providerId} error: Model "${wireModelId}" not found`);
      } else if (response.status === 429) {
        throw new Error(`${providerId} too many requests: Reduce request frequency or check API limits`);
      } else {
        throw new Error(`${providerId} embedding error: ${errorText}`);
      }
    }

    const data = await response.json() as EmbeddingAPIResponse;

    // Transform the response to our standard format
    const embeddings = data.data?.map(item => item.embedding) || [];

    return {
      requestId: crypto.randomUUID(),
      embeddings,
      logicalModelId,
      wireModelId,
      object: data.object || 'list',
      usage: data.usage,
      status: 'done' as const,
    };
  } catch (error) {
    logger.error(`${providerId} embedding error:`, error);

    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }

    // Return error response for consistency
    return {
      requestId: crypto.randomUUID(),
      embeddings: [],
      logicalModelId,
      wireModelId,
      object: 'error',
      status: 'error' as const,
      errorDetail: {
        name: error instanceof Error ? error.name : 'UnknownError',
        code: 'EMBEDDING_FAILED',
        providerId,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
