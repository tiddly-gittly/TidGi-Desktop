import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { Observable } from 'rxjs';

import { ExternalAPIChannel } from '@/constants/channels';
import { AiAPIConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import type { ExternalAPILogEntity } from '@services/database/schema/externalAPILog';
import { CoreMessage, Message } from 'ai';

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
 * Supported AI providers
 */
export type AIProvider = string;

/**
 * Model feature types
 */
export type ModelFeature = 'language' | 'imageGeneration' | 'toolCalling' | 'reasoning' | 'vision' | 'embedding';

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
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * AI provider configuration like uri and api key
 */
export interface AIProviderConfig {
  provider: string;
  apiKey?: string;
  baseURL?: string;
  models: ModelInfo[];
  /** Type of provider API interface */
  providerClass?: string; // e.g. 'openai', 'openAICompatible', 'anthropic', 'deepseek', 'ollama', 'custom'
  isPreset?: boolean;
  enabled?: boolean;
  showBaseURLField?: boolean;
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
    messages: Array<CoreMessage> | Array<Omit<Message, 'id'>>,
    config: AiAPIConfig,
    options?: { agentInstanceId?: string; awaitLogs?: boolean },
  ): Observable<AIStreamResponse>;

  /**
   * Send messages to AI provider and get streaming response as an AsyncGenerator
   * This is a more direct approach than Observable for certain use cases
   * requestId will be automatically generated and returned in the AIStreamResponse
   */
  generateFromAI(
    messages: Array<CoreMessage> | Array<Omit<Message, 'id'>>,
    config: AiAPIConfig,
    options?: { agentInstanceId?: string; awaitLogs?: boolean },
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
   * Cancel an ongoing AI request
   */
  cancelAIRequest(requestId: string): Promise<void>;

  /**
   * Get readonly all supported AI providers and their models
   */
  getAIProviders(): Promise<AIProviderConfig[]>;

  /**
   * Get readonly AI configuration default values
   */
  getAIConfig(): Promise<AiAPIConfig>;

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
   * @param fieldPath - Dot-separated path to the field (e.g., 'api.embeddingModel')
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
    cancelAIRequest: ProxyPropertyType.Function,
    getAIProviders: ProxyPropertyType.Function,
    getAIConfig: ProxyPropertyType.Function,
    updateProvider: ProxyPropertyType.Function,
    deleteProvider: ProxyPropertyType.Function,
    updateDefaultAIConfig: ProxyPropertyType.Function,
    deleteFieldFromDefaultAIConfig: ProxyPropertyType.Function,
    getAPILogs: ProxyPropertyType.Function,
    // generateFromAI is intentionally not exposed via IPC as AsyncGenerators aren't directly supported by electron-ipc-cat
  },
};
