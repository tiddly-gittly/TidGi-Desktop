import { inject, injectable } from 'inversify';
import { nanoid } from 'nanoid';
import { BehaviorSubject, Observable } from 'rxjs';
import { DataSource, Repository } from 'typeorm';

import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import { basicPromptConcatHandler } from '@services/agentInstance/agentFrameworks/taskAgent';
import type { AgentFramework, AgentFrameworkContext } from '@services/agentInstance/agentFrameworks/utilities/type';
import { promptConcatStream, PromptConcatStreamState } from '@services/agentInstance/promptConcat/promptConcat';
import type { AgentPromptDescription } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { getPromptConcatAgentFrameworkConfigJsonSchema } from '@services/agentInstance/promptConcat/promptConcatSchema/jsonSchema';
import { createHooksWithPlugins, initializePluginSystem } from '@services/agentInstance/tools';
import type { IDatabaseService } from '@services/database/interface';
import { AgentInstanceEntity, AgentInstanceMessageEntity } from '@services/database/schema/agent';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';

import { createDebouncedMessageUpdater, saveUserMessage as saveUserMessageHelper } from './agentMessagePersistence';
import * as repo from './agentRepository';
import type { AgentInstance, AgentInstanceLatestStatus, AgentInstanceMessage, IAgentInstanceService } from './interface';

@injectable()
export class AgentInstanceService implements IAgentInstanceService {
  @inject(serviceIdentifier.Database)
  private readonly databaseService!: IDatabaseService;

  @inject(serviceIdentifier.AgentDefinition)
  private readonly agentDefinitionService!: IAgentDefinitionService;

  private dataSource: DataSource | null = null;
  private agentInstanceRepository: Repository<AgentInstanceEntity> | null = null;
  private agentMessageRepository: Repository<AgentInstanceMessageEntity> | null = null;

  private agentInstanceSubjects: Map<string, BehaviorSubject<AgentInstance | undefined>> = new Map();
  private statusSubjects: Map<string, BehaviorSubject<AgentInstanceLatestStatus | undefined>> = new Map();

  private agentFrameworks: Map<string, AgentFramework> = new Map();
  private frameworkSchemas: Map<string, Record<string, unknown>> = new Map();
  private cancelTokenMap: Map<string, { value: boolean }> = new Map();
  private debouncedUpdateFunctions: Map<string, (message: AgentInstanceLatestStatus['message'] & { id: string }, agentId?: string) => void> = new Map();

  public async initialize(): Promise<void> {
    try {
      await this.initializeDatabase();
      await this.initializeFrameworks();
    } catch (error) {
      logger.error('Failed to initialize agent instance service', { error });
      throw error;
    }
  }

  private async initializeDatabase(): Promise<void> {
    try {
      // Database is already initialized in the agent definition service
      this.dataSource = await this.databaseService.getDatabase('agent');
      this.agentInstanceRepository = this.dataSource.getRepository(AgentInstanceEntity);
      this.agentMessageRepository = this.dataSource.getRepository(AgentInstanceMessageEntity);
      logger.debug('AgentInstance repositories initialized');
    } catch (error) {
      logger.error('Failed to initialize agent instance database', { error });
      throw error;
    }
  }

  public async initializeFrameworks(): Promise<void> {
    try {
      // Register tools to global registry once during initialization
      await initializePluginSystem();
      logger.debug('AgentInstance Tool system initialized and tools registered to global registry');

      // Register built-in frameworks
      this.registerBuiltinFrameworks();
      logger.debug('AgentInstance frameworks registered');
    } catch (error) {
      logger.error('Failed to initialize agent instance frameworks', { error });
      throw error;
    }
  }

  public registerBuiltinFrameworks(): void {
    // Tools are already registered in initialize(), so we only register frameworks here
    // Register basic prompt concatenation framework with its schema
    this.registerFramework('basicPromptConcatHandler', basicPromptConcatHandler, getPromptConcatAgentFrameworkConfigJsonSchema());
  }

  /**
   * Register a framework with an optional schema
   * @param frameworkId ID for the framework
   * @param framework The framework function
   * @param schema Optional JSON schema for the framework configuration
   */
  private registerFramework(frameworkId: string, framework: AgentFramework, schema?: Record<string, unknown>): void {
    this.agentFrameworks.set(frameworkId, framework);
    if (schema) {
      this.frameworkSchemas.set(frameworkId, schema);
    }
  }

