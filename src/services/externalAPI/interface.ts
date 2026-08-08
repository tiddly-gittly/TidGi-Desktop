import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type { BehaviorSubject, Observable } from 'rxjs';

import { ExternalAPIChannel } from '@/constants/channels';
import type { ExternalAPILogEntity } from '@services/database/schema/externalAPILog';
import type { AiAPIConfig } from 'memeloop';

/**
 * Vercel AI SDK message shape used by the External API service.
 * Kept locally so the package does not depend on a specific `ai` major version
 * for this type.
 */
export type ModelMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string }
  | { role: 'system' | 'user' | 'assistant'; content: Array<{ type: string; text?: string; content?: string }> }
  | { role: 'tool'; content: string; toolCallId?: string };

/**
 * Shared error detail structure used across all AI responses
 */
export interface AIErrorDetail {
  /** Error type name */
  name: string;
  /** Error code */
  code: string;
  /** Provider name associated with the error */
  provider: string;
  /** Human readable error message (may be an i18n key) */
  message?: string;
  /** Parameters for i18n interpolation */
  params?: Record<string, string>;
}

/**
 * AI streaming response status interface
 */
export interface AIStreamResponse {
  requestId: string;
  content: string;
  status: 'start' | 'update' | 'done' | 'error' | 'cancel';
  /**
   * Structured error details, provided when status is 'error'
   */
  errorDetail?: AIErrorDetail;
}

/**
 * AI embedding response interface
 */
export interface AIEmbeddingResponse {
  requestId: string;
  embeddings: number[][];
  model: string;
  object: string;
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
  status: 'done' | 'error';
  /**
   * Structured error details, provided when status is 'error'
   */
  errorDetail?: {
    /** Error type name */
    name: string;
    /** Error code */
    code: string;
    /** Provider name associated with the error */
    provider: string;
    /** Human readable error message */
    message?: string;
  };
}

/**
 * AI speech generation (text-to-speech) response interface
 */
export interface AISpeechResponse {
  requestId: string;
  /** Audio data as ArrayBuffer */
  audio: ArrayBuffer;
  /** Audio format (mp3, wav, etc.) */
  format: string;
  model: string;
  status: 'done' | 'error';
  /**
   * Structured error details, provided when status is 'error'
   */
  errorDetail?: AIErrorDetail;
}

/**
 * AI transcription (speech-to-text) response interface
 */
export interface AITranscriptionResponse {
  requestId: string;
  /** Transcribed text */
  text: string;
  /** Language detected (if available) */
  language?: string;
  /** Duration in seconds (if available) */
  duration?: number;
  model: string;
  status: 'done' | 'error';
  /**
   * Structured error details, provided when status is 'error'
   */
  errorDetail?: AIErrorDetail;
}

/**
 * AI image generation response interface
 */
export interface AIImageGenerationResponse {
  requestId: string;
  /** Generated images as base64 or URLs */
  images: Array<{
    /** Image data (base64 or URL) */
    data: string;
    /** Image format (png, jpg, etc.) */
    format?: string;
    /** Width in pixels */
    width?: number;
    /** Height in pixels */
    height?: number;
  }>;
  model: string;
  /** Prompt ID (for ComfyUI) */
  promptId?: string;
  status: 'done' | 'error';
  /**
   * Structured error details, provided when status is 'error'
   */
  errorDetail?: AIErrorDetail;
}

/**
 * Supported AI providers
 */
export type AIProvider = string;

/**
 * Model feature types
 */
export type ModelFeature = 'language' | 'imageGeneration' | 'toolCalling' | 'reasoning' | 'vision' | 'embedding' | 'speech' | 'transcriptions' | 'free';

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

export interface ModelOptions {
  /** Default nucleus sampling value. Request-level topP takes precedence. */
  top_p?: number;
}

/**
 * Extended model information
 */
