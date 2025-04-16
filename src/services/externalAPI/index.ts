/* eslint-disable @typescript-eslint/require-await */
import { injectable } from 'inversify';
import { cloneDeep, mergeWith } from 'lodash';
import { nanoid } from 'nanoid';
import { Observable } from 'rxjs';

import { lazyInject } from '@services/container';
import { IDatabaseService } from '@services/database/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { streamFromProvider } from './callProviderAPI';
import rawDefaultProvidersConfig from './defaultProviders.json';
import type { AIMessage, AIProviderConfig, AISessionConfig, AISettings, AIStreamResponse, IExternalAPIService, ModelFeature } from './interface';

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
          // Ensure features type is correct
          if (userProvider.models) {
            userProvider.models.forEach(model => {
              if (model.features) {
                model.features = model.features;
              }
            });
          }

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

  streamFromAI(messages: AIMessage[], config: AISessionConfig): Observable<AIStreamResponse> {
    return new Observable<AIStreamResponse>(observer => {
      // Generate unique request ID internally
      const requestId = nanoid();
      
      // Cancel existing request with same ID (shouldn't happen but as precaution)
      if (this.activeRequests.has(requestId)) {
        this.cancelAIRequest(requestId)
          .catch(error => logger.error(`Error canceling previous request ${requestId}:`, error));
      }

      // Create controller for this request
      const controller = new AbortController();
      this.activeRequests.set(requestId, controller);

      // Helper function to emit events via the observer
      const emitEvent = (content: string, status: 'start' | 'update' | 'done' | 'error' | 'cancel') => {
        if (status === 'done' && (!content || content.trim() === '')) {
          content = '(No response, please check API settings and network connection)';
        }
        observer.next({ requestId, content, status });
      };

      // Get provider configuration asynchronously
      this.getProviderConfig(config.provider)
        .then(providerConfig => {
          // Emit start event
          emitEvent('', 'start');

          const result = streamFromProvider(
            config,
            messages,
            controller.signal,
            providerConfig,
          );

          let fullResponse = '';
          let firstChunkReceived = false;
          let timeoutId: NodeJS.Timeout | undefined;

          // Set timeout for initial response
          const responseTimeout = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(new Error(`${config.provider} model ${config.model} response timeout`));
            }, 30000);
          });

          // Process stream
          const processStream = async () => {
            try {
              await Promise.race([
                (async () => {
                  for await (const chunk of result.textStream) {
                    if (!firstChunkReceived) {
                      if (timeoutId) clearTimeout(timeoutId);
                      firstChunkReceived = true;
                    }

                    fullResponse += chunk;
                    emitEvent(fullResponse, 'update');
                  }
                  
                  // Complete
                  emitEvent(fullResponse, 'done');
                  observer.complete();
                })(),
                responseTimeout,
              ]);
            } catch (streamError) {
              if (timeoutId) clearTimeout(timeoutId);
              throw streamError;
            }
          };

          // Start processing
          processStream().catch(error => {
            const errorMessage = `Error: ${error instanceof Error ? error.message : String(error)}`;
            emitEvent(errorMessage, 'error');
            observer.error(error);
          }).finally(() => {
            this.activeRequests.delete(requestId);
          });
        })
        .catch(error => {
          const errorMessage = `Error: ${error instanceof Error ? error.message : String(error)}`;
          emitEvent(errorMessage, 'error');
          observer.error(error);
          this.activeRequests.delete(requestId);
        });

      // Return cleanup function
      return () => {
        if (this.activeRequests.has(requestId)) {
          this.activeRequests.get(requestId)?.abort();
          this.activeRequests.delete(requestId);
        }
      };
    });
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