  /**
   * Ensure repositories are initialized
   */
  private ensureRepositories(): void {
    if (!this.agentInstanceRepository || !this.agentMessageRepository) {
      throw new Error('Agent instance repositories not initialized');
    }
  }

  /**
   * Clean up subscriptions for specific agent
   */
  private cleanupAgentSubscriptions(agentId: string): void {
    if (this.agentInstanceSubjects.has(agentId)) {
      this.agentInstanceSubjects.delete(agentId);
    }

    // Clean up all status subscriptions related to this agent
    for (const [key, _] of this.statusSubjects.entries()) {
      if (key.startsWith(`${agentId}:`)) {
        this.statusSubjects.delete(key);
      }
    }
  }

  public async createAgent(agentDefinitionID?: string, options?: { preview?: boolean }): Promise<AgentInstance> {
    this.ensureRepositories();
    try {
      return await repo.createAgent(this.agentInstanceRepository!, this.agentDefinitionService, agentDefinitionID, options);
    } catch (error) {
      logger.error('Failed to create agent instance', { error });
      throw error;
    }
  }

  public async getAgent(agentId: string): Promise<AgentInstance | undefined> {
    this.ensureRepositories();
    try {
      return await repo.getAgent(this.agentInstanceRepository!, agentId);
    } catch (error) {
      logger.error('Failed to get agent instance', { error });
      throw error;
    }
  }

  public async updateAgent(agentId: string, data: Partial<AgentInstance>): Promise<AgentInstance> {
    this.ensureRepositories();
    try {
      const updatedAgent = await repo.updateAgent(this.agentInstanceRepository!, this.agentMessageRepository!, agentId, data);
      this.notifyAgentUpdate(agentId, updatedAgent);
      return updatedAgent;
    } catch (error) {
      logger.error('Failed to update agent instance', { error });
      throw error;
    }
  }

  public async deleteAgent(agentId: string): Promise<void> {
    this.ensureRepositories();
    try {
      await repo.deleteAgent(this.agentInstanceRepository!, this.agentMessageRepository!, agentId);
      this.cleanupAgentSubscriptions(agentId);
    } catch (error) {
      logger.error('Failed to delete agent instance', { error });
      throw error;
    }
  }

  public async getAgents(
    page: number,
    pageSize: number,
    options?: { closed?: boolean; searchName?: string },
  ): Promise<Omit<AgentInstance, 'messages'>[]> {
    this.ensureRepositories();
    try {
      return await repo.getAgents(this.agentInstanceRepository!, page, pageSize, options);
    } catch (error) {
      logger.error('Failed to get agent instances', { error });
      throw error;
    }
  }

