/* eslint-disable @typescript-eslint/require-await */
import { injectable } from 'inversify';
import { cloneDeep, mergeWith } from 'lodash';
import { nanoid } from 'nanoid';
import { defer, from, Observable } from 'rxjs';
import { filter, finalize, startWith } from 'rxjs/operators';

import { AiAPIConfig } from '@services/agent/defaultAgents/schemas';
import { lazyInject } from '@services/container';
import { IDatabaseService } from '@services/database/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { CoreMessage, Message } from 'ai';
import { streamFromProvider } from './callProviderAPI';
import rawDefaultProvidersConfig from './defaultProviders.json';
import { isProviderConfigError } from './errors';
import type { AIGlobalSettings, AIProviderConfig, AIStreamResponse, IExternalAPIService, ModelFeature } from './interface';

// Create typed config object
const defaultProvidersConfig = {
  ...rawDefaultProvidersConfig,
  providers: rawDefaultProvidersConfig.providers.map(provider => ({
    ...provider,
    models: provider.models.map(model => ({
      ...model,
      features: model.features as unknown as ModelFeature[],
    })),
  })),
};

/**
 * Simplified request context
 */
interface AIRequestContext {
  requestId: string;
  controller: AbortController;
}

@injectable()
export class ExternalAPIService implements IExternalAPIService {
  @lazyInject(serviceIdentifier.Database)
  private readonly databaseService!: IDatabaseService;

  private activeRequests: Map<string, AbortController> = new Map();

  private userSettings: AIGlobalSettings = {
    providers: [],
    defaultConfig: {
      api: {
        provider: '',
        model: '',
      },
      modelParameters: {
        temperature: 0.7,
        systemPrompt: 'You are a helpful assistant.',
        topP: 0.95,
      },
    },
  };

  constructor() {
    this.loadSettingsFromDatabase();
  }

  /**
   * Merge user settings with default settings without modifying stored data
   */
  private mergeWithDefaults(settings: AIGlobalSettings): AIGlobalSettings {
    const defaultSettings: AIGlobalSettings = {
      providers: cloneDeep(defaultProvidersConfig.providers),
      defaultConfig: { ...defaultProvidersConfig.defaultConfig },
    };

    return mergeWith({} as AIGlobalSettings, defaultSettings, settings, (
      objectValue: unknown,
      sourceValue: unknown,
      key: string,
    ) => {
      const isProvider = (
        key: string,
        objectValue: unknown,
      ): objectValue is AIProviderConfig[] => (key === 'providers' && Array.isArray(objectValue) && Array.isArray(sourceValue));
      if (isProvider(key, objectValue) && isProvider(key, sourceValue)) {
        // For each provider in user settings
        sourceValue.forEach((userProvider: AIProviderConfig) => {
          // Find matching provider in default settings
          const defaultProvider = objectValue.find((p: AIProviderConfig) => p.provider === userProvider.provider);
          if (defaultProvider) {
            // Merge properties from user provider to default provider
            Object.assign(defaultProvider, userProvider);
          } else {
            // If provider doesn't exist in defaults, add it
            objectValue.push(userProvider);
          }
        });
        // Return objValue to prevent default array merging
        return objectValue;
      }
      // Use default merging for other properties
      return undefined;
    });
  }

  private loadSettingsFromDatabase(): void {
    const savedSettings = this.databaseService.getSetting('aiSettings');
    this.userSettings = savedSettings ?? this.userSettings;
  }

  private saveSettingsToDatabase(): void {
    this.databaseService.setSetting('aiSettings', this.userSettings);
  }

  async getAIProviders(): Promise<AIProviderConfig[]> {
    const mergedSettings = this.mergeWithDefaults(this.userSettings);
    return mergedSettings.providers;
  }

  /**
   * Get AI configuration with default values and optional overrides
   */
  async getAIConfig(partialConfig?: Partial<AiAPIConfig>): Promise<AiAPIConfig> {
    const mergedSettings = this.mergeWithDefaults(this.userSettings);
    const defaultConfig: AiAPIConfig = {
      api: {
        provider: mergedSettings.defaultConfig.api?.provider || '',
        model: mergedSettings.defaultConfig.api?.model || '',
      },
      modelParameters: {
        temperature: 0.7,
        systemPrompt: 'You are a helpful assistant.',
        topP: 0.95,
      },
    };

    if (partialConfig) {
      // Merge top-level properties
      const result: AiAPIConfig = {
        ...defaultConfig,
      };

      // Separately merge model parameters if they exist
      if (partialConfig.modelParameters) {
        result.modelParameters = {
          ...defaultConfig.modelParameters,
          ...partialConfig.modelParameters,
        };
      }

      // Separately merge api if it exists
      if (partialConfig.api) {
        result.api = {
          ...defaultConfig.api,
          ...partialConfig.api,
        };
      }

      return result;
    }

    return defaultConfig;
  }

