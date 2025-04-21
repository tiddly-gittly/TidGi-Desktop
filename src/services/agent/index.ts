import { injectable } from 'inversify';
import { BehaviorSubject, Observable } from 'rxjs';

import { AiAPIConfig } from '@services/agent/defaultAgents/schemas';
import { lazyInject } from '@services/container';
import { IDatabaseService } from '@services/database/interface';
import { IExternalAPIService } from '@services/externalAPI/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWikiService } from '@services/wiki/interface';

import { echoHandler } from './defaultAgents/echo';
import type { Agent, AgentServiceConfig, AgentTask, IAgentService } from './interface';
import * as schema from './server/schema';

// Import the new manager classes
import { AgentConfigManager } from './AgentConfigManager';
import { AgentDatabaseManager } from './AgentDatabaseManager';
import { AgentServerManager } from './AgentServerManager';

@injectable()
export class AgentService implements IAgentService {
  @lazyInject(serviceIdentifier.Database)
  private readonly databaseService!: IDatabaseService;

  @lazyInject(serviceIdentifier.ExternalAPI)
  private readonly externalAPIService!: IExternalAPIService;

  @lazyInject(serviceIdentifier.Wiki)
  private readonly wikiService!: IWikiService;

  // Store all agents
  private agents: Map<string, Agent> = new Map();

  // Managers for different responsibilities
  private dbManager?: AgentDatabaseManager;
  private serverManager?: AgentServerManager;
  private configManager?: AgentConfigManager;

  // Task updates observable
  public taskUpdates$ = new BehaviorSubject<Record<string, AgentTask | null>>({});

  // Database initialization flag
  private initialized = false;

  /**
   * Initialize the service
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize the database
      await this.databaseService.initializeDatabase('agent-default');
      logger.info('Agent database initialized');

      // Initialize managers
      const dataSource = await this.databaseService.getDatabase('agent-default');
      this.dbManager = new AgentDatabaseManager(dataSource);
      this.serverManager = new AgentServerManager(dataSource);
      this.configManager = new AgentConfigManager(this.dbManager, this.externalAPIService);

      // Register default agents
      await this.registerDefaultAgents();

      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize agent service:', error);
      throw error;
    }
  }

  /**
   * Register default agents
   */
  private async registerDefaultAgents(): Promise<void> {
    try {
      logger.info('Registering default agents');

      // Example: Register a simple echo agent
      const echoAgent: Agent = {
        id: 'echo-agent',
        name: 'Echo Agent',
        description: 'Simple echo agent that returns user messages',
        avatarUrl: 'https://example.com/echo-agent.png',
        handler: echoHandler,
        card: {
          name: 'Echo Agent',
          description: 'Simple echo agent',
          url: 'http://localhost:41241/echo-agent',
          version: '1.0.0',
          capabilities: {
            streaming: true,
          },
          skills: [
            {
              id: 'echo',
              name: 'Echo',
              description: 'Echo user input',
            },
          ],
        },
      };

      // Store agent in memory
      this.agents.set(echoAgent.id, echoAgent);

      // Store agent in database
      if (this.dbManager) {
        await this.dbManager.saveAgent({
          id: echoAgent.id,
          name: echoAgent.name,
          description: echoAgent.description,
          avatarUrl: echoAgent.avatarUrl,
          card: echoAgent.card,
        });
      }

      // Create server instance
      if (this.serverManager) {
        await this.serverManager.getOrCreateServer(echoAgent);
      }

      logger.info('Registered default agent:', echoAgent.id);
    } catch (error) {
      logger.error('Error registering default agents:', error);
      throw error;
    }
  }

  /**
   * Notify task update
   */
  private notifyTaskUpdate(agentId: string, taskId: string, task: AgentTask | null): void {
    this.taskUpdates$.next({ [taskId]: task });
  }

  // IAgentService interface implementation

