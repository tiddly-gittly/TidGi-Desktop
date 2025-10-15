import { inject, injectable } from 'inversify';
import { debounce, pick } from 'lodash';
import { nanoid } from 'nanoid';
import { BehaviorSubject, Observable } from 'rxjs';
import { DataSource, Repository } from 'typeorm';

import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import { basicPromptConcatHandler } from '@services/agentInstance/buildInAgentHandlers/basicPromptConcatHandler';
import type { AgentHandler, AgentHandlerContext } from '@services/agentInstance/buildInAgentHandlers/type';
import { createHooksWithPlugins, initializePluginSystem } from '@services/agentInstance/plugins';
import { promptConcatStream, PromptConcatStreamState } from '@services/agentInstance/promptConcat/promptConcat';
import type { AgentPromptDescription } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { getPromptConcatHandlerConfigJsonSchema } from '@services/agentInstance/promptConcat/promptConcatSchema/jsonSchema';
import type { IDatabaseService } from '@services/database/interface';
import { AgentInstanceEntity, AgentInstanceMessageEntity } from '@services/database/schema/agent';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';

import type { AgentInstance, AgentInstanceLatestStatus, AgentInstanceMessage, IAgentInstanceService } from './interface';
import { AGENT_INSTANCE_FIELDS, createAgentInstanceData, createAgentMessage, MESSAGE_FIELDS, toDatabaseCompatibleInstance, toDatabaseCompatibleMessage } from './utilities';

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

  private agentHandlers: Map<string, AgentHandler> = new Map();
  private handlerSchemas: Map<string, Record<string, unknown>> = new Map();
  private cancelTokenMap: Map<string, { value: boolean }> = new Map();
  private debouncedUpdateFunctions: Map<string, (message: AgentInstanceLatestStatus['message'] & { id: string }, agentId?: string) => void> = new Map();

  public async initialize(): Promise<void> {
    try {
      await this.initializeDatabase();
      await this.initializeHandlers();
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

  public async initializeHandlers(): Promise<void> {
    try {
      // Register plugins to global registry once during initialization
      await initializePluginSystem();
      logger.debug('AgentInstance Plugin system initialized and plugins registered to global registry');

      // Register built-in handlers
      this.registerBuiltinHandlers();
      logger.debug('AgentInstance handlers registered');
    } catch (error) {
      logger.error('Failed to initialize agent instance handlers', { error });
      throw error;
    }
  }

  public registerBuiltinHandlers(): void {
    // Plugins are already registered in initialize(), so we only register handlers here
    // Register basic prompt concatenation handler with its schema
    this.registerHandler('basicPromptConcatHandler', basicPromptConcatHandler, getPromptConcatHandlerConfigJsonSchema());
  }

  /**
   * Register a handler with an optional schema
   * @param handlerId ID for the handler
   * @param handler The handler function
   * @param schema Optional JSON schema for the handler configuration
   */
  private registerHandler(handlerId: string, handler: AgentHandler, schema?: Record<string, unknown>): void {
    this.agentHandlers.set(handlerId, handler);
    if (schema) {
      this.handlerSchemas.set(handlerId, schema);
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
      // Get agent definition
      const agentDefinition = await this.agentDefinitionService.getAgentDef(agentDefinitionID);
      if (!agentDefinition) {
        throw new Error(`Agent definition not found: ${agentDefinitionID}`);
      }

      // Create new agent instance using utility function
      // Ensure required fields exist before creating instance
      if (!agentDefinition.name) {
        throw new Error(`Agent definition missing required field 'name': ${agentDefinitionID}`);
      }

      const { instanceData, instanceId, now } = createAgentInstanceData(agentDefinition as Required<Pick<typeof agentDefinition, 'name'>> & typeof agentDefinition);

      // Mark as preview if specified
      if (options?.preview) {
        instanceData.volatile = true;
      }

      // Create and save entity
      const instanceEntity = this.agentInstanceRepository!.create(toDatabaseCompatibleInstance(instanceData));
      await this.agentInstanceRepository!.save(instanceEntity);
      logger.info('Created agent instance', {
        function: 'createAgent',
        instanceId,
        preview: !!options?.preview,
      });

      // Return complete instance object
      return {
        ...instanceData,
        created: now,
        modified: now,
      };
    } catch (error) {
      logger.error('Failed to create agent instance', { error });
      throw error;
    }
  }

  public async getAgent(agentId: string): Promise<AgentInstance | undefined> {
    this.ensureRepositories();
    try {
      // Query agent instance with messages in chronological order (oldest first)
      const instanceEntity = await this.agentInstanceRepository!.findOne({
        where: { id: agentId },
        relations: ['messages'],
        order: {
          messages: {
            modified: 'ASC', // Ensure messages are sorted in ascending order by creation time, otherwise streaming will update it and cause wrong order
          },
        },
      });
      if (!instanceEntity) {
        return undefined;
      }
      const messages = (instanceEntity.messages || []).slice().sort((a, b) => {
        const aTime = a.created ? new Date(a.created).getTime() : (a.modified ? new Date(a.modified).getTime() : 0);
        const bTime = b.created ? new Date(b.created).getTime() : (b.modified ? new Date(b.modified).getTime() : 0);
        return aTime - bTime;
      });
      return {
        ...pick(instanceEntity, AGENT_INSTANCE_FIELDS),
        messages,
      };
    } catch (error) {
      logger.error('Failed to get agent instance', { error });
      throw error;
    }
  }

  public async updateAgent(agentId: string, data: Partial<AgentInstance>): Promise<AgentInstance> {
    this.ensureRepositories();

    try {
      // Get existing instance with messages
      const instanceEntity = await this.agentInstanceRepository!.findOne({
        where: { id: agentId },
        relations: ['messages'],
        order: {
          messages: {
            modified: 'ASC', // Ensure messages are sorted in ascending order by creation time, otherwise streaming will update it and cause wrong order
          },
        },
      });

      if (!instanceEntity) {
        throw new Error(`Agent instance not found: ${agentId}`);
      }

      // Update fields using pick + Object.assign for consistency with updateAgentDef
      const pickedProperties = pick(data, ['name', 'status', 'avatarUrl', 'aiApiConfig', 'closed', 'handlerConfig']);
      Object.assign(instanceEntity, pickedProperties);

      // Save instance updates
      await this.agentInstanceRepository!.save(instanceEntity);

      // Handle message updates if provided
      if (data.messages && data.messages.length > 0) {
        // Create entities for new messages and update existing ones
        for (const message of data.messages) {
          // Check if message already exists
          const existingMessage = instanceEntity.messages?.find(m => m.id === message.id);

          if (existingMessage) {
            // Update existing message
            existingMessage.content = message.content;
            existingMessage.modified = message.modified || new Date();
            if (message.metadata) existingMessage.metadata = message.metadata;
            if (message.contentType) existingMessage.contentType = message.contentType;

            await this.agentMessageRepository!.save(existingMessage);
          } else {
            // Create new message
            const messageData = pick(message, MESSAGE_FIELDS) as AgentInstanceMessage;
            const messageEntity = this.agentMessageRepository!.create(toDatabaseCompatibleMessage(messageData));

            await this.agentMessageRepository!.save(messageEntity);

            // Add new message to the instance entity
            if (!instanceEntity.messages) {
              instanceEntity.messages = [];
            }
            instanceEntity.messages.push(messageEntity);
          }
        }
      }

      // Construct the response object directly from the entity
      // This avoids an additional database query with getAgent()
      const updatedAgent: AgentInstance = {
        ...pick(instanceEntity, AGENT_INSTANCE_FIELDS),
        messages: instanceEntity.messages || [],
      };

      // Notify subscribers about the updates with the already available data
      // This avoids another database query within notifyAgentUpdate
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
      // First delete all messages for this agent
      await this.agentMessageRepository!.delete({ agentId });

      // Then delete the agent instance
      await this.agentInstanceRepository!.delete(agentId);

      // Clean up subscriptions related to this agent
      this.cleanupAgentSubscriptions(agentId);

      logger.info(`Deleted agent instance: ${agentId}`);
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
      const skip = (page - 1) * pageSize;
      const take = pageSize;

      // Build query conditions
      const whereCondition: Record<string, unknown> = {};

      // Always exclude preview instances from normal listing
      whereCondition.preview = false;

      // Add closed filter if provided
      if (options && options.closed !== undefined) {
        whereCondition.closed = options.closed;
      }

      // Add name search filter if provided
      if (options && options.searchName) {
        whereCondition.name = { like: `%${options.searchName}%` };
      }

      const [instances, _] = await this.agentInstanceRepository!.findAndCount({
        where: Object.keys(whereCondition).length > 0 ? whereCondition : undefined,
        skip,
        take,
        order: {
          // Sort by creation time descending
          created: 'DESC',
        },
      });

      return instances.map(entity => pick(entity, AGENT_INSTANCE_FIELDS));
    } catch (error) {
      logger.error('Failed to get agent instances', { error });
      throw error;
    }
  }

  public async sendMsgToAgent(agentId: string, content: { text: string; file?: File }): Promise<void> {
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

      // Get appropriate handler
      const handlerId = agentDefinition.handlerID;
      if (!handlerId) {
        throw new Error(`Handler ID not found in agent definition: ${agentDefinition.id}`);
      }
      const handler = this.agentHandlers.get(handlerId);
      if (!handler) {
        throw new Error(`Handler not found: ${handlerId}`);
      }

      // Create handler context with temporary message added for processing
      const cancelToken = { value: false };
      this.cancelTokenMap.set(agentId, cancelToken);
      const handlerContext: AgentHandlerContext = {
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

      // Create fresh hooks for this handler execution and register plugins based on handlerConfig
      const { hooks: handlerHooks } = await createHooksWithPlugins(agentDefinition.handlerConfig || {});

      // Trigger userMessageReceived hook with the configured plugins
      await handlerHooks.userMessageReceived.promise({
        handlerContext,
        content,
        messageId,
        timestamp: now,
      });

      // Notify agent update after user message is added
      this.notifyAgentUpdate(agentId, handlerContext.agent);

      try {
        // Create async generator
        const generator = handler(handlerContext);

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
            this.notifyAgentUpdate(agentId, handlerContext.agent);
          }

          // Store the last result for completion handling
          lastResult = result;
        }

        // Handle stream completion
        if (lastResult?.message) {
          // Complete the message stream directly using the last message from the generator
          const statusKey = `${agentId}:${lastResult.message.id}`;
          if (this.statusSubjects.has(statusKey)) {
            const subject = this.statusSubjects.get(statusKey);
            if (subject) {
              // Send final update with completed state
              subject.next({
                state: 'completed',
                message: lastResult.message,
                modified: new Date(),
              });
              // Complete the Observable and remove the subject
              subject.complete();
              this.statusSubjects.delete(statusKey);
            }
          }

          // Trigger agentStatusChanged hook for completion
          await handlerHooks.agentStatusChanged.promise({
            handlerContext,
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

        // Trigger agentStatusChanged hook for failure
        await handlerHooks.agentStatusChanged.promise({
          handlerContext,
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
      const now = new Date();
      const summary = {
        id: userMessage.id,
        role: userMessage.role,
        agentId: userMessage.agentId,
        isToolResult: !!userMessage.metadata?.isToolResult,
        isPersisted: !!userMessage.metadata?.isPersisted,
      };
      logger.debug('Saving user message to DB (start)', {
        when: now.toISOString(),
        ...summary,
        source: 'saveUserMessage',
        stack: new Error().stack?.split('\n').slice(0, 4).join('\n'),
      });

      await this.agentMessageRepository!.save(this.agentMessageRepository!.create(toDatabaseCompatibleMessage(userMessage)));

      logger.debug('User message saved to database', {
        when: new Date().toISOString(),
        ...summary,
        source: 'saveUserMessage',
      });
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

    // Lazy load or get existing debounced function
    if (!this.debouncedUpdateFunctions.has(messageId)) {
      // Create debounced function for each message ID
      const debouncedUpdate = debounce(
        async (messageData_: AgentInstanceMessage, aid?: string) => {
          try {
            this.ensureRepositories();
            // ensureRepositories guarantees dataSource is available
            await this.dataSource!.transaction(async transaction => {
              const messageRepo = transaction.getRepository(AgentInstanceMessageEntity);
              const messageEntity = await messageRepo.findOne({
                where: { id: messageId },
              });

              if (messageEntity) {
                // Update message content
                messageEntity.content = messageData_.content;
                if (messageData_.contentType) messageEntity.contentType = messageData_.contentType;
                if (messageData_.metadata) messageEntity.metadata = messageData_.metadata;
                if (messageData_.duration !== undefined) messageEntity.duration = messageData_.duration ?? undefined; // Fix: Update duration field
                // Preserve provided modified; if not provided, keep existing DB value to avoid late overwrites
                // Only adjust modified if the incoming timestamp is earlier; otherwise leave DB value unchanged
                if (messageData_.modified instanceof Date) {
                  if (!messageEntity.modified || messageData_.modified.getTime() < new Date(messageEntity.modified).getTime()) {
                    messageEntity.modified = messageData_.modified;
                  }
                }

                const startSave = new Date();
                logger.debug('Updating existing message (start save)', {
                  when: startSave.toISOString(),
                  messageId,
                  agentId: aid,
                  source: 'debounceUpdateMessage:update',
                  stack: new Error().stack?.split('\n').slice(0, 4).join('\n'),
                });
                await messageRepo.save(messageEntity);
                logger.debug('Updating existing message (saved)', {
                  when: new Date().toISOString(),
                  messageId,
                  agentId: aid,
                  source: 'debounceUpdateMessage:update',
                });
              } else if (aid) {
                // Create new message if it doesn't exist and agentId provided
                // Create message using utility function
                const messageData = createAgentMessage(messageId, aid, {
                  role: messageData_.role,
                  content: messageData_.content,
                  contentType: messageData_.contentType,
                  metadata: messageData_.metadata,
                  duration: messageData_.duration, // Include duration for new messages
                });
                const newMessage = messageRepo.create(toDatabaseCompatibleMessage(messageData));

                const startSaveNew = new Date();
                logger.debug('Creating new message (start save)', {
                  when: startSaveNew.toISOString(),
                  messageId,
                  agentId: aid,
                  source: 'debounceUpdateMessage:create',
                  stack: new Error().stack?.split('\n').slice(0, 4).join('\n'),
                });
                await messageRepo.save(newMessage);
                logger.debug('Creating new message (saved)', {
                  when: new Date().toISOString(),
                  messageId,
                  agentId: aid,
                  source: 'debounceUpdateMessage:create',
                });

                // Get agent instance repository for transaction
                const agentRepo = transaction.getRepository(AgentInstanceEntity);

                // Get agent instance within the current transaction
                const agentEntity = await agentRepo.findOne({
                  where: { id: aid },
                  relations: ['messages'],
                });

                if (agentEntity) {
                  // Add the new message to the agent entity
                  if (!agentEntity.messages) {
                    agentEntity.messages = [];
                  }
                  agentEntity.messages.push(newMessage);

                  // Save the updated agent entity
                  await agentRepo.save(agentEntity);

                  // Construct agent data from entity directly without additional query
                  const updatedAgent: AgentInstance = {
                    ...pick(agentEntity, AGENT_INSTANCE_FIELDS),
                    messages: agentEntity.messages,
                  };

                  // Notify subscribers directly without additional queries
                  if (this.agentInstanceSubjects.has(aid)) {
                    this.agentInstanceSubjects.get(aid)?.next(updatedAgent);
                    logger.debug(`Notified agent subscribers of new message: ${messageId}`, {
                      method: 'debounceUpdateMessage',
                      agentId: aid,
                    });
                  }
                } else {
                  logger.warn(`Agent instance not found for message: ${messageId}`);
                }
              } else {
                logger.warn(`Cannot create message: missing agent ID for message ID: ${messageId}`);
              }
            });
          } catch (error) {
            logger.error('Failed to update/create message content', { error });
          }
        },
        debounceMs,
      );

      this.debouncedUpdateFunctions.set(messageId, debouncedUpdate);
    }

    // Call debounced function
    const debouncedFunction = this.debouncedUpdateFunctions.get(messageId);
    if (debouncedFunction) {
      debouncedFunction(message, agentId);
    }
  }

  public concatPrompt(promptDescription: Pick<AgentPromptDescription, 'handlerConfig'>, messages: AgentInstanceMessage[]): Observable<PromptConcatStreamState> {
    logger.debug('AgentInstanceService.concatPrompt called', {
      hasPromptConfig: !!promptDescription.handlerConfig,
      promptConfigKeys: Object.keys(promptDescription.handlerConfig),
      messagesCount: messages.length,
    });

    return new Observable<PromptConcatStreamState>((observer) => {
      const processStream = async () => {
        try {
          // Create a minimal handler context for prompt concatenation
          const handlerContext = {
            agent: {
              id: 'temp',
              messages,
              agentDefId: 'temp',
              status: { state: 'working' as const, modified: new Date() },
              created: new Date(),
              handlerConfig: {},
            },
            agentDef: { id: 'temp', name: 'temp', handlerConfig: promptDescription.handlerConfig },
            isCancelled: () => false,
          };

          const streamGenerator = promptConcatStream(promptDescription as AgentPromptDescription, messages, handlerContext);
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

  public getHandlerConfigSchema(handlerId: string): Record<string, unknown> {
    try {
      logger.debug('AgentInstanceService.getHandlerConfigSchema called', { handlerId });
      // Check if we have a schema for this handler
      const schema = this.handlerSchemas.get(handlerId);
      if (schema) {
        return schema;
      }
      // If no schema found, return an empty schema
      logger.warn(`No schema found for handler: ${handlerId}`);
      return { type: 'object', properties: {} };
    } catch (error) {
      logger.error('Error in AgentInstanceService.getHandlerConfigSchema', {
        error,
        handlerId,
      });
      throw error;
    }
  }
}