  /**
   * Get provider configuration by provider name
   */
  private async getProviderConfig(providerName: string): Promise<AIProviderConfig | undefined> {
    const providers = await this.getAIProviders();
    return providers.find(p => p.provider === providerName);
  }

  async updateProvider(provider: string, config: Partial<AIProviderConfig>): Promise<void> {
    // Find if the provider already exists in user settings
    const providerIndex = this.userSettings.providers.findIndex(p => p.provider === provider);
    if (providerIndex !== -1) {
      this.userSettings.providers[providerIndex] = {
        ...this.userSettings.providers[providerIndex],
        ...config,
      };
    } else {
      this.userSettings.providers.push({
        provider,
        models: [],
        ...config,
      });
    }
    this.saveSettingsToDatabase();
  }

  async updateDefaultAIConfig(config: Partial<AiAPIConfig>): Promise<void> {
    // Initialize api if it doesn't exist
    if (!this.userSettings.defaultConfig.api) {
      this.userSettings.defaultConfig.api = {
        provider: '',
        model: '',
      };
    }

    // Update api properties
    if (config.api) {
      if (config.api.provider !== undefined) {
        this.userSettings.defaultConfig.api.provider = config.api.provider;
      }

      if (config.api.model !== undefined) {
        this.userSettings.defaultConfig.api.model = config.api.model;
      }
    }

    // Update modelParameters
    if (config.modelParameters) {
      if (!this.userSettings.defaultConfig.modelParameters) {
        this.userSettings.defaultConfig.modelParameters = {};
      }
      
      this.userSettings.defaultConfig.modelParameters = {
        ...this.userSettings.defaultConfig.modelParameters,
        ...config.modelParameters,
      };
    }

    this.saveSettingsToDatabase();
  }

  /**
   * Prepare a new AI request with minimal initialization
   */
  private prepareAIRequest(): AIRequestContext {
    const requestId = nanoid();
    const controller = new AbortController();

    this.activeRequests.set(requestId, controller);

    return { requestId, controller };
  }

  /**
   * Clean up resources for an AI request
   */
  private cleanupAIRequest(requestId: string): void {
    this.activeRequests.delete(requestId);
  }

  streamFromAI(messages: Array<CoreMessage> | Array<Omit<Message, 'id'>>, config: AiAPIConfig): Observable<AIStreamResponse> {
    // Use defer to create a new observable stream for each subscription
    return defer(() => {
      // Prepare request context
      const { requestId, controller } = this.prepareAIRequest();

      // Get AsyncGenerator from generateFromAI and convert to Observable
      return from(this.generateFromAI(messages, config)).pipe(
        // Skip the first 'start' event since we'll emit our own
        // to ensure it happens immediately (AsyncGenerator might delay it)
        filter((response, index) => !(index === 0 && response.status === 'start')),
        // Ensure we emit a start event immediately
        startWith({ requestId, content: '', status: 'start' as const }),
        // Ensure cleanup happens on completion, error, or unsubscribe
        finalize(() => {
          if (this.activeRequests.has(requestId)) {
            controller.abort();
            this.cleanupAIRequest(requestId);
            logger.debug(`[${requestId}] Cleaned up in streamFromAI finalize`);
          }
        }),
      );
    });
  }

