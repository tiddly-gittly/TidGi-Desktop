import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type { BehaviorSubject } from 'rxjs';

import { ExternalAPIChannel } from '@/constants/channels';
import type { ExternalAPILogEntity } from '@services/database/schema/externalAPILog';
import type { ModelAssignments, ModelCatalogResolution, PortableLlmRequest, PortableLlmStreamPart, ProviderAccountConfig, ProviderAccountSettings } from 'memeloop';

/**
 * Shared error detail structure used across all AI responses
 */
export interface AIErrorDetail {
  /** Error type name */
  name: string;
  /** Error code */
  code: string;
  /** Canonical provider account ID associated with the error. */
  providerId: string;
  /** Human readable error message (may be an i18n key) */
  message?: string;
  /** Parameters for i18n interpolation */
  params?: Record<string, string>;
}

/**
 * AI embedding response interface
 */
export interface AIEmbeddingResponse {
  requestId: string;
  embeddings: number[][];
  logicalModelId: string;
  wireModelId?: string;
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
    /** Canonical provider account ID associated with the error. */
    providerId: string;
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
  logicalModelId: string;
  wireModelId?: string;
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
  logicalModelId: string;
  wireModelId?: string;
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
  logicalModelId: string;
  wireModelId?: string;
  /** Prompt ID (for ComfyUI) */
  promptId?: string;
  status: 'done' | 'error';
  /**
   * Structured error details, provided when status is 'error'
   */
  errorDetail?: AIErrorDetail;
}

/** Desktop-only encrypted bytes. Provider/model identity stays in Core types. */
export interface ProviderCredentialState {
  providerId: string;
  encryptedApiKey: string;
}

/** Host persistence composed entirely from canonical Core provider/model types. */
export interface DesktopExternalAPISettings extends ProviderAccountSettings {
  providerCredentials: ProviderCredentialState[];
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
   * Generate embeddings from AI provider
   */
  generateEmbeddings(
    inputs: string[],
    config: ModelAssignments,
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
    config: ModelAssignments,
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
      maxOutputTokens?: number;
    },
  ): Promise<AISpeechResponse>;

  /**
   * Transcribe audio to text using AI provider (speech-to-text)
   */
  generateTranscription(
    audioFile: File | Blob,
    config: ModelAssignments,
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
    config: ModelAssignments,
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
  getProviderAccounts(): Promise<ProviderAccountConfig[]>;

  /**
   * Decrypt one provider credential for the explicit settings editor.
   * Provider observables remain redacted so credentials are not broadcast to
   * every renderer subscriber.
   */
  getProviderApiKey(providerId: string): Promise<string>;

  /** Replace or clear one OS-encrypted credential without changing account routes. */
  setProviderApiKey(providerId: string, apiKey: string): Promise<void>;

  /**
   * Get recommended providers/models without mutating user configuration.
   * Pass refresh=true for a bounded network refresh of the fixed catalog source.
   */
  getProviderCatalog(refresh?: boolean): Promise<ModelCatalogResolution>;

  /**
   * Refresh the models visible to the configured provider account.
   * User-created model entries are retained; earlier discovered entries are replaced.
   */
  refreshProviderAccountModels(providerId: string): Promise<ProviderAccountConfig>;

  /**
   * Get readonly AI configuration default values
   */
  getAIConfig(): Promise<ModelAssignments>;

  /**
   * Main-process agent execution path. It preserves MemeLoop's exact portable
   * request/stream contracts instead of round-tripping through accumulated
   * renderer-friendly strings.
   */
  generatePortableLlm(
    request: PortableLlmRequest,
    options?: { agentInstanceId?: string; awaitLogs?: boolean; requestTimeoutMs?: number },
  ): AsyncIterable<PortableLlmStreamPart>;

  /**
   * Check if AI is available (has free model and provider configured)
   * This is a convenience method to check if aiConfig.free has both model and provider
   */
  isAIAvailable(): Promise<boolean>;

  /**
   * Observable for changes to default AI configuration
   */
  defaultConfig$: BehaviorSubject<ModelAssignments>;

  /**
   * Observable for changes to providers list
   */
  providerAccounts$: BehaviorSubject<ProviderAccountConfig[]>;

  /**
   * Update provider configuration
   */
  setProviderAccount(account: ProviderAccountConfig): Promise<void>;

  /**
   * Delete a provider configuration
   */
  deleteProviderAccount(providerId: string): Promise<void>;

  /**
   * Update default AI configuration settings
   */
  updateDefaultAIConfig(config: ModelAssignments): Promise<void>;

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
    generateEmbeddings: ProxyPropertyType.Function,
    generateSpeech: ProxyPropertyType.Function,
    generateTranscription: ProxyPropertyType.Function,
    generateImage: ProxyPropertyType.Function,
    cancelAIRequest: ProxyPropertyType.Function,
    getProviderAccounts: ProxyPropertyType.Function,
    getProviderApiKey: ProxyPropertyType.Function,
    setProviderApiKey: ProxyPropertyType.Function,
    getProviderCatalog: ProxyPropertyType.Function,
    refreshProviderAccountModels: ProxyPropertyType.Function,
    getAIConfig: ProxyPropertyType.Function,
    isAIAvailable: ProxyPropertyType.Function,
    defaultConfig$: ProxyPropertyType.Value$,
    providerAccounts$: ProxyPropertyType.Value$,
    setProviderAccount: ProxyPropertyType.Function,
    deleteProviderAccount: ProxyPropertyType.Function,
    updateDefaultAIConfig: ProxyPropertyType.Function,
    deleteFieldFromDefaultAIConfig: ProxyPropertyType.Function,
    getAPILogs: ProxyPropertyType.Function,
    // generatePortableLlm is main-process only: AsyncIterables are not IPC values.
  },
};
