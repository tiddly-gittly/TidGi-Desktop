/* eslint-disable @typescript-eslint/use-unknown-in-catch-callback-variable */
/* eslint-disable unicorn/prevent-abbreviations */
import { injectable } from 'inversify';
import { debounce, pick } from 'lodash';
import { nanoid } from 'nanoid';
import { BehaviorSubject, Observable } from 'rxjs';
import { DataSource, Repository } from 'typeorm';

import { IAgentDefinitionService } from '@services/agentDefinition/interface';
import { basicPromptConcatHandler } from '@services/agentInstance/buildInAgentHandlers/basicPromptConcatHandler';
import { AgentHandler, AgentHandlerContext } from '@services/agentInstance/buildInAgentHandlers/type';
import { lazyInject } from '@services/container';
import { IDatabaseService } from '@services/database/interface';
import { AgentInstanceEntity, AgentInstanceMessageEntity } from '@services/database/schema/agent';
import { IExternalAPIService } from '@services/externalAPI/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWikiService } from '@services/wiki/interface';

import { AgentInstance, AgentInstanceLatestStatus, AgentInstanceMessage, IAgentInstanceService } from './interface';

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
    // Register basic prompt concatenation handler
    this.agentHandlers.set('basicPromptConcatHandler', basicPromptConcatHandler);

    // Additional handlers can be registered here
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

      // Create new agent instance
      const instanceId = nanoid();
      const now = new Date();

      // Initialize agent status
      const initialStatus: AgentInstanceLatestStatus = {
        state: 'completed',
        modified: now,
      };

      // Extract necessary fields from agentDef
      const { avatarUrl, aiApiConfig } = agentDef;

      const instanceData = {
        id: instanceId,
        agentDefId: agentDef.id,
        name: `${agentDef.name} - ${new Date().toLocaleString()}`,
        status: initialStatus,
        avatarUrl,
        aiApiConfig,
        messages: [],
        closed: false,
      };

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
      // Query agent instance with messages in reverse chronological order
      const instanceEntity = await this.agentInstanceRepository!.findOne({
        where: { id: agentId },
        relations: ['messages'],
        order: {
          messages: {
            modified: 'DESC',
          },
        },
      });

      if (!instanceEntity) {
        return undefined;
      }

      return {
        ...pick(instanceEntity, ['id', 'agentDefId', 'name', 'status', 'created', 'modified', 'avatarUrl', 'aiApiConfig', 'closed']),
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
      // Get existing instance
      const instanceEntity = await this.agentInstanceRepository!.findOne({
        where: { id: agentId },
        relations: ['messages'],
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

      // Save instance updates
      await this.agentInstanceRepository!.save(instanceEntity);

      // Handle message updates if provided
      if (data.messages && data.messages.length > 0) {
        // Sort messages by modified time, newest first
        data.messages.sort((a, b) => {
          const dateA = a.modified ? new Date(a.modified).getTime() : 0;
          const dateB = b.modified ? new Date(b.modified).getTime() : 0;
          return dateB - dateA; // Descending order, newest first
        });

        // Create entities for new messages
        const newMessages = data.messages.filter(message => {
          // Filter out messages not in database
          const existingMessage = instanceEntity.messages?.find(m => m.id === message.id);
          return !existingMessage;
        });

        for (const message of newMessages) {
          const messageEntity = this.agentMessageRepository!.create({
            id: message.id,
            agentId: agentId,
            role: message.role,
            content: message.content,
            contentType: message.contentType,
            metadata: message.metadata,
          });

          await this.agentMessageRepository!.save(messageEntity);
        }
      }

      // Reload complete instance data
      return await this.getAgent(agentId) as AgentInstance;
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
          ...pick(entity, ['id', 'agentDefId', 'name', 'status', 'created', 'modified', 'avatarUrl', 'aiApiConfig', 'closed']),
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
      const userMessage: AgentInstanceMessage = {
        id: messageId,
        agentId,
        role: 'user',
        content: content.text,
        contentType: 'text/plain',
        modified: now,
        ...(content.file ? { metadata: { file: content.file } } : {}),
      };

      // Save user message
      const messageEntity = this.agentMessageRepository!.create(userMessage);
      await this.agentMessageRepository!.save(messageEntity);

      // Update agent status to "working"
      await this.updateAgent(agentId, {
        status: {
          state: 'working',
          modified: now,
        },
        messages: [userMessage, ...agentInstance.messages],
      });

      // Get agent configuration
      const agentDefinition = await this.agentDefinitionService.getAgentDef(agentInstance.agentDefId);
      if (!agentDefinition) {
        throw new Error(`Agent definition not found: ${agentInstance.agentDefId}`);
      }

      // Get updated agent instance
      const updatedAgent = await this.getAgent(agentId);
      if (!updatedAgent) {
        throw new Error(`Failed to get updated agent instance: ${agentId}`);
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
        agent: updatedAgent,
        agentDef: agentDefinition,
        isCancelled: () => cancelToken.value,
      };

      try {
        // Create async generator
        const generator = handler(handlerContext);

        for await (const result of generator) {
          if (result.message?.content) {
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

          // Update agent status
          await this.updateAgent(agentId, {
            status: {
              state: result.state,
              modified: new Date(),
            },
          });
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
              this.statusSubjects.get(statusKey)?.next({
                state: agent.status.state,
                message,
                modified: message.modified,
              });
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
   * Debounced message update to reduce database writes
   */
  private debounceUpdateMessage(
    message: AgentInstanceMessage,
    agentId?: string,
    debounceMs = 300,
  ): void {
    const messageId = message.id;

    // Lazy load or get existing debounced function
    if (!this.debouncedUpdateFunctions.has(messageId)) {
      // Create debounced function for each message ID
      const debouncedUpdate = debounce(
        async (msgData: AgentInstanceMessage, aid?: string) => {
          try {
            this.ensureRepositories();
            if (this.dataSource) {
              // Use ORM transaction
              await this.dataSource.transaction(async transaction => {
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
                  const now = new Date();
                  const newMessage = messageRepo.create({
                    id: messageId,
                    agentId: aid,
                    role: msgData.role || 'assistant',
                    content: msgData.content,
                    contentType: msgData.contentType || 'text/plain',
                    modified: now,
                    metadata: msgData.metadata,
                  });

                  await messageRepo.save(newMessage);

                  // Update agent instance message list
                  const agentInstance = await this.getAgent(aid);
                  if (agentInstance) {
                    await this.updateAgent(aid, {
                      messages: [newMessage, ...agentInstance.messages],
                    });
                  }
                } else {
                  logger.warn(`Cannot create message: missing agent ID for message ID: ${messageId}`);
                }
              });
            }
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
}