  async *generateFromAI(
    messages: Array<CoreMessage> | Array<Omit<Message, 'id'>>,
    config: AiAPIConfig,
  ): AsyncGenerator<AIStreamResponse, void, unknown> {
    // Prepare request with minimal context
    const { requestId, controller } = this.prepareAIRequest();

    try {
      // Send start event
      yield { requestId, content: '', status: 'start' };

      // Get provider configuration
      const providerConfig = await this.getProviderConfig(config.api.provider);
      if (!providerConfig) {
        const errorMessage = `Provider ${config.api.provider} not found or not configured`;
        yield {
          requestId,
          content: errorMessage,
          status: 'error',
          errorDetail: {
            name: 'MissingProviderError',
            code: 'PROVIDER_NOT_FOUND',
            provider: config.api.provider,
          },
        };
        return;
      }

      // Create the stream
      let result: any;
      try {
        result = streamFromProvider(
          config,
          messages,
          controller.signal,
          providerConfig,
        );
      } catch (providerError) {
        // DEBUG: console providerError
        console.log(`providerError`, providerError);
        // Handle provider creation errors directly
        const errorDetail = this.extractErrorDetails(providerError, config.api.provider);

        yield {
          requestId,
          content: `Error: ${errorDetail.message || errorDetail.name}`,
          status: 'error',
          errorDetail,
        };
        return;
      }

      // Process the stream
      let fullResponse = '';

      // Iterate through stream chunks
      for await (const chunk of result.textStream) {
        // Check cancellation
        if (controller.signal.aborted) {
          yield {
            requestId,
            content: 'Request cancelled',
            status: 'error',
          };
          return;
        }

        // Process content
        fullResponse += chunk;
        yield {
          requestId,
          content: fullResponse,
          status: 'update',
        };
      }

      // Stream completed
      yield { requestId, content: fullResponse, status: 'done' };
    } catch (error) {
      // DEBUG: console error
      console.log(`error`, error);
      // Handle errors and categorize them
      const errorDetail = this.extractErrorDetails(error, config.api.provider);

      // Yield error with details
      yield {
        requestId,
        content: `Error: ${errorDetail.message || errorDetail.name}`,
        status: 'error',
        errorDetail,
      };
    } finally {
      this.cleanupAIRequest(requestId);
    }
  }

  /**
   * Extract structured error details from various error types
   */
  private extractErrorDetails(error: unknown, provider: string): {
    name: string;
    code: string;
    provider: string;
    message?: string;
  } {
    // Check if it's already a known provider error type
    if (isProviderConfigError(error)) {
      // DEBUG: console
      console.log(`isProviderConfigError`);
      return {
        name: error.name,
        code: error.code,
        provider: error.provider,
        message: error.message,
      };
    }

    // Convert error to string for analysis
    const errorMessage = error instanceof Error ? error.message : String(error);
    // DEBUG: console errorMessage
    console.log(`errorMessage`, errorMessage);

    // Check common error patterns
    if (errorMessage.includes('API key') && errorMessage.includes('not found')) {
      return {
        name: 'MissingAPIKeyError',
        code: 'MISSING_API_KEY',
        provider,
        message: `API key for ${provider} not found`,
      };
    } else if (errorMessage.includes('requires baseURL')) {
      return {
        name: 'MissingBaseURLError',
        code: 'MISSING_BASE_URL',
        provider,
        message: `${provider} provider requires baseURL`,
      };
    } else if (errorMessage.includes('authentication failed') || errorMessage.includes('401')) {
      return {
        name: 'AuthenticationError',
        code: 'AUTHENTICATION_FAILED',
        provider,
        message: `${provider} authentication failed: Invalid API key`,
      };
    } else if (errorMessage.includes('404')) {
      return {
        name: 'ModelNotFoundError',
        code: 'MODEL_NOT_FOUND',
        provider,
        message: `Model not found for ${provider}`,
      };
    } else if (errorMessage.includes('429')) {
      return {
        name: 'RateLimitError',
        code: 'RATE_LIMIT_EXCEEDED',
        provider,
        message: `${provider} rate limit exceeded. Reduce request frequency or check API limits.`,
      };
    }

    // Generic error
    return {
      name: 'AIProviderError',
      code: 'UNKNOWN_ERROR',
      provider,
      message: errorMessage,
    };
  }

  async cancelAIRequest(requestId: string): Promise<void> {
    const controller = this.activeRequests.get(requestId);
    if (controller) {
      controller.abort();
      this.activeRequests.delete(requestId);
    }
  }

  /**
   * Get available AI models from enabled providers
   */
  async getAvailableAIModels(): Promise<string[]> {
    const mergedSettings = this.mergeWithDefaults(this.userSettings);
    // Only include models from enabled providers
    return mergedSettings.providers
      .filter(provider => provider.enabled !== false)
      .flatMap(provider => provider.models.map(model => `${provider.provider}/${model.name}`));
  }
}
