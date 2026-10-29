import { logger } from '@services/libs/log';
import type { ModelAssignments, ProviderAccountConfig } from 'memeloop';

import { resolveProviderModelRoute } from './callProviderAPI';
import { AuthenticationError, MissingAPIKeyError, MissingBaseURLError } from './errors';
import type { AITranscriptionResponse } from './interface';

interface TranscriptionOptions {
  /** Language of the audio (ISO-639-1 format, e.g., 'en', 'zh') */
  language?: string;
  /** Response format (json, text, srt, vtt, verbose_json) */
  responseFormat?: string;
  /** Temperature for sampling (0-1) */
  temperature?: number;
  /** Optional prompt to guide the model */
  prompt?: string;
}

/**
 * Transcribe audio to text using an AI provider
 */
export async function generateTranscriptionFromProvider(
  audioFile: File | Blob,
  config: ModelAssignments,
  signal: AbortSignal,
  account: ProviderAccountConfig,
  apiKey: string,
  options: TranscriptionOptions = {},
): Promise<AITranscriptionResponse> {
  // Extract provider and model from config
  // Use transcriptions config if available, fallback to default
  const transcriptionsConfig = config.transcriptions || config.default;
  if (!transcriptionsConfig) {
    throw new Error('No transcriptions model or default model configured');
  }
  const providerId = transcriptionsConfig.providerId;
  const logicalModelId = transcriptionsConfig.modelId;
  const wireModelId = resolveProviderModelRoute(account, logicalModelId).wireModelId;

  logger.info(`Using AI transcription provider: ${providerId}, logical model: ${logicalModelId}`);

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
    const headers: Record<string, string> = {};

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
        throw new Error(`DeepSeek provider does not support transcriptions`);
      case 'anthropic':
        throw new Error(`Anthropic provider does not support transcriptions`);
      case 'ollama':
        throw new Error(`Ollama provider does not support transcriptions via this API`);
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

    // Prepare FormData for multipart/form-data request
    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('model', wireModelId);

    // Add optional parameters
    if (options.language) {
      formData.append('language', options.language);
    }
    if (options.responseFormat) {
      formData.append('response_format', options.responseFormat);
    }
    if (options.temperature !== undefined) {
      formData.append('temperature', options.temperature.toString());
    }
    if (options.prompt) {
      formData.append('prompt', options.prompt);
    }

    // Make the API call
    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers,
      body: formData,
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Transcription API error', {
        function: 'generateTranscriptionFromProvider',
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
        throw new Error(`${providerId} transcription error: ${errorText}`);
      }
    }

    // Parse response based on format
    const responseFormat = options.responseFormat || 'json';
    let text = '';
    let language: string | undefined;
    let duration: number | undefined;

    if (responseFormat === 'json' || responseFormat === 'verbose_json') {
      const data = await response.json() as {
        text: string;
        language?: string;
        duration?: number;
      };
      text = data.text;
      language = data.language;
      duration = data.duration;
    } else {
      // For text, srt, vtt formats, just get the text
      text = await response.text();
    }

    return {
      requestId: crypto.randomUUID(),
      text,
      language,
      duration,
      logicalModelId,
      wireModelId,
      status: 'done' as const,
    };
  } catch (error) {
    logger.error(`${providerId} transcription error:`, error);

    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }

    // Return error response for consistency
    return {
      requestId: crypto.randomUUID(),
      text: '',
      logicalModelId,
      wireModelId,
      status: 'error' as const,
      errorDetail: {
        name: error instanceof Error ? error.name : 'UnknownError',
        code: 'TRANSCRIPTION_FAILED',
        providerId,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
