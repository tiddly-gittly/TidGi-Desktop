import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { Observable } from 'rxjs';

import { ExternalAPIChannel } from '@/constants/channels';
import * as schema from '@services/agent/server/schema';
import { CoreMessage, Message } from 'ai';

// We'll use schema.Message but need a simpler subset for API calls
export type AIMessage = schema.Message;

/**
 * AI streaming response status interface
 */
export interface AIStreamResponse {
  requestId: string;
  content: string;
  status: 'start' | 'update' | 'done' | 'error' | 'cancel';
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
  metadata?: Record<string, any>;
}

/**
 * AI provider configuration
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
 * AI session configuration
 */
export interface AISessionConfig {
  provider: string;
  model: string;
  modelParameters?: {
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    topP?: number;
    [key: string]: any;
  };
}

/**
 * AI settings type
 */
export interface AISettings {
  /** Providers configuration including API keys and base URLs */
  providers: AIProviderConfig[];
  /** Default AI configuration */
  defaultConfig: AISessionConfig;
}

/**
 * External API service to manage AI providers and communication
 */
export interface IExternalAPIService {
  /**
   * Send messages to AI provider and get streaming response as an Observable
   * requestId will be automatically generated and returned in the AIStreamResponse
   */
  streamFromAI(messages: Array<CoreMessage> | Array<Omit<Message, 'id'>>, config: AISessionConfig): Observable<AIStreamResponse>;

  /**
   * Send messages to AI provider and get streaming response as an AsyncGenerator
   * This is a more direct approach than Observable for certain use cases
   * requestId will be automatically generated and returned in the AIStreamResponse
   */
  generateFromAI(messages: Array<CoreMessage> | Array<Omit<Message, 'id'>>, config: AISessionConfig): AsyncGenerator<AIStreamResponse, void, unknown>;

  /**
   * Cancel an ongoing AI request
   */
  cancelAIRequest(requestId: string): Promise<void>;

  /**
   * Get available AI models list
   */
  getAvailableAIModels(): Promise<string[]>;

  /**
   * Get all supported AI providers and their models
   */
  getAIProviders(): Promise<AIProviderConfig[]>;

  /**
   * Get AI configuration for providers with optional overrides
   */
  getAIConfig(partialConfig?: Partial<AISessionConfig>): Promise<AISessionConfig>;

  /**
   * Update provider configuration
   */
  updateProvider(provider: string, config: Partial<AIProviderConfig>): Promise<void>;

  /**
   * Update default AI configuration settings
   */
  updateDefaultAIConfig(config: Partial<AISessionConfig>): Promise<void>;
}

export const ExternalAPIServiceIPCDescriptor = {
  channel: ExternalAPIChannel.name,
  properties: {
    streamFromAI: ProxyPropertyType.Function$,
    cancelAIRequest: ProxyPropertyType.Function,
    getAvailableAIModels: ProxyPropertyType.Function,
    getAIProviders: ProxyPropertyType.Function,
    getAIConfig: ProxyPropertyType.Function,
    updateProvider: ProxyPropertyType.Function,
    updateDefaultAIConfig: ProxyPropertyType.Function,
    // generateFromAI is intentionally not exposed via IPC as AsyncGenerators
    // aren't directly supported by electron-ipc-cat
  },
};
