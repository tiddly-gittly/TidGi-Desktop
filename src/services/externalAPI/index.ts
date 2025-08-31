import { injectable } from 'inversify';
import { cloneDeep, mergeWith } from 'lodash';
import { nanoid } from 'nanoid';
import { defer, from, Observable } from 'rxjs';
import { filter, finalize, startWith } from 'rxjs/operators';

import { AiAPIConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { lazyInject } from '@services/container';
import { IDatabaseService } from '@services/database/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { CoreMessage, Message } from 'ai';
import { generateEmbeddingsFromProvider } from './callEmbeddingAPI';
import { streamFromProvider } from './callProviderAPI';
import { extractErrorDetails } from './errorHandlers';
import type { AIEmbeddingResponse, AIGlobalSettings, AIProviderConfig, AIStreamResponse, IExternalAPIService } from './interface';

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
  private settingsLoaded = false;

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

  private loadSettingsFromDatabase(): void {
    const savedSettings = this.databaseService.getSetting('aiSettings');
    this.userSettings = savedSettings ?? this.userSettings;
    this.settingsLoaded = true;
  }

  private ensureSettingsLoaded(): void {
    if (!this.settingsLoaded) {
      this.loadSettingsFromDatabase();
    }
  }

  private saveSettingsToDatabase(): void {
    this.databaseService.setSetting('aiSettings', this.userSettings);
  }

  async getAIProviders(): Promise<AIProviderConfig[]> {
    this.ensureSettingsLoaded();
    return cloneDeep(this.userSettings.providers);
  }

  async getAIConfig(): Promise<AiAPIConfig> {
    this.ensureSettingsLoaded();
    return cloneDeep(this.userSettings.defaultConfig);
  }

  /**
   * Get provider configuration by provider name
   */
  private async getProviderConfig(providerName: string): Promise<AIProviderConfig | undefined> {
    this.ensureSettingsLoaded();
    const providers = await this.getAIProviders();
    return providers.find(p => p.provider === providerName);
  }

  async updateProvider(provider: string, config: Partial<AIProviderConfig>): Promise<void> {
    this.ensureSettingsLoaded();
    const existingProvider = this.userSettings.providers.find(p => p.provider === provider);
    if (existingProvider) {
      Object.assign(existingProvider, config);
    } else {
      this.userSettings.providers.push({
        provider,
        models: [],
        ...config,
      });
    }

    this.saveSettingsToDatabase();
  }

  async deleteProvider(provider: string): Promise<void> {
    this.ensureSettingsLoaded();
    const index = this.userSettings.providers.findIndex(p => p.provider === provider);
    if (index !== -1) {
      this.userSettings.providers.splice(index, 1);
      this.saveSettingsToDatabase();
    }
  }

  async updateDefaultAIConfig(config: Partial<AiAPIConfig>): Promise<void> {
    this.ensureSettingsLoaded();
    this.userSettings.defaultConfig = mergeWith(
      {},
      this.userSettings.defaultConfig,
      config,
    ) as typeof this.userSettings.defaultConfig;
    this.saveSettingsToDatabase();
  }

  async deleteFieldFromDefaultAIConfig(fieldPath: string): Promise<void> {
    this.ensureSettingsLoaded();

    // Support nested field deletion like 'api.embeddingModel'
    const pathParts = fieldPath.split('.');
    let current: Record<string, unknown> = this.userSettings.defaultConfig;

    // Navigate to the parent object
    for (let index = 0; index < pathParts.length - 1; index++) {
      const part = pathParts[index];
      if (current && typeof current === 'object' && part in current) {
        current = current[part] as Record<string, unknown>;
      } else {
        // Path doesn't exist, nothing to delete
        return;
      }
    }

    // Delete the final field
    const finalField = pathParts[pathParts.length - 1];
    if (current && typeof current === 'object' && finalField in current) {
      // Use Reflect.deleteProperty for safe dynamic property deletion
      Reflect.deleteProperty(current, finalField);
      this.saveSettingsToDatabase();
    }
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
    logger.debug(`[${requestId}] Starting generateFromAI with config`, messages);

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
      let result: ReturnType<typeof streamFromProvider>;
      try {
        result = streamFromProvider(
          config,
          messages,
          controller.signal,
          providerConfig,
        );
      } catch (providerError) {
        // Handle provider creation errors directly
        const errorDetail = extractErrorDetails(providerError, config.api.provider);

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
      // Handle errors and categorize them
      const errorDetail = extractErrorDetails(error, config.api.provider);

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

  async cancelAIRequest(requestId: string): Promise<void> {
    const controller = this.activeRequests.get(requestId);
    if (controller) {
      controller.abort();
      this.activeRequests.delete(requestId);
    }
  }

  async generateEmbeddings(
    inputs: string[],
    config: AiAPIConfig,
    options?: {
      dimensions?: number;
      encoding_format?: 'float' | 'base64';
    },
  ): Promise<AIEmbeddingResponse> {
    // Prepare request context
    const { requestId, controller } = this.prepareAIRequest();
    logger.debug(`[${requestId}] Starting generateEmbeddings with config`, { inputCount: inputs.length });

    try {
      // Get provider configuration
      const providerConfig = await this.getProviderConfig(config.api.provider);
      if (!providerConfig) {
        return {
          requestId,
          embeddings: [],
          model: config.api.model,
          object: 'error',
          status: 'error',
          errorDetail: {
            name: 'MissingProviderError',
            code: 'PROVIDER_NOT_FOUND',
            provider: config.api.provider,
          },
        };
      }

      // Generate embeddings
      const result = await generateEmbeddingsFromProvider(
        inputs,
        config,
        controller.signal,
        providerConfig,
        options,
      );

      return result;
    } catch (error) {
      // Handle errors and categorize them
      const errorDetail = extractErrorDetails(error, config.api.provider);

      return {
        requestId,
        embeddings: [],
        model: config.api.model,
        object: 'error',
        status: 'error',
        errorDetail,
      };
    } finally {
      this.cleanupAIRequest(requestId);
    }
  }
}