  public async sendMsgToAgent(agentId: string, content: { text: string; file?: File; wikiTiddlers?: Array<{ workspaceName: string; tiddlerTitle: string }> }): Promise<void> {
    try {
      // Get agent instance
      const agentInstance = await this.getAgent(agentId);
      if (!agentInstance) {
        throw new Error(`Agent instance not found: ${agentId}`);
      }

      // Create user message
      const messageId = nanoid();
      const now = new Date();

      // Get agent configuration
      const agentDefinition = await this.agentDefinitionService.getAgentDef(agentInstance.agentDefId);
      if (!agentDefinition) {
        throw new Error(`Agent definition not found: ${agentInstance.agentDefId}`);
      }

      // Get appropriate framework
      const agentFrameworkId = agentDefinition.agentFrameworkID;
      if (!agentFrameworkId) {
        throw new Error(`Agent framework ID not found in agent definition: ${agentDefinition.id}`);
      }
      const framework = this.agentFrameworks.get(agentFrameworkId);
      if (!framework) {
        throw new Error(`Framework not found: ${agentFrameworkId}`);
      }

      // Create framework context with temporary message added for processing
      const cancelToken = { value: false };
      this.cancelTokenMap.set(agentId, cancelToken);
      const frameworkContext: AgentFrameworkContext = {
        agent: {
          ...agentInstance,
          messages: [...agentInstance.messages],
          status: {
            state: 'working',
            modified: now,
          },
        },
        agentDef: agentDefinition,
        isCancelled: () => cancelToken.value,
      };

      // Create fresh hooks for this framework execution and register plugins based on frameworkConfig
      const { hooks: frameworkHooks } = await createHooksWithPlugins(agentDefinition.agentFrameworkConfig || {});

      // Trigger userMessageReceived hook with the configured tools
      await frameworkHooks.userMessageReceived.promise({
        agentFrameworkContext: frameworkContext,
        content,
        messageId,
        timestamp: now,
      });

      // Notify agent update after user message is added
      this.notifyAgentUpdate(agentId, frameworkContext.agent);

      try {
        // Create async generator
        const generator = framework(frameworkContext);

        // Track the last message for completion handling
        let lastResult: AgentInstanceLatestStatus | undefined;

        for await (const result of generator) {
          // Update status subscribers for specific message
          if (result.message?.content) {
            // Ensure message has correct modification timestamp
            if (!result.message.modified) {
              result.message.modified = new Date();
            }

            // Update status subscribers directly
            const statusKey = `${agentId}:${result.message.id}`;
            if (this.statusSubjects.has(statusKey)) {
              this.statusSubjects.get(statusKey)?.next(result);
            }

            // Notify agent update with latest messages for real-time UI updates
            this.notifyAgentUpdate(agentId, frameworkContext.agent);
          }

          // Store the last result for completion handling
          lastResult = result;
        }

        // Handle stream completion
        if (lastResult?.message) {
          // Complete the message stream directly using the last message from the generator
          const statusKey = `${agentId}:${lastResult.message.id}`;
          const subject = this.statusSubjects.get(statusKey);
          if (subject) {
            logger.debug(`[${agentId}] Completing message stream`, { messageId: lastResult.message.id });
            // Send final update with completed state
            subject.next({
              state: 'completed',
              message: lastResult.message,
              modified: new Date(),
            });
            // Complete and clean up the Observable
            // Use queueMicrotask to ensure IPC message delivery before completing subject
            // This schedules the completion after the current synchronous code and pending microtasks
            queueMicrotask(() => {
              try {
                subject.complete();
                this.statusSubjects.delete(statusKey);
                logger.debug(`[${agentId}] Subject completed and deleted`, { messageId: lastResult.message?.id });
              } catch (error) {
                logger.error(`[${agentId}] Error completing subject`, { messageId: lastResult.message?.id, error });
              }
            });
          }

          // Trigger agentStatusChanged hook for completion
          await frameworkHooks.agentStatusChanged.promise({
            agentFrameworkContext: frameworkContext,
            status: {
              state: 'completed',
              modified: new Date(),
            },
          });
        }

        // Remove cancel token after generator completes
        this.cancelTokenMap.delete(agentId);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Agent handler execution failed: ${errorMessage}`);

        // Clear any pending message subscriptions for this agent
        for (const key of Array.from(this.statusSubjects.keys())) {
          if (key.startsWith(`${agentId}:`)) {
            const subject = this.statusSubjects.get(key);
            if (subject) {
              try {
                subject.next({
                  state: 'failed',
                  message: {} as AgentInstanceMessage,
                  modified: new Date(),
                });
                subject.complete();
              } catch {
                // ignore
              }
              this.statusSubjects.delete(key);
            }
          }
        }

        // Trigger agentStatusChanged hook for failure
        await frameworkHooks.agentStatusChanged.promise({
          agentFrameworkContext: frameworkContext,
          status: {
            state: 'failed',
            modified: new Date(),
          },
        }).catch(() => {
          // Ignore hook errors during error handling
        });

        // Remove cancel token
        this.cancelTokenMap.delete(agentId);
        throw error;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to send message to agent: ${errorMessage}`);
      throw error;
    }
  }