export interface ModelInfo {
  /** Unique identifier for the model */
  name: string;
  /** Display name for the model */
  caption?: string;
  /** Features supported by the model */
  features?: ModelFeature[];
  /** Model-specific parameters (e.g., ComfyUI workflow path) */
  parameters?: Record<string, unknown>;
  /** Input context window size in tokens (e.g. 128000 for GPT-4o, 200000 for Claude) */
  contextWindowSize?: number;
  /** Alias used by OpenAI-compatible model manifests for the input token limit. */
  maxInputTokens?: number;
  /** Max output tokens (e.g. 4096, 16384) */
  maxOutputTokens?: number;
  /** Safe per-model generation defaults. */
  modelOptions?: ModelOptions;
  /** Reasoning effort values accepted by the model. */
  supportsReasoningEffort?: ReasoningEffort[];
  /** Provider wire format for reasoning effort. */
  reasoningEffortFormat?: 'chat-completions';
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** OpenAI-compatible wire API used by this model. */
  apiMode?: 'chat-completions' | 'responses';
}

/**
 * AI provider configuration like uri and api key
 */
export interface AIProviderConfig {
  provider: string;
  apiKey?: string;
  /** OS-backed encrypted credential; main-process persistence only. */
  encryptedApiKey?: string;
  /** Renderer-safe indication that a credential is configured. */
  hasApiKey?: boolean;
  baseURL?: string;
  models: ModelInfo[];
  /** Type of provider API interface */
  providerClass?: string; // e.g. 'openai', 'openAICompatible', 'anthropic', 'deepseek', 'ollama', 'custom'
  isPreset?: boolean;
  enabled?: boolean;
  showBaseURLField?: boolean;
}

export interface ProviderCatalogStatus {
  source: 'remote' | 'cache' | 'embedded';
  catalogVersion: string;
  fetchedAt: string;
  refreshError?: string;
}

export interface ProviderCatalogResult {
  providers: AIProviderConfig[];
  status: ProviderCatalogStatus;
}

export interface OfficialModelDiscoveryResult {
  provider: string;
  discoveredCount: number;
  models: ModelInfo[];
}

/**
 * AI settings store in user's JSON config file. As global AI related config that can edit in preferences.
 */
export interface AIGlobalSettings {
  /** Providers configuration including API keys and base URLs */
  providers: AIProviderConfig[];
  /** Default AI configuration */
  defaultConfig: AiAPIConfig;
}

/**
 * External API service to manage AI providers and communication
 */
export interface IExternalAPIService {
  /**
   * Initialize the external API service
   */
  initialize(): Promise<void>;

  /**
   * Send messages to AI provider and get streaming response as an Observable
   * requestId will be automatically generated and returned in the AIStreamResponse
   */
  streamFromAI(
    messages: Array<ModelMessage>,
    config: AiAPIConfig,
    options?: { agentInstanceId?: string; awaitLogs?: boolean; requestTimeoutMs?: number },
  ): Observable<AIStreamResponse>;

  /**
   * Send messages to AI provider and get streaming response as an AsyncGenerator
   * This is a more direct approach than Observable for certain use cases
   * requestId will be automatically generated and returned in the AIStreamResponse
   */
  generateFromAI(
    messages: Array<ModelMessage>,
    config: AiAPIConfig,
    options?: { agentInstanceId?: string; awaitLogs?: boolean; requestTimeoutMs?: number },
  ): AsyncGenerator<AIStreamResponse, void, unknown>;

  /**
   * Generate embeddings from AI provider
   */
  generateEmbeddings(
    inputs: string[],
    config: AiAPIConfig,
    options?: {
      /** Dimensions for the embedding (supported by some providers) */
      dimensions?: number;
      /** Encoding format for the embedding */
      encoding_format?: 'float' | 'base64';
    },
  ): Promise<AIEmbeddingResponse>;

  /**
   * Generate speech from text using AI provider (text-to-speech)
   */
  generateSpeech(
    input: string,
    config: AiAPIConfig,
    options?: {
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
    },
  ): Promise<AISpeechResponse>;

  /**
   * Transcribe audio to text using AI provider (speech-to-text)
   */
  generateTranscription(
    audioFile: File | Blob,
    config: AiAPIConfig,
    options?: {
      /** Language of the audio (ISO-639-1 format, e.g., 'en', 'zh') */
      language?: string;
      /** Response format (json, text, srt, vtt, verbose_json) */
      responseFormat?: string;
      /** Temperature for sampling (0-1) */
      temperature?: number;
      /** Optional prompt to guide the model */
      prompt?: string;
    },
  ): Promise<AITranscriptionResponse>;

