import { logger } from '@services/libs/log';

import { AiAPIConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { AuthenticationError, MissingAPIKeyError, MissingBaseURLError } from './errors';
import type { AIProviderConfig, AISpeechResponse } from './interface';

interface SpeechOptions {
  /** Response audio format (mp3, wav, opus, etc.) */
  responseFormat?: string;
  /** Audio sample rate */
  sampleRate?: number;
  /** Speaking speed (0.5 - 2.0) */
  speed?: number;
  /** Audio gain/volume adjustment */
  gain?: number;
  /** Voice identifier (provider-specific) */
  voice?: string;
  /** Whether to stream the response */
  stream?: boolean;
  /** Maximum tokens for generation (for some providers) */
  maxTokens?: number;
}

/**
 * Generate speech from text using an AI provider
 */
export async function generateSpeechFromProvider(
  input: string,
  config: AiAPIConfig,
  signal: AbortSignal,
  providerConfig?: AIProviderConfig,
  options: SpeechOptions = {},
): Promise<AISpeechResponse> {
  const provider = config.api.provider;
  const model = config.api.speechModel || config.api.model;

  logger.info(`Using AI speech provider: ${provider}, model: ${model}`);

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
        throw new Error(`DeepSeek provider does not support speech generation`);
      case 'anthropic':
        throw new Error(`Anthropic provider does not support speech generation`);
      case 'ollama':
        throw new Error(`Ollama provider does not support speech generation via this API`);
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

    // Prepare request body based on provider
    const requestBody: Record<string, unknown> = {
      model,
      input,
    };

    // Add optional parameters
    if (options.responseFormat) {
      requestBody.response_format = options.responseFormat;
    }
    if (options.sampleRate) {
      requestBody.sample_rate = options.sampleRate;
    }
    if (options.speed !== undefined) {
      requestBody.speed = options.speed;
    }
    if (options.gain !== undefined) {
      requestBody.gain = options.gain;
    }
    if (options.voice) {
      requestBody.voice = options.voice;
    }
    if (options.stream !== undefined) {
      requestBody.stream = options.stream;
    }
    if (options.maxTokens) {
      requestBody.max_tokens = options.maxTokens;
    }

    // Make the API call
    const response = await fetch(`${baseURL}/audio/speech`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Speech API error', {
        function: 'generateSpeechFromProvider',
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
        throw new Error(`${provider} speech error: ${errorText}`);
      }
    }

    // Get audio data as ArrayBuffer
    const audioData = await response.arrayBuffer();

    // Determine format from options or content-type
    const format = options.responseFormat || 'mp3';

    return {
      requestId: crypto.randomUUID(),
      audio: audioData,
      format,
      model,
      status: 'done' as const,
    };
  } catch (error) {
    logger.error(`${provider} speech error:`, error);

    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }

    // Return error response for consistency
    return {
      requestId: crypto.randomUUID(),
      audio: new ArrayBuffer(0),
      format: 'mp3',
      model,
      status: 'error' as const,
      errorDetail: {
        name: error instanceof Error ? error.name : 'UnknownError',
        code: 'SPEECH_GENERATION_FAILED',
        provider,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
