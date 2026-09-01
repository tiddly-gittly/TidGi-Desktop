import { logger } from '@services/libs/log';
import type { ModelAssignments, ProviderAccountConfig } from 'memeloop';

import { resolveProviderModelRoute } from './callProviderAPI';
import { AuthenticationError, MissingAPIKeyError, MissingBaseURLError } from './errors';
import type { AIImageGenerationResponse } from './interface';

interface ImageGenerationOptions {
  /** Number of images to generate */
  numImages?: number;
  /** Image width */
  width?: number;
  /** Image height */
  height?: number;
}

/**
 * Generate images using an AI provider
 */
export async function generateImageFromProvider(
  prompt: string,
  config: ModelAssignments,
  signal: AbortSignal,
  account: ProviderAccountConfig,
  apiKey: string,
  options: ImageGenerationOptions = {},
): Promise<AIImageGenerationResponse> {
  // Extract provider and model from config
  // Use imageGeneration config if available, fallback to default
  const imageConfig = config.imageGeneration || config.default;
  if (!imageConfig) {
    throw new Error('No image generation model or default model configured');
  }
  const providerId = imageConfig.providerId;
  const logicalModelId = imageConfig.modelId;
  const wireModelId = resolveProviderModelRoute(account, logicalModelId).wireModelId;

  logger.info(`Using AI image generation provider: ${providerId}, logical model: ${logicalModelId}`);

  try {
    // Check if API key is required (not for local ComfyUI)
    if (!apiKey) {
      throw new MissingAPIKeyError(providerId);
    }

    // Get base URL and prepare headers
    let baseUrl = account.baseUrl || '';
    const headers: Record<string, string> = {};

    // Set up provider-specific configuration
    switch (account.providerType) {
      case 'comfyui':
        throw new Error('ComfyUI image generation requires a dedicated provider plugin');
      case 'openai':
        baseUrl ||= 'https://api.openai.com/v1';
        headers['Authorization'] = `Bearer ${apiKey}`;
        headers['Content-Type'] = 'application/json';
        break;
      case 'openai-compatible':
        if (!account.baseUrl) {
          throw new MissingBaseURLError(providerId);
        }
        headers['Content-Type'] = 'application/json';
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
        break;
      default:
        // For other openai-compatible providers
        if (!account.baseUrl) {
          throw new MissingBaseURLError(providerId);
        }
        headers['Content-Type'] = 'application/json';
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
        break;
    }

    // Prepare request body for OpenAI-style APIs
    const requestBody: Record<string, unknown> = {
      model: wireModelId,
      prompt,
      n: options.numImages || 1,
    };

    if (options.width && options.height) {
      requestBody.size = `${options.width}x${options.height}`;
    }

    // Make the API call
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Image generation API error', {
        function: 'generateImageFromProvider',
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
        throw new Error(`${providerId} image generation error: ${errorText}`);
      }
    }

    const data = await response.json() as {
      data: Array<{ url?: string; b64_json?: string }>;
    };

    // Transform to standard format
    const images = data.data.map(item => ({
      data: item.b64_json || item.url || '',
      format: 'png',
    }));

    return {
      requestId: crypto.randomUUID(),
      images,
      logicalModelId,
      wireModelId,
      status: 'done' as const,
    };
  } catch (error) {
    logger.error(`${providerId} image generation error:`, error);

    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }

    // Return error response for consistency
    return {
      requestId: crypto.randomUUID(),
      images: [],
      logicalModelId,
      wireModelId,
      status: 'error' as const,
      errorDetail: {
        name: error instanceof Error ? error.name : 'UnknownError',
        code: 'IMAGE_GENERATION_FAILED',
        providerId,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
