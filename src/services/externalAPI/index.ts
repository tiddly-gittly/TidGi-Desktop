/* eslint-disable @typescript-eslint/require-await */
import { injectable } from 'inversify';
import { cloneDeep, mergeWith } from 'lodash';
import { nanoid } from 'nanoid';
import { defer, from, Observable } from 'rxjs';
import { filter, finalize, startWith } from 'rxjs/operators';

import { lazyInject } from '@services/container';
import { IDatabaseService } from '@services/database/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { CoreMessage, Message } from 'ai';
import { streamFromProvider } from './callProviderAPI';
import rawDefaultProvidersConfig from './defaultProviders.json';
import type { AIProviderConfig, AISessionConfig, AISettings, AIStreamResponse, IExternalAPIService, ModelFeature } from './interface';

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

  private userSettings: AISettings = {
    providers: [],
    defaultConfig: {} as AISessionConfig,
  };

  constructor() {
    this.loadSettingsFromDatabase();
  }

  /**
   * Merge user settings with default settings without modifying stored data
   */
  private mergeWithDefaults(settings: AISettings): AISettings {
    const defaultSettings: AISettings = {
      providers: cloneDeep(defaultProvidersConfig.providers),
      defaultConfig: { ...defaultProvidersConfig.defaultConfig },
    };

    return mergeWith({} as AISettings, defaultSettings, settings, (
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
  async getAIConfig(partialConfig?: Partial<AISessionConfig>): Promise<AISessionConfig> {
    const mergedSettings = this.mergeWithDefaults(this.userSettings);
    const defaultConfig: AISessionConfig = {
      provider: mergedSettings.defaultConfig.provider,
      model: mergedSettings.defaultConfig.model,
      modelParameters: {
        temperature: 0.7,
        systemPrompt: 'You are a helpful assistant.',
        topP: 0.95,
      },
    };

    if (partialConfig) {
      // Merge top-level properties
      const result: AISessionConfig = {
        ...defaultConfig,
        ...partialConfig,
      };

      // Separately merge model parameters if they exist
      if (partialConfig.modelParameters || defaultConfig.modelParameters) {
        result.modelParameters = {
          ...defaultConfig.modelParameters,
          ...partialConfig.modelParameters,
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

  async updateDefaultAIConfig(config: Partial<AISessionConfig>): Promise<void> {
    // Update config properties
    if (config.provider !== undefined) {
      this.userSettings.defaultConfig.provider = config.provider;
    }

    if (config.model !== undefined) {
      this.userSettings.defaultConfig.model = config.model;
    }

    if (config.modelParameters !== undefined) {
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

  streamFromAI(messages: Array<CoreMessage> | Array<Omit<Message, 'id'>>, config: AISessionConfig): Observable<AIStreamResponse> {
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
    config: AISessionConfig,
  ): AsyncGenerator<AIStreamResponse, void, unknown> {
    // Prepare request with minimal context
    const { requestId, controller } = this.prepareAIRequest();

    try {
      // Send start event
      yield { requestId, content: '', status: 'start' };

      // Get provider configuration
      const providerConfig = await this.getProviderConfig(config.provider);
      if (!providerConfig) {
        yield {
          requestId,
          content: `Provider ${config.provider} not found or not configured`,
          status: 'error',
        };
        return;
      }

      // Create the stream
      const result = streamFromProvider(
        config,
        messages,
        controller.signal,
        providerConfig,
      );

      // Process the stream
      let fullResponse = '';

      // Iterate through stream chunks
      for await (const chunk of result.textStream) {
        // Accumulate response and yield updates
        fullResponse += chunk;
        yield { requestId, content: fullResponse, status: 'update' };
      }

      // Stream completed
      yield { requestId, content: fullResponse, status: 'done' };
    } catch (error) {
      // Basic error handling
      const errorMessage = error instanceof Error ? error.message : String(error);
      yield { requestId, content: `Error: ${errorMessage}`, status: 'error' };
    } finally {
      this.cleanupAIRequest(requestId);
    }
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