  /**
   * Get all available agents
   */
  async getAgents(): Promise<Omit<Agent, 'handler'>[]> {
    await this.initialize();

    // Return list of Agent objects without handler, ensuring they can be transferred via IPC
    return Array.from(this.agents.values()).map(agent => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      avatarUrl: agent.avatarUrl,
      card: agent.card,
    }));
  }

  /**
   * Get a specific agent
   */
  async getAgent(id: string): Promise<Agent | undefined> {
    await this.initialize();
    return this.agents.get(id);
  }

  /**
   * Create a new task
   */
  async createTask(agentId: string): Promise<AgentTask> {
    await this.initialize();

    if (!this.agents.has(agentId)) {
      throw new Error(`Agent with ID ${agentId} not found`);
    }

    // Create task in database
    const taskEntity = await this.dbManager!.createTask(agentId);

    // Create agent task object
    const now = new Date();
    const taskStatus = JSON.parse(taskEntity.status) as schema.TaskStatus;

    const task: AgentTask = {
      id: taskEntity.id,
      agentId,
      messages: [],
      status: taskStatus,
      state: taskEntity.state,
      createdAt: taskEntity.createdAt || now,
      updatedAt: taskEntity.updatedAt || now,
    };

    // Notify about new task
    this.notifyTaskUpdate(agentId, task.id, task);

    return task;
  }

  /**
   * Send message to a task
   */
  async sendMessage(agentId: string, taskId: string, messageText: string): Promise<schema.JSONRPCResponse> {
    await this.initialize();

    // Get agent
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent with ID ${agentId} not found`);
    }

    // Send message using server manager
    const response = await this.serverManager!.sendMessage(agent, taskId, messageText);

    // On successful request, get latest task status and update
    if (response.result && !response.error) {
      const taskData = await this.serverManager!.getTaskWithHistory(agentId, taskId);
      if (taskData) {
        const task = this.serverManager!.convertToAgentTask(agentId, taskData.task, taskData.history);
        this.notifyTaskUpdate(agentId, taskId, task);
      }
    }

    return response;
  }

  /**
   * Stream message to a task
   */
  handleStreamingRequest(agentId: string, taskId: string, messageText: string): Observable<schema.TaskStatusUpdateEvent | schema.TaskArtifactUpdateEvent> {
    // Initialize is called in the observer to avoid blocking
    // Create observable
    return new Observable<schema.TaskStatusUpdateEvent | schema.TaskArtifactUpdateEvent>(subscriber => {
      // Initialize asynchronously
      this.initialize()
        .then(() => {
          // Get agent
          const agent = this.agents.get(agentId);
          if (!agent) {
            subscriber.error(new Error(`Agent with ID ${agentId} not found`));
            return;
          }

          // Create streaming observable
          const observable = this.serverManager!.handleStreamingRequest(agent, taskId, messageText);

          // Subscribe to event stream
          const subscription = observable.subscribe({
            next: async (event) => {
              subscriber.next(event);

              // If update contains message, refresh task
              if ('status' in event && event.status.message) {
                const taskData = await this.serverManager!.getTaskWithHistory(agentId, taskId);
                if (taskData) {
                  const task = this.serverManager!.convertToAgentTask(agentId, taskData.task, taskData.history);
                  this.notifyTaskUpdate(agentId, taskId, task);
                }
              }

              // If final event, complete stream
              if (event.final) {
                // Get complete task status once
                const taskData = await this.serverManager!.getTaskWithHistory(agentId, taskId);
                if (taskData) {
                  const task = this.serverManager!.convertToAgentTask(agentId, taskData.task, taskData.history);
                  this.notifyTaskUpdate(agentId, taskId, task);
                }
                subscriber.complete();
              }
            },
            error: (error) => {
              subscriber.error(error);
            },
            complete: () => {
              subscriber.complete();
            },
          });

          // Return cleanup function
          return () => {
            subscription.unsubscribe();
          };
        })
        .catch(error => {
          subscriber.error(error);
        });
    });
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<AgentTask | undefined> {
    await this.initialize();

    // Traverse all agent servers to find task
    for (const agentId of this.agents.keys()) {
      try {
        const taskData = await this.serverManager!.getTaskWithHistory(agentId, taskId);
        if (taskData) {
          // Found task, convert and return
          return this.serverManager!.convertToAgentTask(agentId, taskData.task, taskData.history);
        }
      } catch (error) {
        // Continue to next agent
      }
    }
    return undefined;
  }

  /**
   * Get all tasks for an agent
   */
  async getAgentTasks(agentId: string): Promise<AgentTask[]> {
    await this.initialize();

    try {
      if (!this.agents.has(agentId)) {
        throw new Error(`Agent with ID ${agentId} not found`);
      }

      // Get all tasks using server manager
      const tasks = await this.serverManager!.getAllTasks(agentId);

      // Convert to AgentTask objects
      const agentTasks: AgentTask[] = [];

      for (const task of tasks) {
        const taskData = await this.serverManager!.getTaskWithHistory(agentId, task.id);
        if (!taskData) continue;

        const agentTask = this.serverManager!.convertToAgentTask(agentId, taskData.task, taskData.history);
        agentTasks.push(agentTask);
      }

      return agentTasks;
    } catch (error) {
      logger.error(`Failed to get tasks for agent ${agentId}:`, error);
      return [];
    }
  }

  /**
   * Delete a task
   */
  async deleteTask(agentId: string, taskId: string): Promise<void> {
    await this.initialize();

    try {
      // Delete task using server manager
      const deleted = await this.serverManager!.deleteTask(agentId, taskId);

      if (deleted) {
        // Notify about task deletion
        this.notifyTaskUpdate(agentId, taskId, null);
      }
    } catch (error) {
      logger.error(`Failed to delete task ${taskId}:`, error);
    }
  }

  /**
   * Cancel a task without deleting it
   */
  async cancelTask(agentId: string, taskId: string): Promise<void> {
    await this.initialize();

    try {
      // Get agent
      const agent = this.agents.get(agentId);
      if (!agent) {
        throw new Error(`Agent with ID ${agentId} not found`);
      }

      // Cancel task using server manager
      await this.serverManager!.cancelTask(agentId, taskId);

      // Get updated task status and notify
      const taskData = await this.serverManager!.getTaskWithHistory(agentId, taskId);
      if (taskData) {
        const task = this.serverManager!.convertToAgentTask(agentId, taskData.task, taskData.history);
        this.notifyTaskUpdate(agentId, taskId, task);
      }
    } catch (error) {
      logger.error(`Failed to cancel task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Start HTTP server
   */
  async startHttpServer(config: AgentServiceConfig): Promise<void> {
    await this.initialize();

    await this.serverManager!.startHttpServer({
      port: config.httpServerPort || 41241,
      basePath: config.httpServerBasePath || '/',
      agentService: this,
    });
  }

  /**
   * Stop HTTP server
   */
  async stopHttpServer(): Promise<void> {
    if (this.serverManager) {
      await this.serverManager.stopHttpServer();
    }
  }

  /**
   * Get default agent ID
   */
  async getDefaultAgentId(): Promise<string | undefined> {
    await this.initialize();
    return this.dbManager!.getDefaultAgentId();
  }

  /**
   * Get AI configuration based on task and agent IDs
   */
  async getAIConfigByIds(taskId?: string, agentId?: string): Promise<AiAPIConfig> {
    await this.initialize();
    return this.configManager!.getAIConfigByIds(taskId, agentId);
  }

  /**
   * Update agent-specific AI configuration
   */
  async updateAgentAIConfig(agentId: string, config: Partial<AiAPIConfig>): Promise<void> {
    await this.initialize();

    // Update configuration using config manager
    await this.configManager!.updateAgentAIConfig(agentId, config);

    // Recreate server instance if needed
    if (this.agents.has(agentId) && this.serverManager) {
      const agent = this.agents.get(agentId)!;

      // Close existing server
      await this.serverManager.closeServer(agentId);

      // Create new server with updated config
      await this.serverManager.getOrCreateServer(agent);

      logger.info(`Recreated agent server for ${agentId} with updated configuration`);
    }
  }

  /**
   * Update task-specific AI configuration
   */
  async updateTaskAIConfig(taskId: string, config: Partial<AiAPIConfig>): Promise<void> {
    await this.initialize();
    await this.configManager!.updateTaskAIConfig(taskId, config);
  }
}
