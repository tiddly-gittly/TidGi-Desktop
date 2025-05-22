/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/use-unknown-in-catch-callback-variable */
/* eslint-disable unicorn/prevent-abbreviations */
import { CoreMessage } from 'ai';
import { injectable } from 'inversify';
import { debounce, pick } from 'lodash';
import { nanoid } from 'nanoid';
import { BehaviorSubject, Observable } from 'rxjs';
import { DataSource, Repository } from 'typeorm';

import { IAgentDefinitionService } from '@services/agentDefinition/interface';
import { basicPromptConcatHandler } from '@services/agentInstance/buildInAgentHandlers/basicPromptConcatHandler';
import { AgentHandler, AgentHandlerContext } from '@services/agentInstance/buildInAgentHandlers/type';
import { registerAllPromptHandlers } from '@services/agentInstance/promptConcat/handlers/promptHandlers/index';
import { promptConcat } from '@services/agentInstance/promptConcat/promptConcat';
import { AgentPromptDescription, Prompt } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { promptConcatHandlerConfigJsonSchema } from '@services/agentInstance/promptConcat/promptConcatSchema/jsonSchema';
import { lazyInject } from '@services/container';
import { IDatabaseService } from '@services/database/interface';
import { AgentInstanceEntity, AgentInstanceMessageEntity } from '@services/database/schema/agent';
import { IExternalAPIService } from '@services/externalAPI/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWikiService } from '@services/wiki/interface';

import { AgentInstance, AgentInstanceLatestStatus, AgentInstanceMessage, IAgentInstanceService } from './interface';
import { AGENT_INSTANCE_FIELDS, createAgentInstanceData, createAgentMessage, MESSAGE_FIELDS } from './utilities';

@injectable()
export class AgentInstanceService implements IAgentInstanceService {
  @lazyInject(serviceIdentifier.Database)
  private readonly databaseService!: IDatabaseService;

  @lazyInject(serviceIdentifier.ExternalAPI)
  private readonly externalAPIService!: IExternalAPIService;

  @lazyInject(serviceIdentifier.Wiki)
  private readonly wikiService!: IWikiService;

  @lazyInject(serviceIdentifier.AgentDefinition)
  private readonly agentDefinitionService!: IAgentDefinitionService;

  private dataSource: DataSource | null = null;
  private agentInstanceRepository: Repository<AgentInstanceEntity> | null = null;
  private agentMessageRepository: Repository<AgentInstanceMessageEntity> | null = null;

  // Subjects for subscription updates
  private agentInstanceSubjects: Map<string, BehaviorSubject<AgentInstance | undefined>> = new Map();
  private statusSubjects: Map<string, BehaviorSubject<AgentInstanceLatestStatus | undefined>> = new Map();

  private agentHandlers: Map<string, AgentHandler> = new Map();
  private handlerSchemas: Map<string, Record<string, unknown>> = new Map();
  private cancelTokenMap: Map<string, { value: boolean }> = new Map();
  private debouncedUpdateFunctions: Map<string, (message: AgentInstanceLatestStatus['message'] & { id: string }, agentId?: string) => void> = new Map();