  /**
   * Generate images using AI provider (text-to-image)
   */
  generateImage(
    prompt: string,
    config: AiAPIConfig,
    options?: {
      /** Number of images to generate */
      numImages?: number;
      /** Image width */
      width?: number;
      /** Image height */
      height?: number;
    },
  ): Promise<AIImageGenerationResponse>;

  /**
   * Cancel an ongoing AI request
   */
  cancelAIRequest(requestId: string): Promise<void>;

  /**
   * Get readonly all supported AI providers and their models
   */
  getAIProviders(): Promise<AIProviderConfig[]>;

  /**
   * Get recommended providers/models without mutating user configuration.
   * Pass refresh=true for a bounded network refresh of the fixed catalog source.
   */
  getProviderCatalog(refresh?: boolean): Promise<ProviderCatalogResult>;

  /**
   * Refresh the models visible to the configured provider account.
   * User-created model entries are retained; earlier discovered entries are replaced.
   */
  refreshOfficialModels(provider: string): Promise<OfficialModelDiscoveryResult>;

  /**
   * Get readonly AI configuration default values
   */
  getAIConfig(): Promise<AiAPIConfig>;

  /**
   * Check if AI is available (has free model and provider configured)
   * This is a convenience method to check if aiConfig.free has both model and provider
   */
  isAIAvailable(): Promise<boolean>;

  /**
   * Observable for changes to default AI configuration
   */
  defaultConfig$: BehaviorSubject<AiAPIConfig>;

  /**
   * Observable for changes to providers list
   */
  providers$: BehaviorSubject<AIProviderConfig[]>;

  /**
   * Update provider configuration
   */
  updateProvider(provider: string, config: Partial<AIProviderConfig>): Promise<void>;

  /**
   * Delete a provider configuration
   */
  deleteProvider(provider: string): Promise<void>;

  /**
   * Update default AI configuration settings
   */
  updateDefaultAIConfig(config: Partial<AiAPIConfig>): Promise<void>;

  /**
   * Delete a field from default AI configuration
   * @param fieldPath - Dot-separated path to the field (e.g., 'embedding', 'speech', 'default')
   */
  deleteFieldFromDefaultAIConfig(fieldPath: string): Promise<void>;

  /**
   * Get API call logs for debugging purposes (only available when externalAPIDebug is enabled)
   * @param agentInstanceId - Optional agent instance ID to filter logs
   * @param limit - Maximum number of records to return (default: 100)
   * @param offset - Number of records to skip (default: 0)
   */
  getAPILogs(agentInstanceId?: string, limit?: number, offset?: number): Promise<ExternalAPILogEntity[]>;
}

export const ExternalAPIServiceIPCDescriptor = {
  channel: ExternalAPIChannel.name,
  properties: {
    initialize: ProxyPropertyType.Function,
    streamFromAI: ProxyPropertyType.Function$,
    generateEmbeddings: ProxyPropertyType.Function,
    generateSpeech: ProxyPropertyType.Function,
    generateTranscription: ProxyPropertyType.Function,
    generateImage: ProxyPropertyType.Function,
    cancelAIRequest: ProxyPropertyType.Function,
    getAIProviders: ProxyPropertyType.Function,
    getProviderCatalog: ProxyPropertyType.Function,
    refreshOfficialModels: ProxyPropertyType.Function,
    getAIConfig: ProxyPropertyType.Function,
    isAIAvailable: ProxyPropertyType.Function,
    defaultConfig$: ProxyPropertyType.Value$,
    providers$: ProxyPropertyType.Value$,
    updateProvider: ProxyPropertyType.Function,
    deleteProvider: ProxyPropertyType.Function,
    updateDefaultAIConfig: ProxyPropertyType.Function,
    deleteFieldFromDefaultAIConfig: ProxyPropertyType.Function,
    getAPILogs: ProxyPropertyType.Function,
    // generateFromAI is intentionally not exposed via IPC as AsyncGenerators aren't directly supported by electron-ipc-cat
  },
};
