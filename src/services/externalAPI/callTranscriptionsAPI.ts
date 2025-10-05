import { logger } from '@services/libs/log';

import { AiAPIConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { AuthenticationError, MissingAPIKeyError, MissingBaseURLError } from './errors';
import type { AIProviderConfig, AITranscriptionResponse } from './interface';

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
  config: AiAPIConfig,
  signal: AbortSignal,
  providerConfig?: AIProviderConfig,
  options: TranscriptionOptions = {},
): Promise<AITranscriptionResponse> {
  const provider = config.api.provider;
  const model = config.api.transcriptionsModel || config.api.model;

  logger.info(`Using AI transcription provider: ${provider}, model: ${model}`);

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
    const headers: Record<string, string> = {};

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
        throw new Error(`DeepSeek provider does not support transcriptions`);
      case 'anthropic':
        throw new Error(`Anthropic provider does not support transcriptions`);
      case 'ollama':
        throw new Error(`Ollama provider does not support transcriptions via this API`);
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

    // Prepare FormData for multipart/form-data request
    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('model', model);

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
    const response = await fetch(`${baseURL}/audio/transcriptions`, {
      method: 'POST',
      headers,
      body: formData,
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Transcription API error (${response.status}):`, errorText);

      if (response.status === 401) {
        throw new AuthenticationError(provider);
      } else if (response.status === 404) {
        throw new Error(`${provider} error: Model "${model}" not found`);
      } else if (response.status === 429) {
        throw new Error(`${provider} too many requests: Reduce request frequency or check API limits`);
      } else {
        throw new Error(`${provider} transcription error: ${errorText}`);
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
      model,
      status: 'done' as const,
    };
  } catch (error) {
    logger.error(`${provider} transcription error:`, error);

    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }

    // Return error response for consistency
    return {
      requestId: crypto.randomUUID(),
      text: '',
      model,
      status: 'error' as const,
      errorDetail: {
        name: error instanceof Error ? error.name : 'UnknownError',
        code: 'TRANSCRIPTION_FAILED',
        provider,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