  public async initialize(): Promise<void> {
    try {
      // Database is already initialized in the agent definition service
      this.dataSource = await this.databaseService.getDatabase('agent-default');
      this.agentInstanceRepository = this.dataSource.getRepository(AgentInstanceEntity);
      this.agentMessageRepository = this.dataSource.getRepository(AgentInstanceMessageEntity);
      logger.debug('AgentInstance repositories initialized');
      // Register built-in handlers
      this.registerBuiltinHandlers();
      logger.debug('AgentInstance handlers registered');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize agent instance service: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Register built-in agent handlers
   */
  private registerBuiltinHandlers(): void {
    // Register all prompt handlers from promptConcatUtils/handlers/promptHandlers/index.ts
    registerAllPromptHandlers();

    // Register basic prompt concatenation handler with its schema
    this.registerHandler('basicPromptConcatHandler', basicPromptConcatHandler, promptConcatHandlerConfigJsonSchema);
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

  /**
   * Create a new agent instance from a definition
   */
  public async createAgent(agentDefinitionID?: string): Promise<AgentInstance> {
    this.ensureRepositories();

    try {
      // Get agent definition
      const agentDef = await this.agentDefinitionService.getAgentDef(agentDefinitionID);
      if (!agentDef) {
        throw new Error(`Agent definition not found: ${agentDefinitionID}`);
      }

      // Create new agent instance using utility function
      const { instanceData, instanceId, now } = createAgentInstanceData(agentDef);

      // Create and save entity
      const instanceEntity = this.agentInstanceRepository!.create(instanceData);
      await this.agentInstanceRepository!.save(instanceEntity);
      logger.info(`Created agent instance: ${instanceId}`);

      // Return complete instance object
      return {
        ...instanceData,
        created: now,
        modified: now,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create agent instance: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get agent instance data by ID
   */
  public async getAgent(agentId: string): Promise<AgentInstance | undefined> {
    this.ensureRepositories();
    try {
      // Query agent instance with messages in chronological order (oldest first)
      const instanceEntity = await this.agentInstanceRepository!.findOne({
        where: { id: agentId },
        relations: ['messages'],
        order: {
          messages: {
            modified: 'ASC', // Ensure messages are sorted in ascending order by modified time
          },
        },
      });
      if (!instanceEntity) {
        return undefined;
      }
      return {
        ...pick(instanceEntity, AGENT_INSTANCE_FIELDS),
        messages: instanceEntity.messages || [],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get agent instance: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Update agent instance data
   */
  public async updateAgent(agentId: string, data: Partial<AgentInstance>): Promise<AgentInstance> {
    this.ensureRepositories();

    try {
      // Get existing instance with messages
      const instanceEntity = await this.agentInstanceRepository!.findOne({
        where: { id: agentId },
        relations: ['messages'],
        order: {
          messages: {
            modified: 'ASC', // Ensure messages are sorted in ascending order by modified time
          },
        },
      });

      if (!instanceEntity) {
        throw new Error(`Agent instance not found: ${agentId}`);
      }

      // Update fields
      if (data.name !== undefined) instanceEntity.name = data.name;
      if (data.status !== undefined) instanceEntity.status = data.status;
      if (data.avatarUrl !== undefined) instanceEntity.avatarUrl = data.avatarUrl;
      if (data.aiApiConfig !== undefined) instanceEntity.aiApiConfig = data.aiApiConfig;
      if (data.closed !== undefined) instanceEntity.closed = data.closed;
      // Handle handlerConfig from AgentDefinition
      if (data.handlerConfig !== undefined) instanceEntity.handlerConfig = data.handlerConfig;

      // Save instance updates
      await this.agentInstanceRepository!.save(instanceEntity);

      // Handle message updates if provided
      if (data.messages && data.messages.length > 0) {
        // Create entities for new messages
        const newMessages = data.messages.filter(message => {
          // Filter out messages not in database
          const existingMessage = instanceEntity.messages?.find(m => m.id === message.id);
          return !existingMessage;
        });

        for (const message of newMessages) {
          const messageEntity = this.agentMessageRepository!.create(
            pick(message, MESSAGE_FIELDS) as AgentInstanceMessage,
          );

          await this.agentMessageRepository!.save(messageEntity);

          // Add new message to the instance entity
          if (!instanceEntity.messages) {
            instanceEntity.messages = [];
          }
          instanceEntity.messages.push(messageEntity);
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
      await this.notifyAgentUpdate(agentId, updatedAgent);

      return updatedAgent;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to update agent instance: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Delete agent instance and all its messages
   */
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to delete agent instance: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get all agent instances with pagination and optional filters
   */
  public async getAgents(
    page: number,
    pageSize: number,
    options?: { closed?: boolean; searchName?: string },
  ): Promise<AgentInstance[]> {
    this.ensureRepositories();

    try {
      const skip = (page - 1) * pageSize;
      const take = pageSize;

      // Build query conditions
      const whereCondition: Record<string, unknown> = {};

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
        relations: ['messages'],
        order: {
          // Sort by creation time descending
          created: 'DESC',
        },
      });

      return instances.map(entity => {
        return {
          ...pick(entity, AGENT_INSTANCE_FIELDS),
          messages: entity.messages || [],
        };
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get agent instances: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Send message to agent and process response
   */
  public async sendMsgToAgent(agentId: string, content: { text: string; file?: File }): Promise<void> {
    this.ensureRepositories();

    try {
      // Get agent instance
      const agentInstance = await this.getAgent(agentId);
      if (!agentInstance) {
        throw new Error(`Agent instance not found: ${agentId}`);
      }

      // Create user message
      const messageId = nanoid();
      const now = new Date();
      // Use helper function to create message with proper structure
      const userMessage = createAgentMessage(messageId, agentId, {
        role: 'user',
        content: content.text,
        contentType: 'text/plain',
        metadata: content.file ? { file: content.file } : undefined,
      });

      // Save user message
      const messageEntity = this.agentMessageRepository!.create(userMessage);
      await this.agentMessageRepository!.save(messageEntity);

      // Update agent status to "working"
      logger.debug(`Sending message to agent ${agentId}, appending user message to ${agentInstance.messages.length} existing messages`, { method: 'sendMsgToAgent' });

      // Update agent and use the returned value directly instead of querying again
      const updatedAgent = await this.updateAgent(agentId, {
        status: {
          state: 'working',
          modified: now,
        },
        messages: [...agentInstance.messages, userMessage], // Append message at the end to maintain chronological order (ASC)
      });

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

      // Create handler context
      const cancelToken = { value: false };
      this.cancelTokenMap.set(agentId, cancelToken);
      const handlerContext: AgentHandlerContext = {
        agent: updatedAgent, // 直接使用updateAgent返回的结果
        agentDef: agentDefinition,
        isCancelled: () => cancelToken.value,
      };

      try {
        // Create async generator
        const generator = handler(handlerContext);

        // Track the last message for completion handling
        let lastResult: AgentInstanceLatestStatus | undefined;

        for await (const result of generator) {
          if (result.message?.content) {
            // Ensure message has correct modification timestamp
            if (!result.message.modified) {
              result.message.modified = new Date();
            }

            this.debounceUpdateMessage(
              result.message,
              agentId,
            );

            // Update status subscribers
            const statusKey = `${agentId}:${result.message.id}`;
            if (this.statusSubjects.has(statusKey)) {
              this.statusSubjects.get(statusKey)?.next(result);
            }
          }

          // Update agent status only when state changes or on first message
          const isFirstMessage = !lastResult;
          if (isFirstMessage || lastResult?.state !== result.state) {
            // For the first message, include the message itself in the update
            // This ensures the UI immediately gets the message without waiting for debounced updates
            const updateData: Partial<AgentInstance> = {
              status: {
                state: result.state,
                modified: new Date(),
              },
            };

            // Include message on first update to ensure immediate UI feedback
            if (isFirstMessage && result.message) {
              // Get the current agent to append the new message
              const currentAgent = await this.getAgent(agentId);
              if (currentAgent) {
                updateData.messages = [...currentAgent.messages, result.message];
              }
            }

            await this.updateAgent(agentId, updateData);
          }

          // Store the last result for completion handling. Also used for check if this is first message
          lastResult = result;
        }

        // Handle stream completion without fetching agent again
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
        }

        // Remove cancel token after generator completes
        this.cancelTokenMap.delete(agentId);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Agent handler execution failed: ${errorMessage}`);

        // Update agent status to failed
        await this.updateAgent(agentId, {
          status: {
            state: 'failed',
            modified: new Date(),
          },
        });

        // Remove cancel token
        this.cancelTokenMap.delete(agentId);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to send message to agent: ${errorMessage}`);

      // Try to update status to failed
      try {
        await this.updateAgent(agentId, {
          status: {
            state: 'failed',
            modified: new Date(),
          },
        });
      } catch {
        // Ignore errors here since the main error is already being handled
      }

      throw error;
    }
  }

  /**
   * Cancel current operations for agent instance
   */
  public async cancelAgent(agentId: string): Promise<void> {
    // Try to get cancel token
    const cancelToken = this.cancelTokenMap.get(agentId);

    if (cancelToken) {
      // Set cancel flag
      cancelToken.value = true;

      try {
        // Update agent status to canceled
        await this.updateAgent(agentId, {
          status: {
            state: 'canceled',
            modified: new Date(),
          },
        });

        // Remove cancel token from map
        this.cancelTokenMap.delete(agentId);

        logger.info(`Canceled agent instance: ${agentId}`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to cancel agent instance: ${errorMessage}`);
        throw error;
      }
    } else {
      logger.warn(`No active operation found for agent: ${agentId}`);
    }
  }

  /**
   * Close agent instance without deleting it
   */
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

      logger.info(`Closed agent instance: ${agentId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to close agent instance: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Subscribe to agent instance updates
   */
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
        }).catch(error => {
          logger.error(`Failed to get initial status for message: ${String(error)}`);
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
      }).catch(error => {
        logger.error(`Failed to get initial agent data: ${String(error)}`);
      });
    }

    return this.agentInstanceSubjects.get(agentId)!.asObservable();
  }

  /**
   * Notify agent subscription of updates
   * @param agentId Agent ID
   * @param agentData Agent data to use for notification
   */
  private async notifyAgentUpdate(agentId: string, agentData: AgentInstance): Promise<void> {
    try {
      // Only notify if there are active subscriptions
      if (this.agentInstanceSubjects.has(agentId)) {
        // Use the provided data for notification (no database query)
        this.agentInstanceSubjects.get(agentId)?.next(agentData);
        logger.debug(`Notified subscribers for agent ${agentId}`, { method: 'notifyAgentUpdate' });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to notify agent update: ${errorMessage}`);
    }
  }

  /**
   * Debounced message update to reduce database writes
   */
  private debounceUpdateMessage(
    message: AgentInstanceMessage,
    agentId?: string,
    debounceMs = 300,
  ): void {
    const messageId = message.id;

    logger.debug(`Updating message ${messageId} with content length: ${message.content.length}`, {
      method: 'debounceUpdateMessage',
      agentId,
      contentPreview: message.content.substring(0, 50),
    });

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
        async (msgData: AgentInstanceMessage, aid?: string) => {
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
                messageEntity.content = msgData.content;
                if (msgData.contentType) messageEntity.contentType = msgData.contentType;
                if (msgData.metadata) messageEntity.metadata = msgData.metadata;
                messageEntity.modified = new Date();

                await messageRepo.save(messageEntity);
              } else if (aid) {
                // Create new message if it doesn't exist and agentId provided
                // Create message using utility function
                const newMessage = messageRepo.create(
                  createAgentMessage(messageId, aid, {
                    role: msgData.role,
                    content: msgData.content,
                    contentType: msgData.contentType,
                    metadata: msgData.metadata,
                  }),
                );

                await messageRepo.save(newMessage);

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
                    messages: agentEntity.messages || [],
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
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to update/create message content: ${errorMessage}`);
          }
        },
        debounceMs,
      );

      this.debouncedUpdateFunctions.set(messageId, debouncedUpdate);
    }

    // Call debounced function
    const debouncedFn = this.debouncedUpdateFunctions.get(messageId);
    if (debouncedFn) {
      debouncedFn(message, agentId);
    }
  }

  public async concatPrompt(promptDescription: Pick<AgentPromptDescription, 'promptConfig'>, messages: AgentInstanceMessage[]): Promise<{
    flatPrompts: CoreMessage[];
    processedPrompts: Prompt[];
  }> {
    try {
      logger.debug('AgentInstanceService.concatPrompt called', {
        hasPromptConfig: !!promptDescription.promptConfig,
        promptConfigKeys: Object.keys(promptDescription.promptConfig || {}),
        messagesCount: messages.length,
      });

      // Add a timeout to the promptConcat operation
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => {
          logger.warn('AgentInstanceService.concatPrompt: Operation timed out after 20 seconds', { method: 'concatPrompt' });
          resolve(null);
        }, 20000); // 20 second timeout
      });

      const concatPromptPromise = promptConcat(promptDescription as AgentPromptDescription, messages);

      // Race the promises
      const result = await Promise.race([concatPromptPromise, timeoutPromise]);

      if (result === null) {
        // Timeout occurred
        logger.error('AgentInstanceService.concatPrompt timed out', { method: 'concatPrompt' });
        throw new Error('Prompt generation timed out');
      }

      logger.debug('AgentInstanceService.concatPrompt completed', {
        flatPromptsCount: result.flatPrompts.length,
        processedPromptsCount: result.processedPrompts.length,
      });

      return result;
    } catch (error) {
      logger.error('Error in AgentInstanceService.concatPrompt', {
        error: error instanceof Error ? error.message : String(error),
        promptDescriptionId: (promptDescription as AgentPromptDescription).id,
        messagesCount: messages.length,
      });
      throw error;
    }
  }

  /**
   * Get JSON Schema for handler configuration
   * This allows frontend to generate a form based on the schema for a specific handler
   * @param handlerId ID of the handler to get schema for
   * @returns JSON Schema for the handler configuration
   */
  public async getHandlerConfigSchema(handlerId: string): Promise<Record<string, unknown>> {
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
        error: error instanceof Error ? error.message : String(error),
        handlerId,
      });
      throw error;
    }
  }
}
