import { inject, injectable } from 'inversify';
import { cloneDeep, mergeWith } from 'lodash';
import { nanoid } from 'nanoid';
import { BehaviorSubject, defer, from, Observable } from 'rxjs';
import { filter, finalize, startWith } from 'rxjs/operators';

import { AiAPIConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import type { IDatabaseService } from '@services/database/interface';
import { ExternalAPICallType, ExternalAPILogEntity, RequestMetadata, ResponseMetadata } from '@services/database/schema/externalAPILog';
import { logger } from '@services/libs/log';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { ModelMessage } from 'ai';
import { DataSource, Repository } from 'typeorm';
import { generateEmbeddingsFromProvider } from './callEmbeddingAPI';
import { generateImageFromProvider } from './callImageGenerationAPI';
import { streamFromProvider } from './callProviderAPI';
import { generateSpeechFromProvider } from './callSpeechAPI';
import { generateTranscriptionFromProvider } from './callTranscriptionsAPI';
import { extractErrorDetails } from './errorHandlers';
import type {
  AIEmbeddingResponse,
  AIGlobalSettings,
  AIImageGenerationResponse,
  AIProviderConfig,
  AISpeechResponse,
  AIStreamResponse,
  AITranscriptionResponse,
  IExternalAPIService,
  ModelInfo,
} from './interface';

/**
 * Simplified request context
 */
interface AIRequestContext {
  requestId: string;
  controller: AbortController;
}

@injectable()
export class ExternalAPIService implements IExternalAPIService {
  @inject(serviceIdentifier.Preference)
  private readonly preferenceService!: IPreferenceService;

  @inject(serviceIdentifier.Database)
  private readonly databaseService!: IDatabaseService;

  private dataSource: DataSource | null = null;
  private apiLogRepository: Repository<ExternalAPILogEntity> | null = null;
  private activeRequests: Map<string, AbortController> = new Map();
  private settingsLoaded = false;

  private userSettings: AIGlobalSettings = {
    providers: [],
    defaultConfig: {
      default: {
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

  // Observable to emit config changes
  public defaultConfig$ = new BehaviorSubject<AiAPIConfig>(this.userSettings.defaultConfig);
  public providers$ = new BehaviorSubject<AIProviderConfig[]>(this.userSettings.providers);

  /**
   * Initialize the external API service
   */
  public async initialize(): Promise<void> {
    /**
     * Initialize database connection for API logging
     */
    // Only initialize if debug logging is enabled
    const externalAPIDebug = await this.preferenceService.get('externalAPIDebug');
    if (!externalAPIDebug) return;
    // Get or initialize the external API database
    await this.databaseService.initializeDatabase('externalApi');
    this.dataSource = await this.databaseService.getDatabase('externalApi');
    this.apiLogRepository = this.dataSource.getRepository(ExternalAPILogEntity);
    logger.debug('External API logging initialized');
  }

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
    // Emit updated config and providers to subscribers
    this.defaultConfig$.next(cloneDeep(this.userSettings.defaultConfig));
    this.providers$.next(cloneDeep(this.userSettings.providers));
  }

  /**
   * React to configuration changes - implements form field linkage logic
   * Similar to Preference service's reactWhenPreferencesChanged pattern
   * This centralizes all auto-fill and field linkage logic in one place
   *
   * Called after any config update to handle:
   * 1. Auto-fill empty default model fields when new models are added
   * 2. Future: other field linkage rules
   */
  private reactToConfigChange(): void {
    const defaultConfig = this.userSettings.defaultConfig;
    const providers = this.userSettings.providers;
    let configChanged = false;

    // Collect all available models from all enabled providers
    const allModels: Array<{ provider: string; model: ModelInfo }> = [];
    for (const provider of providers) {
      if (provider.enabled === false) continue;
      for (const model of provider.models) {
        allModels.push({ provider: provider.provider, model });
      }
    }

    // Auto-fill empty default fields with first matching model
    for (const { provider, model } of allModels) {
      if (!model.features || model.features.length === 0) continue;

      // Auto-fill default language model - only if not set
      if (
        model.features.includes('language') &&
        (!defaultConfig.default?.model || !defaultConfig.default?.provider)
      ) {
        defaultConfig.default = { provider, model: model.name };
        configChanged = true;
        logger.info(`Auto-filled default language model: ${provider}/${model.name}`);
      }

      // Auto-fill embedding model
      if (
        model.features.includes('embedding') &&
        (!defaultConfig.embedding?.model || !defaultConfig.embedding?.provider)
      ) {
        defaultConfig.embedding = { provider, model: model.name };
        configChanged = true;
        logger.info(`Auto-filled default embedding model: ${provider}/${model.name}`);
      }

      // Auto-fill speech model
      if (
        model.features.includes('speech') &&
        (!defaultConfig.speech?.model || !defaultConfig.speech?.provider)
      ) {
        defaultConfig.speech = { provider, model: model.name };
        configChanged = true;
        logger.info(`Auto-filled default speech model: ${provider}/${model.name}`);
      }

      // Auto-fill image generation model
      if (
        model.features.includes('imageGeneration') &&
        (!defaultConfig.imageGeneration?.model || !defaultConfig.imageGeneration?.provider)
      ) {
        defaultConfig.imageGeneration = { provider, model: model.name };
        configChanged = true;
        logger.info(`Auto-filled default image generation model: ${provider}/${model.name}`);
      }

      // Auto-fill transcriptions model
      if (
        model.features.includes('transcriptions') &&
        (!defaultConfig.transcriptions?.model || !defaultConfig.transcriptions?.provider)
      ) {
        defaultConfig.transcriptions = { provider, model: model.name };
        configChanged = true;
        logger.info(`Auto-filled default transcriptions model: ${provider}/${model.name}`);
      }

      // Auto-fill free model
      if (
        model.features.includes('free') &&
        (!defaultConfig.free?.model || !defaultConfig.free?.provider)
      ) {
        defaultConfig.free = { provider, model: model.name };
        configChanged = true;
        logger.info(`Auto-filled default free model: ${provider}/${model.name}`);
      }
    }

    // Only save if we actually changed something
    if (configChanged) {
      // Save without triggering reactToConfigChange again (use internal save)
      this.databaseService.setSetting('aiSettings', this.userSettings);
      this.defaultConfig$.next(cloneDeep(this.userSettings.defaultConfig));
      this.providers$.next(cloneDeep(this.userSettings.providers));
    }
  }

  /**
   * Log API request/response if debug mode is enabled
   */
  private async logAPICall(
    requestId: string,
    callType: ExternalAPICallType,
    // Skip frequent 'update' logs
    status: 'start' | 'done' | 'error' | 'cancel',
    options: {
      agentInstanceId?: string;
      requestMetadata?: RequestMetadata;
      requestPayload?: Record<string, unknown>;
      responseContent?: string;
      responseMetadata?: ResponseMetadata;
      errorDetail?: { name: string; code: string; provider: string; message?: string };
    } = {},
  ): Promise<void> {
    try {
      // Check if debug logging is enabled
      const externalAPIDebug = await this.preferenceService.get('externalAPIDebug');
      if (!externalAPIDebug) return;

      // Ensure API logging is initialized.
      // For 'update' events we skip writes to avoid expensive DB churn.
      if (!this.apiLogRepository) {
        // If repository isn't initialized, skip all log writes (including start/error/done/cancel).
        // Tests that require logs should explicitly call `initialize()` before invoking generateFromAI.
        logger.warn('API log repository not initialized; skipping ExternalAPI log write');
        return;
      }

      // Try save; on UNIQUE race, fetch existing and merge, then save again
      const existing = await this.apiLogRepository.findOne({ where: { id: requestId } });
      const entity = this.apiLogRepository.create({
        id: requestId,
        callType,
        status,
        agentInstanceId: options.agentInstanceId ?? existing?.agentInstanceId,
        requestMetadata: options.requestMetadata || existing?.requestMetadata || { provider: 'unknown', model: 'unknown' },
        requestPayload: options.requestPayload ?? existing?.requestPayload,
        responseContent: options.responseContent ?? existing?.responseContent,
        responseMetadata: options.responseMetadata ?? existing?.responseMetadata,
        errorDetail: options.errorDetail ?? existing?.errorDetail,
      });
      try {
        await this.apiLogRepository.save(entity);
      } catch (error) {
        const message = String((error as Error).message || error);
        if (message.includes('UNIQUE') || message.includes('unique')) {
          const already = await this.apiLogRepository.findOne({ where: { id: requestId } });
          if (already) {
            // Merge fields and persist
            already.status = status;
            if (options.requestMetadata) already.requestMetadata = options.requestMetadata;
            if (options.requestPayload) already.requestPayload = options.requestPayload;
            if (options.responseContent !== undefined) already.responseContent = options.responseContent;
            if (options.responseMetadata) already.responseMetadata = options.responseMetadata;
            if (options.errorDetail) already.errorDetail = options.errorDetail;
            await this.apiLogRepository.save(already);
          } else {
            // Last resort: rethrow to warn handler
            throw error;
          }
        } else {
          throw error;
        }
      }
    } catch (error) {
      logger.warn(`Failed to log API call: ${error as Error}`);
      // Don't throw - logging failures shouldn't break main functionality
    }
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

    // Save the provider update
    this.saveSettingsToDatabase();

    // React to the change: check if any default model fields need auto-filling
    this.reactToConfigChange();
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

    // Deep merge with custom strategy: ignore undefined values to prevent clearing existing fields
    this.userSettings.defaultConfig = mergeWith(
      {},
      this.userSettings.defaultConfig,
      config,
      // Custom merge function: skip undefined values
      (objectValue: unknown, sourceValue: unknown) => {
        // If source value is undefined, keep the original value
        if (sourceValue === undefined) {
          return objectValue;
        }
        // For other values, let lodash handle the merge
        return undefined;
      },
    ) as typeof this.userSettings.defaultConfig;

    this.saveSettingsToDatabase();

    // React to config change for potential auto-fill
    this.reactToConfigChange();
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

  streamFromAI(messages: Array<ModelMessage>, config: AiAPIConfig, options?: { agentInstanceId?: string }): Observable<AIStreamResponse> {
    // Use defer to create a new observable stream for each subscription
    return defer(() => {
      // Prepare request context
      const { requestId, controller } = this.prepareAIRequest();

      // Get AsyncGenerator from generateFromAI and convert to Observable
      return from(this.generateFromAI(messages, config, options)).pipe(
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
    messages: Array<ModelMessage>,
    config: AiAPIConfig,
    options?: { agentInstanceId?: string; awaitLogs?: boolean },
  ): AsyncGenerator<AIStreamResponse, void, unknown> {
    // Prepare request with minimal context
    const { requestId, controller } = this.prepareAIRequest();

    // Get the default model configuration
    const modelConfig = config.default;
    if (!modelConfig?.provider || !modelConfig?.model) {
      yield {
        requestId,
        content: 'No default model configured',
        status: 'error',
        errorDetail: {
          name: 'MissingConfigError',
          code: 'NO_DEFAULT_MODEL',
          provider: 'unknown',
        },
      };
      return;
    }

    logger.debug(`[${requestId}] Starting generateFromAI with messages`, messages);

    // Log request start. If caller requested blocking logs (tests), await the DB write so it's visible synchronously.
    if (options?.awaitLogs) {
      await this.logAPICall(requestId, 'streaming', 'start', {
        agentInstanceId: options?.agentInstanceId,
        requestMetadata: {
          provider: modelConfig.provider,
          model: modelConfig.model,
          messageCount: messages.length,
        },
        requestPayload: {
          messages: messages,
          config: config,
        },
      });
    } else {
      void this.logAPICall(requestId, 'streaming', 'start', {
        agentInstanceId: options?.agentInstanceId,
        requestMetadata: {
          provider: modelConfig.provider,
          model: modelConfig.model,
          messageCount: messages.length,
        },
        requestPayload: {
          messages: messages,
          config: config,
        },
      });
    }

    try {
      // Send start event
      yield { requestId, content: '', status: 'start' };

      // Get provider configuration
      const providerConfig = await this.getProviderConfig(modelConfig.provider);
      if (!providerConfig) {
        const errorMessage = `Provider ${modelConfig.provider} not found or not configured`;
        const errorResponse = {
          requestId,
          content: errorMessage,
          status: 'error' as const,
          errorDetail: {
            name: 'MissingProviderError',
            code: 'PROVIDER_NOT_FOUND',
            provider: modelConfig.provider,
          },
        };
        if (options?.awaitLogs) {
          await this.logAPICall(requestId, 'streaming', 'error', {
            errorDetail: errorResponse.errorDetail,
          });
        } else {
          void this.logAPICall(requestId, 'streaming', 'error', {
            errorDetail: errorResponse.errorDetail,
          });
        }
        yield errorResponse;
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
        const errorDetail = extractErrorDetails(providerError, modelConfig.provider);
        if (options?.awaitLogs) {
          await this.logAPICall(requestId, 'streaming', 'error', { errorDetail });
        } else {
          void this.logAPICall(requestId, 'streaming', 'error', { errorDetail });
        }

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
      const startTime = Date.now();

      // Iterate through stream chunks
      for await (const chunk of result.textStream) {
        // Process content
        fullResponse += chunk;

        // Check cancellation after processing chunk so we capture the latest partial content
        if (controller.signal.aborted) {
          void this.logAPICall(requestId, 'streaming', 'cancel', { responseContent: fullResponse });
          yield {
            requestId,
            content: 'Request cancelled',
            status: 'error',
          };
          return;
        }

        yield {
          requestId,
          content: fullResponse,
          status: 'update',
        };
      }

      // Stream completed
      const duration = Date.now() - startTime;
      // Log done (optional, and async; awaiting can be expensive for long responses)
      void this.logAPICall(requestId, 'streaming', 'done', {
        responseContent: fullResponse,
        responseMetadata: {
          duration,
        },
      });

      yield { requestId, content: fullResponse, status: 'done' };
    } catch (error) {
      // Handle errors and categorize them
      const errorDetail = extractErrorDetails(error, modelConfig.provider);

      if (options?.awaitLogs) {
        await this.logAPICall(requestId, 'streaming', 'error', { errorDetail });
      } else {
        void this.logAPICall(requestId, 'streaming', 'error', { errorDetail });
      }

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

    // Get embedding model configuration, fallback to default
    const modelConfig = config.embedding ?? config.default;
    if (!modelConfig?.provider || !modelConfig?.model) {
      return {
        requestId,
        embeddings: [],
        model: 'unknown',
        object: 'error',
        status: 'error',
        errorDetail: {
          name: 'MissingConfigError',
          code: 'NO_EMBEDDING_MODEL',
          provider: 'unknown',
        },
      };
    }

    logger.debug(`[${requestId}] Starting generateEmbeddings with config`, { inputCount: inputs.length });

    try {
      // Get provider configuration
      const providerConfig = await this.getProviderConfig(modelConfig.provider);
      if (!providerConfig) {
        return {
          requestId,
          embeddings: [],
          model: modelConfig.model,
          object: 'error',
          status: 'error',
          errorDetail: {
            name: 'MissingProviderError',
            code: 'PROVIDER_NOT_FOUND',
            provider: modelConfig.provider,
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
      const errorDetail = extractErrorDetails(error, modelConfig.provider);

      return {
        requestId,
        embeddings: [],
        model: modelConfig.model,
        object: 'error',
        status: 'error',
        errorDetail,
      };
    } finally {
      this.cleanupAIRequest(requestId);
    }
  }

  async generateSpeech(
    input: string,
    config: AiAPIConfig,
    options?: {
      responseFormat?: string;
      sampleRate?: number;
      speed?: number;
      gain?: number;
      voice?: string;
      stream?: boolean;
      maxTokens?: number;
    },
  ): Promise<AISpeechResponse> {
    // Prepare request context
    const { requestId, controller } = this.prepareAIRequest();

    // Get speech model configuration, fallback to default
    const modelConfig = config.speech ?? config.default;
    if (!modelConfig?.provider || !modelConfig?.model) {
      return {
        requestId,
        audio: new ArrayBuffer(0),
        format: 'mp3',
        model: 'unknown',
        status: 'error',
        errorDetail: {
          name: 'MissingConfigError',
          code: 'NO_SPEECH_MODEL',
          provider: 'unknown',
        },
      };
    }

    logger.debug(`[${requestId}] Starting generateSpeech with config`, { inputLength: input.length });

    try {
      // Get provider configuration
      const providerConfig = await this.getProviderConfig(modelConfig.provider);
      if (!providerConfig) {
        return {
          requestId,
          audio: new ArrayBuffer(0),
          format: 'mp3',
          model: modelConfig.model,
          status: 'error',
          errorDetail: {
            name: 'MissingProviderError',
            code: 'PROVIDER_NOT_FOUND',
            provider: modelConfig.provider,
          },
        };
      }

      // Generate speech
      const result = await generateSpeechFromProvider(
        input,
        config,
        controller.signal,
        providerConfig,
        options,
      );

      return result;
    } catch (error) {
      // Handle errors and categorize them
      const errorDetail = extractErrorDetails(error, modelConfig.provider);

      return {
        requestId,
        audio: new ArrayBuffer(0),
        format: 'mp3',
        model: modelConfig.model,
        status: 'error',
        errorDetail,
      };
    } finally {
      this.cleanupAIRequest(requestId);
    }
  }

  async generateTranscription(
    audioFile: File | Blob,
    config: AiAPIConfig,
    options?: {
      language?: string;
      responseFormat?: string;
      temperature?: number;
      prompt?: string;
    },
  ): Promise<AITranscriptionResponse> {
    // Prepare request context
    const { requestId, controller } = this.prepareAIRequest();

    // Get transcriptions model configuration, fallback to default
    const modelConfig = config.transcriptions ?? config.default;
    if (!modelConfig?.provider || !modelConfig?.model) {
      return {
        requestId,
        text: '',
        model: 'unknown',
        status: 'error',
        errorDetail: {
          name: 'MissingConfigError',
          code: 'NO_TRANSCRIPTIONS_MODEL',
          provider: 'unknown',
        },
      };
    }

    logger.debug(`[${requestId}] Starting generateTranscription with config`);

    try {
      // Get provider configuration
      const providerConfig = await this.getProviderConfig(modelConfig.provider);
      if (!providerConfig) {
        return {
          requestId,
          text: '',
          model: modelConfig.model,
          status: 'error',
          errorDetail: {
            name: 'MissingProviderError',
            code: 'PROVIDER_NOT_FOUND',
            provider: modelConfig.provider,
          },
        };
      }

      // Generate transcription
      const result = await generateTranscriptionFromProvider(
        audioFile,
        config,
        controller.signal,
        providerConfig,
        options,
      );

      return result;
    } catch (error) {
      // Handle errors and categorize them
      const errorDetail = extractErrorDetails(error, modelConfig.provider);

      return {
        requestId,
        text: '',
        model: modelConfig.model,
        status: 'error',
        errorDetail,
      };
    } finally {
      this.cleanupAIRequest(requestId);
    }
  }

  async generateImage(
    prompt: string,
    config: AiAPIConfig,
    options?: {
      numImages?: number;
      width?: number;
      height?: number;
    },
  ): Promise<AIImageGenerationResponse> {
    // Prepare request context
    const { requestId, controller } = this.prepareAIRequest();

    // Get image generation model configuration, fallback to default
    const modelConfig = config.imageGeneration ?? config.default;
    if (!modelConfig?.provider || !modelConfig?.model) {
      return {
        requestId,
        images: [],
        model: 'unknown',
        status: 'error',
        errorDetail: {
          name: 'MissingConfigError',
          code: 'NO_IMAGE_GENERATION_MODEL',
          provider: 'unknown',
        },
      };
    }

    logger.debug(`[${requestId}] Starting generateImage with config`, { promptLength: prompt.length });

    try {
      // Get provider configuration
      const providerConfig = await this.getProviderConfig(modelConfig.provider);
      if (!providerConfig) {
        return {
          requestId,
          images: [],
          model: modelConfig.model,
          status: 'error',
          errorDetail: {
            name: 'MissingProviderError',
            code: 'PROVIDER_NOT_FOUND',
            provider: modelConfig.provider,
          },
        };
      }

      // Generate image
      const result = await generateImageFromProvider(
        prompt,
        config,
        controller.signal,
        providerConfig,
        options,
      );

      return result;
    } catch (error) {
      // Handle errors and categorize them
      const errorDetail = extractErrorDetails(error, modelConfig.provider);

      return {
        requestId,
        images: [],
        model: modelConfig.model,
        status: 'error',
        errorDetail,
      };
    } finally {
      this.cleanupAIRequest(requestId);
    }
  }

  /**
   * Get API call logs for debugging purposes
   */
  async getAPILogs(agentInstanceId?: string, limit = 100, offset = 0): Promise<ExternalAPILogEntity[]> {
    try {
      // Check if debug logging is enabled
      const externalAPIDebug = await this.preferenceService.get('externalAPIDebug');
      if (!externalAPIDebug) {
        logger.warn('External API debug logging is disabled, returning empty results');
        return [];
      }

      // Ensure API logging is initialized. If not initialized yet, return empty results and warn.
      if (!this.apiLogRepository) {
        logger.warn('API log repository not initialized; returning empty log results');
        return [];
      }

      // Build query
      const queryBuilder = this.apiLogRepository
        .createQueryBuilder('log')
        .orderBy('log.createdAt', 'DESC')
        .limit(limit)
        .offset(offset);

      // Filter by agent instance ID if provided
      if (agentInstanceId) {
        queryBuilder.where('log.agentInstanceId = :agentInstanceId', { agentInstanceId });
      }

      // Only return streaming and immediate calls (not embedding)
      queryBuilder.andWhere('log.callType IN (:...callTypes)', {
        callTypes: ['streaming', 'immediate'],
      });

      const logs = await queryBuilder.getMany();
      return logs;
    } catch (error) {
      logger.error(`Failed to get API logs: ${error as Error}`);
      return [];
    }
  }
}