  public async cancelAgent(agentId: string): Promise<void> {
    // Try to get cancel token
    const cancelToken = this.cancelTokenMap.get(agentId);

    if (cancelToken) {
      // Set cancel flag
      cancelToken.value = true;

      try {
        // Update agent status to canceled
        logger.debug(`cancelAgent called for ${agentId} - updating agent status to canceled`);
        await this.updateAgent(agentId, {
          status: {
            state: 'canceled',
            modified: new Date(),
          },
        });
        logger.debug(`updateAgent returned for cancelAgent ${agentId}`);

        // Propagate canceled status to any message-specific subscriptions so UI can react
        try {
          logger.debug('propagating canceled status to message-specific subscriptions', { function: 'cancelAgent', agentId });
          const agent = await this.getAgent(agentId);
          if (agent && agent.messages) {
            for (const key of Array.from(this.statusSubjects.keys())) {
              if (key.startsWith(`${agentId}:`)) {
                const parts = key.split(':');
                const messageId = parts[1];
                const subject = this.statusSubjects.get(key);
                const message = agent.messages.find(m => m.id === messageId);
                if (subject) {
                  try {
                    const message_ = message || ({} as AgentInstanceMessage);
                    logger.debug('propagate canceled to subscription', { function: 'cancelAgent', subscriptionKey: key });
                    subject.next({
                      state: 'canceled',
                      message: message_,
                      modified: new Date(),
                    });
                  } catch {
                    // ignore
                  }
                  try {
                    subject.complete();
                  } catch {
                    // ignore
                  }
                  this.statusSubjects.delete(key);
                }
              }
            }
          }
        } catch (error) {
          logger.warn('Failed to propagate cancel status to message subscriptions', { function: 'cancelAgent', error });
        }

        // Remove cancel token from map
        this.cancelTokenMap.delete(agentId);

        logger.info('Canceled agent instance', {
          function: 'cancelAgent',
          agentId,
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to cancel agent instance', {
          function: 'cancelAgent',
          error: errorMessage,
        });
        throw error;
      }
    } else {
      logger.warn(`No active operation found for agent: ${agentId}`);
    }
  }

  public async closeAgent(agentId: string): Promise<void> {
    this.ensureRepositories();

    try {
      // Get agent instance
      const instanceEntity = await this.agentInstanceRepository!.findOne({
        where: { id: agentId },
      });

      if (!instanceEntity) {
        throw new Error(`Agent instance not found: ${agentId}`);
      }

      // Mark as closed
      instanceEntity.closed = true;
      await this.agentInstanceRepository!.save(instanceEntity);

      // Cancel any ongoing operations
      if (this.cancelTokenMap.has(agentId)) {
        const token = this.cancelTokenMap.get(agentId);
        if (token) {
          token.value = true;
        }
        this.cancelTokenMap.delete(agentId);
      }

      // Clean up subscriptions
      this.cleanupAgentSubscriptions(agentId);

      logger.info('Closed agent instance', {
        function: 'closeAgent',
        agentId,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to close agent instance', {
        function: 'closeAgent',
        error: errorMessage,
      });
      throw error;
    }
  }

  public subscribeToAgentUpdates(agentId: string): Observable<AgentInstance | undefined>;
  /**
   * Subscribe to agent instance message status updates
   */
  public subscribeToAgentUpdates(agentId: string, messageId: string): Observable<AgentInstanceLatestStatus | undefined>;
  public subscribeToAgentUpdates(agentId: string, messageId?: string): Observable<AgentInstance | AgentInstanceLatestStatus | undefined> {
    // If messageId provided, subscribe to specific message status updates
    if (messageId) {
      const statusKey = `${agentId}:${messageId}`;
      if (!this.statusSubjects.has(statusKey)) {
        this.statusSubjects.set(statusKey, new BehaviorSubject<AgentInstanceLatestStatus | undefined>(undefined));

        // Try to get initial status
        this.getAgent(agentId).then(agent => {
          if (agent) {
            const message = agent.messages.find(m => m.id === messageId);
            if (message) {
              // 创建状态对象，注意不再检查 isComplete
              const status: AgentInstanceLatestStatus = {
                state: agent.status.state,
                message,
                modified: message.modified,
              };

              this.statusSubjects.get(statusKey)?.next(status);
            }
          }
        }).catch((error: unknown) => {
          logger.error('Failed to get initial status for message', { function: 'subscribeToAgentUpdates', error });
        });
      }

      return this.statusSubjects.get(statusKey)!.asObservable();
    }

    // If no messageId provided, subscribe to entire agent instance updates
    if (!this.agentInstanceSubjects.has(agentId)) {
      this.agentInstanceSubjects.set(agentId, new BehaviorSubject<AgentInstance | undefined>(undefined));

      // Try to get initial data
      this.getAgent(agentId).then(agent => {
        this.agentInstanceSubjects.get(agentId)?.next(agent);
      }).catch((error: unknown) => {
        logger.error('Failed to get initial agent data', { function: 'subscribeToAgentUpdates', error });
      });
    }

    return this.agentInstanceSubjects.get(agentId)!.asObservable();
  }

