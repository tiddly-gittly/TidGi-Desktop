/* eslint-disable @typescript-eslint/require-await */
import { injectable } from 'inversify';
import { cloneDeep, debounce, mergeWith } from 'lodash';
import { nanoid } from 'nanoid';
import { BehaviorSubject } from 'rxjs';

import { lazyInject } from '@services/container';
import { IDatabaseService } from '@services/database/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWikiService } from '@services/wiki/interface';
import defaultProvidersConfig from './defaultProviders.json';
import { streamFromProvider } from './helpers';
import type { AgentSettings, AgentState, AIMessage, AIProviderConfig, AISessionConfig, AIStreamResponse, IAgentService, SessionSyncData } from './interface';

@injectable()
export class AgentService implements IAgentService {
  @lazyInject(serviceIdentifier.Database)
  private readonly databaseService!: IDatabaseService;

  @lazyInject(serviceIdentifier.Wiki)
  private readonly wikiService!: IWikiService;

  public aiResponseStream$ = new BehaviorSubject<AIStreamResponse | undefined>(undefined);
  public sessionSync$ = new BehaviorSubject<SessionSyncData | undefined>(undefined);
  private activeStreams: Map<string, AbortController> = new Map();
  private sessions: Map<string, AgentState> = new Map();
  private changedSessionIds: Set<string> = new Set();

  // User's customized settings from database
  private userSettings: AgentSettings = {
    providers: [],
    defaultConfig: {} as AISessionConfig,
  };

  constructor() {
    this.loadSettingsFromDatabase();
    this.loadAllSessionsFromDatabase();
    this.debouncedPersistSessions = debounce(this.persistSessionsToDatabase, 2000);
  }

