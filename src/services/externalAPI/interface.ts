import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { Observable } from 'rxjs';

import { ExternalAPIChannel } from '@/constants/channels';

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIStreamResponse {
  requestId: string;
  content: string;
  status: 'start' | 'update' | 'done' | 'error' | 'cancel';
}

export type AIProvider = string;

export type ModelFeature = 'language' | 'imageGeneration' | 'toolCalling' | 'reasoning' | 'vision' | 'embedding';

export interface ModelInfo {
  name: string;
  caption?: string;
  features?: ModelFeature[];
  metadata?: Record<string, any>;
}

export interface AIProviderConfig {
  provider: string;
  apiKey?: string;
  baseURL?: string;
  models: ModelInfo[];
  providerClass?: string; // e.g. 'openai', 'openAICompatible', 'anthropic', 'deepseek', 'ollama', 'custom'
  isPreset?: boolean;
  enabled?: boolean;
  showBaseURLField?: boolean;
}

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

export interface AISettings {
  providers: AIProviderConfig[];
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
  streamFromAI(messages: AIMessage[], config: AISessionConfig): Observable<AIStreamResponse>;

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
  },
};