  /**
   * Notify agent subscription of updates
   * @param agentId Agent ID
   * @param agentData Agent data to use for notification
   */
  private notifyAgentUpdate(agentId: string, agentData: AgentInstance): void {
    try {
      // Only notify if there are active subscriptions
      if (this.agentInstanceSubjects.has(agentId)) {
        // Use the provided data for notification (no database query)
        this.agentInstanceSubjects.get(agentId)?.next(agentData);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to notify agent update: ${errorMessage}`);
    }
  }

  public async saveUserMessage(userMessage: AgentInstanceMessage): Promise<void> {
    this.ensureRepositories();
    try {
      await saveUserMessageHelper(this.agentMessageRepository!, userMessage);
    } catch (error) {
      logger.error('Failed to save user message', {
        error,
        messageId: userMessage.id,
        agentId: userMessage.agentId,
      });
      throw error;
    }
  }

  public debounceUpdateMessage(
    message: AgentInstanceMessage,
    agentId?: string,
    debounceMs = 300,
  ): void {
    const messageId = message.id;

    // Update status subscribers for specific message if available
    if (agentId) {
      const statusKey = `${agentId}:${messageId}`;
      if (this.statusSubjects.has(statusKey)) {
        this.statusSubjects.get(statusKey)?.next({
          state: 'working',
          message,
          modified: message.modified ?? new Date(),
        });
      }
    }

    // Lazy-create debounced function for each message ID
    if (!this.debouncedUpdateFunctions.has(messageId)) {
      this.ensureRepositories();
      const debouncedUpdate = createDebouncedMessageUpdater(
        this.dataSource!,
        messageId,
        debounceMs,
        (aid, updatedAgent) => {
          if (this.agentInstanceSubjects.has(aid)) {
            this.agentInstanceSubjects.get(aid)?.next(updatedAgent);
            logger.debug(`Notified agent subscribers of new message: ${messageId}`, {
              method: 'debounceUpdateMessage',
              agentId: aid,
            });
          }
        },
      );
      this.debouncedUpdateFunctions.set(messageId, debouncedUpdate);
    }

    const debouncedFunction = this.debouncedUpdateFunctions.get(messageId);
    if (debouncedFunction) {
      debouncedFunction(message, agentId);
    }
  }

  public concatPrompt(promptDescription: Pick<AgentPromptDescription, 'agentFrameworkConfig'>, messages: AgentInstanceMessage[]): Observable<PromptConcatStreamState> {
    logger.debug('AgentInstanceService.concatPrompt called', {
      hasPromptConfig: !!promptDescription.agentFrameworkConfig,
      promptConfigKeys: Object.keys(promptDescription.agentFrameworkConfig || {}),
      messagesCount: messages.length,
    });

    return new Observable<PromptConcatStreamState>((observer) => {
      const processStream = async () => {
        try {
          // Create a minimal framework context for prompt concatenation
          const frameworkContext = {
            agent: {
              id: 'temp',
              messages,
              agentDefId: 'temp',
              status: { state: 'working' as const, modified: new Date() },
              created: new Date(),
              agentFrameworkConfig: {},
            },
            agentDef: { id: 'temp', name: 'temp', agentFrameworkConfig: promptDescription.agentFrameworkConfig || {} },
            isCancelled: () => false,
          };

          const streamGenerator = promptConcatStream(promptDescription as AgentPromptDescription, messages, frameworkContext);
          for await (const state of streamGenerator) {
            observer.next(state);
            if (state.isComplete) {
              observer.complete();
              break;
            }
          }
        } catch (error) {
          logger.error('Error in AgentInstanceService.concatPrompt', {
            error,
            promptDescriptionId: (promptDescription as AgentPromptDescription).id,
            messagesCount: messages.length,
          });
          observer.error(error);
        }
      };
      void processStream();
    });
  }

  public getFrameworkConfigSchema(frameworkId: string): Record<string, unknown> {
    try {
      logger.debug('AgentInstanceService.getFrameworkConfigSchema called', { frameworkId });
      // Check if we have a schema for this framework
      const schema = this.frameworkSchemas.get(frameworkId);
      if (schema) {
        return schema;
      }
      // If no schema found, return an empty schema
      logger.warn(`No schema found for framework: ${frameworkId}`);
      return { type: 'object', properties: {} };
    } catch (error) {
      logger.error('Error in AgentInstanceService.getFrameworkConfigSchema', {
        error,
        frameworkId,
      });
      throw error;
    }
  }
}