  /**
   * Merge user settings with default settings
   * This function doesn't modify any stored data, only returns the merged result
   */
  private mergeWithDefaults(settings: AgentSettings): AgentSettings {
    const defaultSettings: AgentSettings = {
      providers: cloneDeep(defaultProvidersConfig.providers),
      defaultConfig: { ...defaultProvidersConfig.defaultConfig },
    };

    return mergeWith({} as AgentSettings, defaultSettings, settings, (
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
    const savedSettings = this.databaseService.getSetting('agentSettings');
    this.userSettings = savedSettings ?? this.userSettings;
  }

  private saveSettingsToDatabase(): void {
    this.databaseService.setSetting('agentSettings', this.userSettings);
  }

  async getAIProviders(): Promise<AIProviderConfig[]> {
    const mergedSettings = this.mergeWithDefaults(this.userSettings);
    return mergedSettings.providers;
  }

  /**
   * Get AI configuration. Merges default config with provided config if any.
   * @param partialConfig Optional partial config to merge with default config
   * @returns Complete AI configuration
   */
  async getAIConfig(partialConfig?: Partial<AISessionConfig>): Promise<AISessionConfig> {
    const mergedSettings = this.mergeWithDefaults(this.userSettings);
    const defaultConfig = { ...mergedSettings.defaultConfig };

    if (partialConfig) {
      return { ...defaultConfig, ...partialConfig };
    }

    return defaultConfig;
  }

  /**
   * Get API key for specified provider
   * @param provider The AI provider name
   * @returns API key if found, throws error if not configured
   */
  private async getApiKey(provider: string): Promise<string> {
    const mergedSettings = this.mergeWithDefaults(this.userSettings);
    const providerConfig = mergedSettings.providers.find(p => p.provider === provider);

    if (!providerConfig || !providerConfig.apiKey) {
      throw new Error(`Provider ${provider} not configured or missing API key`);
    }

    return providerConfig.apiKey;
  }

  async updateSessionAIConfig(sessionId: string, config: AISessionConfig): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    session.aiConfig = { ...config };
    session.updatedAt = new Date();
    this.changedSessionIds.add(sessionId);
    this.emitSessionSync(session, 'update');
    this.debouncedPersistSessions();
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
    this.userSettings.defaultConfig = {
      ...this.userSettings.defaultConfig,
      ...config,
    };
    this.saveSettingsToDatabase();
  }

  async createSession(session?: AgentState): Promise<AgentState> {
    const sessionId = nanoid();
    const newSession = {
      ...session,
      id: sessionId,
      createdAt: new Date(),
      updatedAt: new Date(),
      conversations: session?.conversations || [],
    };

    this.sessions.set(sessionId, newSession);
    this.changedSessionIds.add(sessionId);
    this.emitSessionSync(newSession, 'create');
    await this.persistSessionToDatabase(sessionId);

    return newSession;
  }

  async updateSession(session: AgentState): Promise<void> {
    if (!session.id) throw new Error('Session ID is required');

    const existingSession = this.sessions.get(session.id);
    if (!existingSession) throw new Error(`Session ${session.id} not found`);

    this.sessions.set(session.id, {
      ...existingSession,
      ...session,
      updatedAt: new Date(),
    });

    this.changedSessionIds.add(session.id);
    this.emitSessionSync(this.sessions.get(session.id)!, 'update');
    this.debouncedPersistSessions();
  }

  async sendMessageToAI(sessionId: string, message: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (!session.conversations) session.conversations = [];
    if (this.activeStreams.has(sessionId)) await this.cancelAIRequest(sessionId);

    const controller = new AbortController();
    this.activeStreams.set(sessionId, controller);

    // Create new conversation with nanoid
    const conversationId = nanoid();
    const newConversation = {
      id: conversationId,
      question: message,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    session.conversations.push(newConversation);
    session.updatedAt = new Date();
    this.changedSessionIds.add(sessionId);
    this.emitSessionSync(session, 'update');

    try {
      this.emitResponseUpdate(sessionId, '', 'start');
      
      // Build complete message history from conversation history
      const messages: AIMessage[] = session.conversations.flatMap(conv => [
        { role: 'user', content: conv.question },
        ...(conv.response ? [{ role: 'assistant', content: conv.response }] : []) as AIMessage[],
      ]);
      
      // Get AI configuration with session-specific overrides if available
      const aiConfig = await this.getAIConfig(session.aiConfig);
      const apiKey = await this.getApiKey(aiConfig.provider);
      
      const result = streamFromProvider(
        aiConfig,
        messages,
        controller.signal,
        apiKey,
      );

      let fullResponse = '';
      let firstChunkReceived = false;
      let timeoutId: NodeJS.Timeout | undefined;

      const responseTimeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${aiConfig.provider} model ${aiConfig.model} response timeout`));
        }, 30000);
      });

      try {
        await Promise.race([
          (async () => {
            for await (const chunk of result.textStream) {
              if (!firstChunkReceived) {
                if (timeoutId) clearTimeout(timeoutId);
                firstChunkReceived = true;
              }

              fullResponse += chunk;
              if (session.conversations) {
                const conversation = session.conversations[session.conversations.length - 1];
                conversation.response = fullResponse;
                conversation.updatedAt = new Date();
              }
              session.updatedAt = new Date();
              this.changedSessionIds.add(sessionId);
              this.debouncedPersistSessions();
              this.emitResponseUpdate(sessionId, fullResponse, 'update');
            }

            if (!firstChunkReceived) {
              throw new Error(`${aiConfig.provider} model ${aiConfig.model} returned an empty response`);
            }
          })(),
          responseTimeout,
        ]);
      } catch (streamError) {
        if (timeoutId) clearTimeout(timeoutId);
        throw streamError;
      }

      this.emitResponseUpdate(sessionId, fullResponse, 'done');
      if (session.conversations.length > 0) {
        const conversation = session.conversations[session.conversations.length - 1];
        conversation.response = fullResponse;
        conversation.updatedAt = new Date();
      }
      session.updatedAt = new Date();
      this.changedSessionIds.add(sessionId);
      this.emitSessionSync(session, 'update');
    } catch (apiError: unknown) {
      const errorMessage = `Error: ${apiError instanceof Error ? apiError.message : String(apiError)}`;
      if (session.conversations.length > 0) {
        const conversation = session.conversations[session.conversations.length - 1];
        conversation.response = errorMessage;
        conversation.updatedAt = new Date();
      }
      session.updatedAt = new Date();
      this.emitResponseUpdate(sessionId, errorMessage, 'error');
      this.emitSessionSync(session, 'update');
    } finally {
      this.activeStreams.delete(sessionId);
    }
  }

  async cancelAIRequest(sessionId: string): Promise<void> {
    const controller = this.activeStreams.get(sessionId);
    if (controller) {
      controller.abort();
      this.activeStreams.delete(sessionId);
      this.emitResponseUpdate(sessionId, '', 'cancel');
    }
  }

  async getAvailableAIModels(): Promise<string[]> {
    const mergedSettings = this.mergeWithDefaults(this.userSettings);
    return mergedSettings.providers.flatMap(provider => provider.models.map(model => `${provider.provider}/${model}`));
  }

  async getAllSessions(): Promise<AgentState[]> {
    return Array.from(this.sessions.values());
  }

  private emitResponseUpdate(sessionId: string, content: string, status: 'start' | 'update' | 'done' | 'error' | 'cancel'): void {
    if (status === 'done' && (!content || content.trim() === '')) {
      content = '(No response, please check API settings and network connection)';
    }
    this.aiResponseStream$.next({ sessionId, content, status });
  }

  private emitSessionSync(session: AgentState, action: 'create' | 'update' | 'delete'): void {
    this.sessionSync$.next({ session, action });
  }

  private async loadAllSessionsFromDatabase(): Promise<void> {
    try {
      const allSessions = Array.from(this.sessions.values());
      for (const session of allSessions) {
        this.emitSessionSync(session, 'update');
      }
    } catch (error) {
      logger.error('Failed to load sessions from database:', error);
    }
  }

  private async persistSessionToDatabase(sessionId: string): Promise<void> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) return;
      this.changedSessionIds.delete(sessionId);
    } catch (error) {
      logger.error(`Failed to save session ${sessionId}:`, error);
    }
  }

  private async persistSessionsToDatabase(): Promise<void> {
    try {
      const sessionIds = Array.from(this.changedSessionIds);
      for (const sessionId of sessionIds) {
        await this.persistSessionToDatabase(sessionId);
      }
    } catch (error) {
      logger.error('Failed to persist sessions to database:', error);
    }
  }

  private async deleteSessionFromDatabase(sessionId: string): Promise<void> {
    try {
      this.changedSessionIds.delete(sessionId);
    } catch (error) {
      logger.error(`Failed to delete session ${sessionId}:`, error);
    }
  }

  private debouncedPersistSessions: () => void;
}
