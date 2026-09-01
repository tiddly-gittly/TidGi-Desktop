import { app, safeStorage } from 'electron';
import { inject, injectable } from 'inversify';
import { nanoid } from 'nanoid';
import path from 'node:path';
import { BehaviorSubject } from 'rxjs';

import type { IDatabaseService } from '@services/database/interface';
import { ExternalAPICallType, ExternalAPILogEntity, RequestMetadata, ResponseMetadata } from '@services/database/schema/externalAPILog';
import { logger } from '@services/libs/log';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import {
  assertPortableLlmRequest,
  assertPortableLlmStreamPart,
  type ModelAssignments,
  type ModelCatalogManager,
  type ModelCatalogModel,
  type ModelCatalogResolution,
  normalizeModelAssignments,
  normalizeProviderAccountConfig,
  normalizeProviderAccountSettings,
  type PortableLlmRequest,
  type PortableLlmStreamPart,
  type ProviderAccountConfig,
} from 'memeloop';
import { DataSource, Repository } from 'typeorm';
import { generateEmbeddingsFromProvider } from './callEmbeddingAPI';
import { generateImageFromProvider } from './callImageGenerationAPI';
import { resolveProviderModelRoute } from './callProviderAPI';
import { generateSpeechFromProvider } from './callSpeechAPI';
import { generateTranscriptionFromProvider } from './callTranscriptionsAPI';
import { extractErrorDetails } from './errorHandlers';
import type { AIEmbeddingResponse, AIImageGenerationResponse, AISpeechResponse, AITranscriptionResponse, DesktopExternalAPISettings, IExternalAPIService } from './interface';
import { discoverOfficialModelIds, mergeDiscoveredProviderRoutes } from './officialModels';
import { isLoopbackOpenAIBaseURL } from './openAIBaseURL';
import { createDesktopModelCatalogManager } from './providerCatalog';
import { desktopLlmProviderFactoryPort } from './providerFactory';

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
  private initializationPromise: Promise<void> | null = null; // Prevent race condition in lazy initialization
  private activeRequests: Map<string, AbortController> = new Map();
  private settingsLoaded = false;
  private modelCatalogManager: ModelCatalogManager | undefined;

  private userSettings: DesktopExternalAPISettings = {
    accounts: [],
    providerCredentials: [],
    modelAssignments: {},
  };

  // Observable to emit config changes - will be updated when settings are loaded
  public defaultConfig$ = new BehaviorSubject<ModelAssignments>(this.userSettings.modelAssignments);
  public providerAccounts$ = new BehaviorSubject<ProviderAccountConfig[]>([...this.userSettings.accounts]);

  /**
   * Initialize the external API service
   */
  public async initialize(): Promise<void> {
    // Load settings from database first
    this.ensureSettingsLoaded();

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
    if (savedSettings !== undefined) {
      try {
        this.userSettings = normalizeDesktopExternalAPISettings(savedSettings);
      } catch (error) {
        logger.warn('Ignoring invalid or obsolete external API settings', error);
      }
    }
    this.settingsLoaded = true;

    // Update Observables with loaded settings
    this.defaultConfig$.next(normalizeModelAssignments(this.userSettings.modelAssignments));
    this.providerAccounts$.next(this.getPublicProviderAccounts());
  }

  private ensureSettingsLoaded(): void {
    if (!this.settingsLoaded) {
      this.loadSettingsFromDatabase();
    }
  }

  private saveSettingsToDatabase(): void {
    this.databaseService.setSetting('aiSettings', this.userSettings);
    // Emit updated config and providers to subscribers
    this.defaultConfig$.next(normalizeModelAssignments(this.userSettings.modelAssignments));
    this.providerAccounts$.next(this.getPublicProviderAccounts());
  }

  private getPublicProviderAccounts(): ProviderAccountConfig[] {
    return this.userSettings.accounts.map(account => normalizeProviderAccountConfig(account));
  }

  private getRuntimeProviderAccount(providerId: string): [ProviderAccountConfig, string] | undefined {
    const stored = this.userSettings.accounts.find(account => account.providerId === providerId);
    if (!stored) return undefined;
    const credential = this.userSettings.providerCredentials.find(candidate => candidate.providerId === providerId);
    let apiKey = '';
    if (credential) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('secure_storage_unavailable');
      apiKey = safeStorage.decryptString(Buffer.from(credential.encryptedApiKey, 'base64'));
    }
    return [normalizeProviderAccountConfig(stored), apiKey];
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
    const defaultConfig = normalizeModelAssignments(this.userSettings.modelAssignments);
    const accounts = this.userSettings.accounts;
    let configChanged = false;

    const allModels: Array<{
      account: ProviderAccountConfig;
      model: ModelCatalogModel | undefined;
      modelId: string;
    }> = [];
    for (const account of accounts) {
      if (account.enabled === false) continue;
      for (const route of account.models) {
        const model = account.catalogProvider?.models.find(candidate => candidate.id === route.modelId || candidate.id === route.wireModelId);
        allModels.push({ account, model, modelId: route.modelId });
      }
    }

    for (const { account, model, modelId } of allModels) {
      const selection = { providerId: account.providerId, modelId };
      if (
        isCatalogModelCapability(model, 'language') &&
        (!defaultConfig.default?.modelId || !defaultConfig.default?.providerId)
      ) {
        defaultConfig.default = selection;
        configChanged = true;
        logger.info(`Auto-filled default language model: ${account.providerId}/${modelId}`);
      }
      if (
        isCatalogModelCapability(model, 'embedding') &&
        (!defaultConfig.embedding?.modelId || !defaultConfig.embedding?.providerId)
      ) {
        defaultConfig.embedding = selection;
        configChanged = true;
        logger.info(`Auto-filled default embedding model: ${account.providerId}/${modelId}`);
      }
      if (
        isCatalogModelCapability(model, 'speech') &&
        (!defaultConfig.speech?.modelId || !defaultConfig.speech?.providerId)
      ) {
        defaultConfig.speech = selection;
        configChanged = true;
        logger.info(`Auto-filled default speech model: ${account.providerId}/${modelId}`);
      }
      if (
        isCatalogModelCapability(model, 'imageGeneration') &&
        (!defaultConfig.imageGeneration?.modelId || !defaultConfig.imageGeneration?.providerId)
      ) {
        defaultConfig.imageGeneration = selection;
        configChanged = true;
        logger.info(`Auto-filled default image generation model: ${account.providerId}/${modelId}`);
      }
      if (
        isCatalogModelCapability(model, 'transcriptions') &&
        (!defaultConfig.transcriptions?.modelId || !defaultConfig.transcriptions?.providerId)
      ) {
        defaultConfig.transcriptions = selection;
        configChanged = true;
        logger.info(`Auto-filled default transcriptions model: ${account.providerId}/${modelId}`);
      }
      if (
        isCatalogModelCapability(model, 'language') &&
        (!defaultConfig.free?.modelId || !defaultConfig.free?.providerId)
      ) {
        defaultConfig.free = selection;
        configChanged = true;
        logger.info(`Auto-filled auxiliary text model: ${account.providerId}/${modelId}`);
      }
    }

    // Only save if we actually changed something
    if (configChanged) {
      this.userSettings = {
        ...this.userSettings,
        modelAssignments: normalizeModelAssignments(defaultConfig),
      };
      // Save without triggering reactToConfigChange again (use internal save)
      this.databaseService.setSetting('aiSettings', this.userSettings);
      this.defaultConfig$.next(normalizeModelAssignments(this.userSettings.modelAssignments));
      this.providerAccounts$.next(this.getPublicProviderAccounts());
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
      errorDetail?: { name: string; code: string; providerId: string; message?: string };
    } = {},
  ): Promise<void> {
    try {
      // Check if debug logging is enabled
      const externalAPIDebug = await this.preferenceService.get('externalAPIDebug');
      if (!externalAPIDebug) return;

      // Ensure API logging is initialized (lazy initialization)
      if (!this.apiLogRepository) {
        // Reuse existing initialization promise to prevent race condition
        if (!this.initializationPromise) {
          this.initializationPromise = (async () => {
            try {
              await this.databaseService.initializeDatabase('externalApi');
              this.dataSource = await this.databaseService.getDatabase('externalApi');
              this.apiLogRepository = this.dataSource.getRepository(ExternalAPILogEntity);
              logger.debug('External API logging initialized (lazy)');
            } catch (error) {
              logger.warn('Failed to initialize API log repository', error);
              this.initializationPromise = null; // Reset on failure to allow retry
              throw error;
            }
          })();
        }
        await this.initializationPromise;
        // If repository is still null after initialization, return early
        if (!this.apiLogRepository) return;
      }

      // Try save; on UNIQUE race, fetch existing and merge, then save again
      const existing = await this.apiLogRepository.findOne({ where: { id: requestId } });
      const entity = this.apiLogRepository.create({
        id: requestId,
        callType,
        status,
        agentInstanceId: options.agentInstanceId ?? existing?.agentInstanceId,
        requestMetadata: options.requestMetadata ?? existing?.requestMetadata ?? {
          providerId: 'unknown',
          logicalModelId: 'unknown',
        },
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

  async getProviderAccounts(): Promise<ProviderAccountConfig[]> {
    this.ensureSettingsLoaded();
    return this.getPublicProviderAccounts();
  }

  async getProviderApiKey(providerName: string): Promise<string> {
    this.ensureSettingsLoaded();
    return this.getRuntimeProviderAccount(providerName)?.[1] ?? '';
  }

  async setProviderApiKey(providerId: string, apiKey: string): Promise<void> {
    this.ensureSettingsLoaded();
    const accountIndex = this.userSettings.accounts.findIndex(account => account.providerId === providerId);
    if (accountIndex < 0) throw new Error(`Provider account not found: ${providerId}`);
    const credentialIndex = this.userSettings.providerCredentials.findIndex(credential => credential.providerId === providerId);
    const trimmed = apiKey.trim();
    if (trimmed === '') {
      const providerCredentials = credentialIndex >= 0
        ? this.userSettings.providerCredentials.filter(credential => credential.providerId !== providerId)
        : this.userSettings.providerCredentials;
      const account = this.userSettings.accounts[accountIndex];
      const updatedAccount = normalizeProviderAccountConfig({
        ...account,
        secretRef: undefined,
      });
      this.userSettings = {
        ...this.userSettings,
        accounts: replaceAt(this.userSettings.accounts, accountIndex, updatedAccount),
        providerCredentials,
      };
    } else {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('secure_storage_unavailable');
      const credential = {
        providerId,
        encryptedApiKey: safeStorage.encryptString(trimmed).toString('base64'),
      };
      const providerCredentials = credentialIndex >= 0
        ? replaceAt(this.userSettings.providerCredentials, credentialIndex, credential)
        : [...this.userSettings.providerCredentials, credential];
      const account = this.userSettings.accounts[accountIndex];
      const updatedAccount = normalizeProviderAccountConfig({
        ...account,
        secretRef: providerCredentialReference(providerId),
      });
      this.userSettings = {
        ...this.userSettings,
        accounts: replaceAt(this.userSettings.accounts, accountIndex, updatedAccount),
        providerCredentials,
      };
    }
    this.saveSettingsToDatabase();
  }

  async getProviderCatalog(refresh = false): Promise<ModelCatalogResolution> {
    this.modelCatalogManager ??= createDesktopModelCatalogManager({
      cachePath: path.join(app.getPath('userData'), 'model-catalog.v1.json'),
    });
    return refresh
      ? this.modelCatalogManager.refresh()
      : this.modelCatalogManager.resolve();
  }

  async refreshProviderAccountModels(providerName: string): Promise<ProviderAccountConfig> {
    this.ensureSettingsLoaded();
    const accountIndex = this.userSettings.accounts.findIndex(candidate => candidate.providerId === providerName);
    if (accountIndex < 0) throw new Error(`Provider account not found: ${providerName}`);
    const account = this.userSettings.accounts[accountIndex];
    const apiKey = this.getRuntimeProviderAccount(providerName)?.[1] ?? '';
    const discoveredIds = await discoverOfficialModelIds(account, apiKey);
    const resolution = await this.getProviderCatalog(false);
    const catalogProvider = resolution.catalog.providers.find(candidate => candidate.id === providerName) ??
      account.catalogProvider;
    const updated = mergeDiscoveredProviderRoutes(account, discoveredIds, catalogProvider);
    this.userSettings = {
      ...this.userSettings,
      accounts: replaceAt(this.userSettings.accounts, accountIndex, updated),
    };
    this.saveSettingsToDatabase();
    this.reactToConfigChange();
    return updated;
  }

  async getAIConfig(): Promise<ModelAssignments> {
    this.ensureSettingsLoaded();
    return normalizeModelAssignments(this.userSettings.modelAssignments);
  }

  async isAIAvailable(): Promise<boolean> {
    try {
      const aiConfig = await this.getAIConfig();
      // Check if free model and provider are configured
      if (!aiConfig?.free?.modelId || !aiConfig?.free?.providerId) {
        return false;
      }

      // Check if the provider has API key configured
      const runtimeAccount = this.getRuntimeProviderAccount(aiConfig.free.providerId);
      if (!runtimeAccount) {
        return false;
      }
      const [account, apiKey] = runtimeAccount;

      // Some providers like Ollama don't require API keys, check if it's enabled
      // For providers that require API keys (most cloud providers), verify it's not empty
      const isLocalOpenAICompatible = account.providerType === 'openai-compatible' && isLoopbackOpenAIBaseURL(account.baseUrl);
      const requiresApiKey = account.providerType !== 'ollama' && account.providerType !== 'comfyui' && !isLocalOpenAICompatible;
      if (requiresApiKey && !apiKey.trim()) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get provider configuration by provider name
   */
  private async getProviderAccount(providerName: string): Promise<[ProviderAccountConfig, string] | undefined> {
    this.ensureSettingsLoaded();
    return this.getRuntimeProviderAccount(providerName);
  }

  async setProviderAccount(account: ProviderAccountConfig): Promise<void> {
    this.ensureSettingsLoaded();
    const normalized = normalizeProviderAccountConfig(account);
    const index = this.userSettings.accounts.findIndex(candidate => candidate.providerId === normalized.providerId);
    const accounts = index >= 0
      ? replaceAt(this.userSettings.accounts, index, normalized)
      : [...this.userSettings.accounts, normalized];
    this.userSettings = {
      ...this.userSettings,
      accounts,
      modelAssignments: retainValidModelAssignments(accounts, this.userSettings.modelAssignments),
    };
    this.saveSettingsToDatabase();
    this.reactToConfigChange();
  }

  async deleteProviderAccount(providerId: string): Promise<void> {
    this.ensureSettingsLoaded();
    const index = this.userSettings.accounts.findIndex(account => account.providerId === providerId);
    if (index !== -1) {
      const accounts = this.userSettings.accounts.filter(account => account.providerId !== providerId);
      this.userSettings = {
        ...this.userSettings,
        accounts,
        providerCredentials: this.userSettings.providerCredentials.filter(credential => credential.providerId !== providerId),
        modelAssignments: retainValidModelAssignments(accounts, this.userSettings.modelAssignments),
      };
      this.saveSettingsToDatabase();
    }
  }

  async updateDefaultAIConfig(config: ModelAssignments): Promise<void> {
    this.ensureSettingsLoaded();
    const normalized = normalizeProviderAccountSettings({
      accounts: this.userSettings.accounts,
      modelAssignments: config,
    });
    this.userSettings = {
      ...this.userSettings,
      modelAssignments: normalized.modelAssignments,
    };
    this.saveSettingsToDatabase();
    this.reactToConfigChange();
  }

  async deleteFieldFromDefaultAIConfig(fieldPath: string): Promise<void> {
    this.ensureSettingsLoaded();

    const selectionKeys = [
      'default',
      'embedding',
      'speech',
      'imageGeneration',
      'transcriptions',
      'free',
    ] as const;
    const selectionKey = selectionKeys.find(key => key === fieldPath);
    if (selectionKey === undefined) return;
    const modelAssignments = normalizeModelAssignments(this.userSettings.modelAssignments);
    delete modelAssignments[selectionKey];
    this.userSettings = { ...this.userSettings, modelAssignments };
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

  async *generatePortableLlm(
    request: PortableLlmRequest,
    options?: { agentInstanceId?: string; awaitLogs?: boolean; requestTimeoutMs?: number },
  ): AsyncGenerator<PortableLlmStreamPart, void, unknown> {
    assertPortableLlmRequest(request);
    const { requestId, controller } = this.prepareAIRequest();
    const timeoutSignal = options?.requestTimeoutMs && options.requestTimeoutMs > 0
      ? AbortSignal.timeout(options.requestTimeoutMs)
      : undefined;
    const signal = AbortSignal.any(
      [request.signal, controller.signal, timeoutSignal]
        .filter((candidate): candidate is AbortSignal => candidate !== undefined),
    );
    const runtimeAccount = await this.getProviderAccount(request.providerId);
    if (!runtimeAccount) {
      this.cleanupAIRequest(requestId);
      throw new Error(`Provider account not found: ${request.providerId}`);
    }
    const [account, apiKey] = runtimeAccount;
    const route = resolveProviderModelRoute(account, request.logicalModelId);
    if (route.wireModelId !== request.wireModelId) {
      this.cleanupAIRequest(requestId);
      throw new Error(`Model route not found: ${request.providerId}/${request.logicalModelId}`);
    }
    if (route.apiMode !== request.apiMode) {
      this.cleanupAIRequest(requestId);
      throw new Error(`Model API mode mismatch: ${request.providerId}/${request.logicalModelId}`);
    }

    const loggedRequest = {
      providerId: request.providerId,
      logicalModelId: request.logicalModelId,
      wireModelId: request.wireModelId,
      apiMode: request.apiMode,
      messageCount: request.messages.length,
    };
    const logStart = this.logAPICall(requestId, 'streaming', 'start', {
      agentInstanceId: options?.agentInstanceId,
      requestMetadata: {
        providerId: request.providerId,
        logicalModelId: request.logicalModelId,
        wireModelId: request.wireModelId,
        messageCount: request.messages.length,
      },
      requestPayload: loggedRequest,
    });
    if (options?.awaitLogs) await logStart;
    else void logStart;

    let responseText = '';
    try {
      signal.throwIfAborted();
      const provider = await desktopLlmProviderFactoryPort.createFromAccountRoute({ account, route, apiKey });
      const result = await provider.chat({ ...request, signal });
      if (!isPortableStream(result)) {
        throw new TypeError('Desktop provider returned a non-portable LLM stream');
      }
      for await (const part of result) {
        signal.throwIfAborted();
        assertPortableLlmStreamPart(part);
        if (part.type === 'text-delta') responseText += part.text;
        yield part;
      }
      const logDone = this.logAPICall(requestId, 'streaming', 'done', {
        responseContent: responseText,
      });
      if (options?.awaitLogs) await logDone;
      else void logDone;
    } catch (error) {
      const detail = extractErrorDetails(error, request.providerId);
      const logError = this.logAPICall(requestId, 'streaming', signal.aborted ? 'cancel' : 'error', {
        errorDetail: detail,
        responseContent: responseText,
      });
      if (options?.awaitLogs) await logError;
      else void logError;
      throw error;
    } finally {
      if (!controller.signal.aborted) controller.abort();
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
    config: ModelAssignments,
    options?: {
      dimensions?: number;
      encoding_format?: 'float' | 'base64';
    },
  ): Promise<AIEmbeddingResponse> {
    // Prepare request context
    const { requestId, controller } = this.prepareAIRequest();

    // Get embedding model configuration, fallback to default
    const modelConfig = config.embedding ?? config.default;
    if (!modelConfig?.providerId || !modelConfig?.modelId) {
      return {
        requestId,
        embeddings: [],
        logicalModelId: 'unknown',
        object: 'error',
        status: 'error',
        errorDetail: {
          name: 'MissingConfigError',
          code: 'NO_EMBEDDING_MODEL',
          providerId: 'unknown',
        },
      };
    }

    logger.debug(`[${requestId}] Starting generateEmbeddings with config`, { inputCount: inputs.length });

    try {
      // Get provider configuration
      const runtimeAccount = await this.getProviderAccount(modelConfig.providerId);
      if (!runtimeAccount) {
        return {
          requestId,
          embeddings: [],
          logicalModelId: modelConfig.modelId,
          object: 'error',
          status: 'error',
          errorDetail: {
            name: 'MissingProviderError',
            code: 'PROVIDER_NOT_FOUND',
            providerId: modelConfig.providerId,
          },
        };
      }
      const [account, apiKey] = runtimeAccount;

      // Generate embeddings
      const result = await generateEmbeddingsFromProvider(
        inputs,
        config,
        controller.signal,
        account,
        apiKey,
        options,
      );

      return result;
    } catch (error) {
      // Handle errors and categorize them
      const errorDetail = extractErrorDetails(error, modelConfig.providerId);

      return {
        requestId,
        embeddings: [],
        logicalModelId: modelConfig.modelId,
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
    config: ModelAssignments,
    options?: {
      responseFormat?: string;
      sampleRate?: number;
      speed?: number;
      gain?: number;
      voice?: string;
      stream?: boolean;
      maxOutputTokens?: number;
    },
  ): Promise<AISpeechResponse> {
    // Prepare request context
    const { requestId, controller } = this.prepareAIRequest();

    // Get speech model configuration, fallback to default
    const modelConfig = config.speech ?? config.default;
    if (!modelConfig?.providerId || !modelConfig?.modelId) {
      return {
        requestId,
        audio: new ArrayBuffer(0),
        format: 'mp3',
        logicalModelId: 'unknown',
        status: 'error',
        errorDetail: {
          name: 'MissingConfigError',
          code: 'NO_SPEECH_MODEL',
          providerId: 'unknown',
        },
      };
    }

    logger.debug(`[${requestId}] Starting generateSpeech with config`, { inputLength: input.length });

    try {
      // Get provider configuration
      const runtimeAccount = await this.getProviderAccount(modelConfig.providerId);
      if (!runtimeAccount) {
        return {
          requestId,
          audio: new ArrayBuffer(0),
          format: 'mp3',
          logicalModelId: modelConfig.modelId,
          status: 'error',
          errorDetail: {
            name: 'MissingProviderError',
            code: 'PROVIDER_NOT_FOUND',
            providerId: modelConfig.providerId,
          },
        };
      }
      const [account, apiKey] = runtimeAccount;

      // Generate speech
      const result = await generateSpeechFromProvider(
        input,
        config,
        controller.signal,
        account,
        apiKey,
        options,
      );

      return result;
    } catch (error) {
      // Handle errors and categorize them
      const errorDetail = extractErrorDetails(error, modelConfig.providerId);

      return {
        requestId,
        audio: new ArrayBuffer(0),
        format: 'mp3',
        logicalModelId: modelConfig.modelId,
        status: 'error',
        errorDetail,
      };
    } finally {
      this.cleanupAIRequest(requestId);
    }
  }

  async generateTranscription(
    audioFile: File | Blob,
    config: ModelAssignments,
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
    if (!modelConfig?.providerId || !modelConfig?.modelId) {
      return {
        requestId,
        text: '',
        logicalModelId: 'unknown',
        status: 'error',
        errorDetail: {
          name: 'MissingConfigError',
          code: 'NO_TRANSCRIPTIONS_MODEL',
          providerId: 'unknown',
        },
      };
    }

    logger.debug(`[${requestId}] Starting generateTranscription with config`);

    try {
      // Get provider configuration
      const runtimeAccount = await this.getProviderAccount(modelConfig.providerId);
      if (!runtimeAccount) {
        return {
          requestId,
          text: '',
          logicalModelId: modelConfig.modelId,
          status: 'error',
          errorDetail: {
            name: 'MissingProviderError',
            code: 'PROVIDER_NOT_FOUND',
            providerId: modelConfig.providerId,
          },
        };
      }
      const [account, apiKey] = runtimeAccount;

      // Generate transcription
      const result = await generateTranscriptionFromProvider(
        audioFile,
        config,
        controller.signal,
        account,
        apiKey,
        options,
      );

      return result;
    } catch (error) {
      // Handle errors and categorize them
      const errorDetail = extractErrorDetails(error, modelConfig.providerId);

      return {
        requestId,
        text: '',
        logicalModelId: modelConfig.modelId,
        status: 'error',
        errorDetail,
      };
    } finally {
      this.cleanupAIRequest(requestId);
    }
  }

  async generateImage(
    prompt: string,
    config: ModelAssignments,
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
    if (!modelConfig?.providerId || !modelConfig?.modelId) {
      return {
        requestId,
        images: [],
        logicalModelId: 'unknown',
        status: 'error',
        errorDetail: {
          name: 'MissingConfigError',
          code: 'NO_IMAGE_GENERATION_MODEL',
          providerId: 'unknown',
        },
      };
    }

    logger.debug(`[${requestId}] Starting generateImage with config`, { promptLength: prompt.length });

    try {
      // Get provider configuration
      const runtimeAccount = await this.getProviderAccount(modelConfig.providerId);
      if (!runtimeAccount) {
        return {
          requestId,
          images: [],
          logicalModelId: modelConfig.modelId,
          status: 'error',
          errorDetail: {
            name: 'MissingProviderError',
            code: 'PROVIDER_NOT_FOUND',
            providerId: modelConfig.providerId,
          },
        };
      }
      const [account, apiKey] = runtimeAccount;

      // Generate image
      const result = await generateImageFromProvider(
        prompt,
        config,
        controller.signal,
        account,
        apiKey,
        options,
      );

      return result;
    } catch (error) {
      // Handle errors and categorize them
      const errorDetail = extractErrorDetails(error, modelConfig.providerId);

      return {
        requestId,
        images: [],
        logicalModelId: modelConfig.modelId,
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

function isPortableStream(value: unknown): value is AsyncIterable<PortableLlmStreamPart> {
  return value !== null && typeof value === 'object' &&
    typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function';
}

function normalizeDesktopExternalAPISettings(value: unknown): DesktopExternalAPISettings {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError('external API settings must be a plain object');
  }
  const record = value as Record<string, unknown>;
  const keys = Reflect.ownKeys(record);
  const allowed = ['accounts', 'modelAssignments', 'providerCredentials'];
  if (keys.some(key => typeof key !== 'string' || !allowed.includes(key))) {
    throw new TypeError('external API settings contain unknown fields');
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (descriptor === undefined || !('value' in descriptor) || !descriptor.enumerable) {
      throw new TypeError('external API settings contain an accessor or hidden field');
    }
  }
  const providerSettings = normalizeProviderAccountSettings({
    accounts: record.accounts,
    modelAssignments: record.modelAssignments,
  });
  if (!Array.isArray(record.providerCredentials) || record.providerCredentials.length > 512) {
    throw new TypeError('providerCredentials must be a bounded array');
  }
  const accountIds = new Set(providerSettings.accounts.map(account => account.providerId));
  const providerCredentials = record.providerCredentials.map((value): { providerId: string; encryptedApiKey: string } => {
    if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
      throw new TypeError('provider credential must be a plain object');
    }
    const credential = value as Record<string, unknown>;
    const credentialKeys = Reflect.ownKeys(credential);
    const expectedCredentialKeys = new Set(['providerId', 'encryptedApiKey']);
    if (
      credentialKeys.length !== expectedCredentialKeys.size ||
      credentialKeys.some(key => typeof key !== 'string' || !expectedCredentialKeys.has(key))
    ) {
      throw new TypeError('provider credential contains unknown fields');
    }
    for (const key of credentialKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(credential, key);
      if (descriptor === undefined || !('value' in descriptor) || !descriptor.enumerable) {
        throw new TypeError('provider credential contains an accessor or hidden field');
      }
    }
    if (
      typeof credential.providerId !== 'string' || !accountIds.has(credential.providerId) ||
      typeof credential.encryptedApiKey !== 'string' || credential.encryptedApiKey.length === 0 ||
      credential.encryptedApiKey.length > 64 * 1024 ||
      Buffer.from(credential.encryptedApiKey, 'base64').toString('base64') !== credential.encryptedApiKey
    ) throw new TypeError('invalid provider credential');
    return {
      providerId: credential.providerId,
      encryptedApiKey: credential.encryptedApiKey,
    };
  });
  if (new Set(providerCredentials.map(credential => credential.providerId)).size !== providerCredentials.length) {
    throw new TypeError('provider credential ids must be unique');
  }
  return {
    accounts: [...providerSettings.accounts],
    modelAssignments: normalizeModelAssignments(providerSettings.modelAssignments),
    providerCredentials,
  };
}

function providerCredentialReference(providerId: string): string {
  return `desktop-keychain:${providerId}`;
}

function replaceAt<T>(values: readonly T[], index: number, value: T): T[] {
  return values.map((current, currentIndex) => currentIndex === index ? value : current);
}

function retainValidModelAssignments(
  accounts: readonly ProviderAccountConfig[],
  assignments: ModelAssignments,
): ModelAssignments {
  const normalized = normalizeModelAssignments(assignments);
  const retained: ModelAssignments = {};
  for (
    const [purpose, selection] of Object.entries(normalized) as Array<[
      keyof ModelAssignments,
      NonNullable<ModelAssignments[keyof ModelAssignments]>,
    ]>
  ) {
    const account = accounts.find(candidate => candidate.providerId === selection.providerId);
    if (account?.models.some(route => route.modelId === selection.modelId) === true) {
      retained[purpose] = selection;
    }
  }
  return normalizeModelAssignments(retained);
}

type CatalogModelCapability = 'language' | 'embedding' | 'speech' | 'imageGeneration' | 'transcriptions';

function isCatalogModelCapability(
  model: ModelCatalogModel | undefined,
  capability: CatalogModelCapability,
): boolean {
  if (model === undefined) return capability === 'language';
  const inputs = new Set(model.modalities?.input ?? []);
  const outputs = new Set(model.modalities?.output ?? []);
  switch (capability) {
    case 'language':
      return inputs.has('text') && outputs.has('text');
    case 'embedding':
      return /embed/i.test(model.id) || /embed/i.test(model.name);
    case 'speech':
      return outputs.has('audio');
    case 'imageGeneration':
      return outputs.has('image');
    case 'transcriptions':
      return inputs.has('audio') && outputs.has('text');
  }
}
