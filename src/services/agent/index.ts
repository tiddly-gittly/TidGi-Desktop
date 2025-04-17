import { injectable } from 'inversify';
import { nanoid } from 'nanoid';
import { BehaviorSubject, Observable } from 'rxjs';

import { lazyInject } from '@services/container';
import { IDatabaseService } from '@services/database/interface';
import { AISessionConfig } from '@services/externalAPI/interface'; // 添加AISessionConfig导入
import { IExternalAPIService } from '@services/externalAPI/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWikiService } from '@services/wiki/interface';
import { echoHandler } from './defaultAgents/echo';
import type { Agent, AgentServiceConfig, AgentTask, IAgentService } from './interface';
import { AgentHttpServer } from './server/http-server';
import * as schema from './server/schema';
import { A2AServer } from './server/server';
import { SQLiteTaskStore } from './server/store';

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

  // Store all agent server instances
  private agentServers: Map<string, A2AServer> = new Map();

  // HTTP server instance
  private httpServer: AgentHttpServer | null = null;

  // 重命名流式更新订阅
  public taskUpdates$ = new BehaviorSubject<Record<string, AgentTask>>({});

  // Database initialization flag
  private databaseInitialized = false;

  /**
   * Ensure database is initialized
   */
  private async ensureDatabaseInitialized(): Promise<void> {
    if (this.databaseInitialized) return;

    try {
      // Initialize the database
      await this.databaseService.initializeDatabase('agent-default');
      logger.info('Agent database initialized');
      this.databaseInitialized = true;
    } catch (error) {
      logger.error('Failed to initialize agent database:', error);
      throw error;
    }
  }

  // Agent registration flag
  private agentsRegistered = false;

  /**
   * Ensure agents are registered
   */
  private async ensureAgentsRegistered(): Promise<void> {
    if (this.agentsRegistered) return;

    try {
      // Register default agents
      await this.registerDefaultAgents();
      this.agentsRegistered = true;
    } catch (error) {
      logger.error('Failed to register default agents:', error);
      throw error;
    }
  }

  /**
   * Register default agents
   */
  private async registerDefaultAgents(): Promise<void> {
    try {
      // Ensure database is initialized
      await this.ensureDatabaseInitialized();

      // Get database connection for agent operations
      const dataSource = await this.databaseService.getDatabase('agent-default');

      // Register agent logic
      console.log('Registering default agents');

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

      // Store agent in database to satisfy foreign key constraints
      const agentRepository = dataSource.getRepository('agents');
      try {
        // Check if agent already exists in database
        const existingAgent = await agentRepository.findOne({ where: { id: echoAgent.id } });

        if (!existingAgent) {
          // Insert agent record into database
          await agentRepository.save({
            id: echoAgent.id,
            name: echoAgent.name,
            description: echoAgent.description || null,
            avatarUrl: echoAgent.avatarUrl || null,
            card: echoAgent.card ? JSON.stringify(echoAgent.card) : null,
          });
          console.log(`Inserted agent record into database: ${echoAgent.id}`);
        } else {
          console.log(`Agent record already exists in database: ${echoAgent.id}`);
        }
      } catch (databaseError) {
        console.error(`Failed to store agent in database: ${echoAgent.id}`, databaseError);
        // Continue anyway - the agent is in memory
      }

      // Create server instance
      await this.createAgentServer(echoAgent);

      console.log('Registered default agent:', echoAgent.id);
    } catch (error) {
      console.error('Error registering default agents:', error);
      throw error;
    }
  }

  /**
   * Create a server instance for an agent
   */
  private async createAgentServer(agent: Agent): Promise<A2AServer> {
    // Check if server already exists for this agent
    if (this.agentServers.has(agent.id)) {
      return this.agentServers.get(agent.id)!;
    }

    try {
      // Get database connection
      const dataSource = await this.databaseService.getDatabase('agent-default');

      // Create SQLite task store
      const taskStore = new SQLiteTaskStore(dataSource);

      // Create A2A server instance
      const server = new A2AServer(agent.handler, {
        taskStore,
        card: agent.card,
        agentId: agent.id, // 添加这一行，传递正确的agent.id而不是使用card.name
      });

      // Store server instance
      this.agentServers.set(agent.id, server);

      console.log(`Created A2A server for agent: ${agent.id}`);
      return server;
    } catch (error) {
      logger.error(`Failed to create agent server for ${agent.id}:`, error);
      throw error;
    }
  }

  /**
   * Notify task update
   */
  private notifyTaskUpdate(agentId: string, taskId: string, task: AgentTask | null): void {
    this.taskUpdates$.next({ [taskId]: task });
  }

  /**
   * Convert A2A session to UI task object
   */
  private convertToAgentTask(agentId: string, task: schema.Task, history: schema.Message[]): AgentTask {
    const timestamp = task.status.timestamp
      ? new Date(task.status.timestamp)
      : new Date();

    return {
      id: task.id,
      agentId,
      messages: history || [],
      status: task.status,
      metadata: task.metadata,
      createdAt: timestamp,
      updatedAt: timestamp,
      artifacts: task.artifacts,
    };
  }

  /**
   * Get task and its history
   */
  private async getTaskWithHistory(agentId: string, taskId: string): Promise<{ task: schema.Task; history: schema.Message[] } | null> {
    try {
      const server = await this.getOrCreateAgentServer(agentId);

      // Request to get task
      const getTaskRequest: schema.GetTaskRequest = {
        jsonrpc: '2.0',
        id: nanoid(),
        method: 'tasks/get',
        params: { id: taskId },
      };

      const response = await server.handleRequest(getTaskRequest);

      if (response.error || !response.result) {
        return null;
      }

      const task = response.result as schema.Task;

      // Get history - use server method to get full history
      let history: schema.Message[] = [];

      try {
        history = await server.getTaskHistory(taskId);

        // If history is empty but there is a current message, ensure it is included
        if (history.length === 0 && task.status.message) {
          history.push(task.status.message);
        }
      } catch (historyError) {
        console.error(`Failed to get history for task ${taskId}:`, historyError);
        // Fallback: at least capture current status message
        if (task.status.message) {
          history.push(task.status.message);
        }
      }

      return { task, history };
    } catch (error) {
      console.error(`Failed to get task ${taskId} for agent ${agentId}:`, error);
      return null;
    }
  }

  // Implement IAgentService interface methods

  async getAgents(): Promise<Omit<Agent, 'handler'>[]> {
    await this.ensureAgentsRegistered();

    // Return list of Agent objects without handler, ensuring they can be transferred via IPC
    return Array.from(this.agents.values()).map(agent => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      avatarUrl: agent.avatarUrl,
      card: agent.card,
      // Do not include handler property, as functions cannot be transferred via IPC
    }));
  }

  async getAgent(id: string): Promise<Agent | undefined> {
    await this.ensureAgentsRegistered();

    return this.agents.get(id);
  }

  /**
   * Create new task (session)
   */
  async createTask(agentId: string): Promise<AgentTask> {
    await this.ensureAgentsRegistered();

    if (!this.agents.has(agentId)) {
      throw new Error(`Agent with ID ${agentId} not found`);
    }

    // Generate task ID
    const taskId = nanoid();

    // Create an empty task object
    const now = new Date();
    const task: AgentTask = {
      id: taskId,
      agentId,
      messages: [],
      status: {
        state: 'submitted',
        timestamp: now.toISOString(),
      },
      createdAt: now,
      updatedAt: now,
    };

    // Update cache and notify
    this.notifyTaskUpdate(agentId, taskId, task);

    return task;
  }

  /**
   * Send message to a task
   */
  async sendMessage(agentId: string, taskId: string, messageText: string): Promise<schema.JSONRPCResponse> {
    await this.ensureAgentsRegistered();

    // Get server instance
    const server = await this.getOrCreateAgentServer(agentId);

    // Create message object
    const message: schema.Message = {
      role: 'user',
      parts: [{ text: messageText }],
    };

    // Build A2A request
    const request: schema.SendTaskRequest = {
      jsonrpc: '2.0',
      id: nanoid(),
      method: 'tasks/send',
      params: {
        id: taskId, // Session ID is task ID
        message,
      },
    };

    // Send request
    const response = await server.handleRequest(request);

    // On successful request, get latest session status and update
    if (response.result && !response.error) {
      const taskData = await this.getTaskWithHistory(agentId, taskId);
      if (taskData) {
        const task = this.convertToAgentTask(agentId, taskData.task, taskData.history);
        this.notifyTaskUpdate(agentId, taskId, task);
      }
    }

    return response;
  }

  /**
   * Stream message to a task
   */
  handleStreamingRequest(agentId: string, taskId: string, messageText: string): Observable<schema.TaskStatusUpdateEvent | schema.TaskArtifactUpdateEvent> {
    // Create observable
    return new Observable<schema.TaskStatusUpdateEvent | schema.TaskArtifactUpdateEvent>(subscriber => {
      // Get server instance asynchronously
      this.getOrCreateAgentServer(agentId)
        .then(server => {
          // Create message object
          const message: schema.Message = {
            role: 'user',
            parts: [{ text: messageText }],
          };

          // Build A2A streaming request
          const request: schema.SendTaskStreamingRequest = {
            jsonrpc: '2.0',
            id: nanoid(),
            method: 'tasks/sendSubscribe',
            params: {
              id: taskId, // Session ID is task ID
              message,
            },
          };

          // Call server's streaming handling method
          const eventEmitter = server.handleStreamingRequest(request);

          // Subscribe to event stream
          eventEmitter.on('update', async (event: schema.TaskStatusUpdateEvent | schema.TaskArtifactUpdateEvent) => {
            console.log(`[Agent Service] Received event:`, event); // Add log
            subscriber.next(event);

            // If update contains message, refresh session
            if ('status' in event && event.status.message) {
              console.log(`[Agent Service] Event contains message:`, event.status.message); // Add log
              const sessionData = await this.getTaskWithHistory(agentId, taskId);
              if (sessionData) {
                const task = this.convertToAgentTask(agentId, sessionData.task, sessionData.history);
                console.log(`[Agent Service] Updated session:`, task); // Add log
                this.notifyTaskUpdate(agentId, taskId, task);
              }
            }

            // If final event, complete stream
            if (event.final) {
              console.log(`[Agent Service] Final event received`); // Add log
              // Get complete session status once
              const sessionData = await this.getTaskWithHistory(agentId, taskId);
              if (sessionData) {
                console.log(`[Agent Service] Final session history:`, sessionData.history); // Add log
                const task = this.convertToAgentTask(agentId, sessionData.task, sessionData.history);
                this.notifyTaskUpdate(agentId, taskId, task);
              }
              subscriber.complete();
            }
          });

          eventEmitter.on('error', (error: Error) => {
            subscriber.error(error);
          });
        })
        .catch(error => {
          subscriber.error(error);
        });

      // Return cleanup function
      return () => {
        // Cleanup logic
      };
    });
  }

  /**
   * Get or create agent server instance
   */
  private async getOrCreateAgentServer(agentId: string): Promise<A2AServer> {
    await this.ensureAgentsRegistered();

    if (!this.agents.has(agentId)) {
      throw new Error(`Agent with ID ${agentId} not found`);
    }

    if (!this.agentServers.has(agentId)) {
      await this.createAgentServer(this.agents.get(agentId)!);
    }

    return this.agentServers.get(agentId)!;
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<AgentTask | undefined> {
    await this.ensureAgentsRegistered();

    // Traverse all agent servers to find matching task
    for (const [agentId, server] of this.agentServers.entries()) {
      try {
        const taskData = await this.getTaskWithHistory(agentId, taskId);
        if (taskData) {
          // Found matching task, convert and return
          return this.convertToAgentTask(agentId, taskData.task, taskData.history);
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
    await this.ensureAgentsRegistered();

    try {
      const server = await this.getOrCreateAgentServer(agentId);

      // Get all tasks
      const tasks = await server.getAllTasks();

      // Convert to AgentTask objects
      const agentTasks: AgentTask[] = [];

      for (const task of tasks) {
        const taskData = await this.getTaskWithHistory(agentId, task.id);
        if (!taskData) continue;

        const agentTask = this.convertToAgentTask(agentId, taskData.task, taskData.history);
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
    await this.ensureAgentsRegistered();

    try {
      // Get server instance
      const server = await this.getOrCreateAgentServer(agentId);

      // First cancel the task if running
      const cancelRequest: schema.CancelTaskRequest = {
        jsonrpc: '2.0',
        id: nanoid(),
        method: 'tasks/cancel',
        params: {
          id: taskId,
        },
      };
      await server.handleRequest(cancelRequest);

      // Then delete task record from database
      const deleted = await server.deleteTask(taskId);
      logger.info(`Deleted task ${taskId} from database: ${deleted}`);

      // Notify frontend about task deletion
      this.notifyTaskUpdate(agentId, taskId, null);
    } catch (error) {
      logger.error(`Failed to delete task ${taskId}:`, error);
    }
  }

  async startHttpServer(config: AgentServiceConfig): Promise<void> {
    await this.ensureAgentsRegistered();

    if (this.httpServer) {
      await this.stopHttpServer();
    }

    this.httpServer = new AgentHttpServer({
      port: config.httpServerPort || 41241,
      basePath: config.httpServerBasePath || '/',
      agentService: this,
    });

    await this.httpServer.start();
  }

  async stopHttpServer(): Promise<void> {
    if (this.httpServer) {
      await this.httpServer.stop();
      this.httpServer = null;
    }
  }

  /**
   * Get default agent ID if set
   */
  public async getDefaultAgentId(): Promise<string | undefined> {
    const dataSource = await this.databaseService.getDatabase('agent-default');

    // Get agent with most recent activity
    const result = await dataSource.getRepository(TaskEntity)
      .createQueryBuilder('task')
      .innerJoinAndSelect('task.agent', 'agent')
      .orderBy('task.updatedAt', 'DESC')
      .take(1)
      .getOne();

    if (result) {
      return result.agentId;
    }

    // If no tasks, get any available agent
    const agent = await dataSource.getRepository(AgentEntity)
      .createQueryBuilder('agent')
      .orderBy('agent.createdAt', 'DESC')
      .take(1)
      .getOne();

    return agent?.id;
  }

  /**
   * Get agent-specific AI configuration
   */
  public async getAgentAIConfig(agentId: string): Promise<AISessionConfig | undefined> {
    try {
      const dataSource = await this.databaseService.getDatabase('agent-default');
      const repository = dataSource.getRepository(AgentEntity);

      const agent = await repository.findOne({ where: { id: agentId } });

      if (!agent || !agent.aiConfig) {
        // If no specific config exists, return undefined to use global defaults
        return undefined;
      }

      // Parse stored JSON config
      return JSON.parse(agent.aiConfig) as AISessionConfig;
    } catch (error) {
      logger.error(`Failed to get AI config for agent ${agentId}:`, error);
      return undefined;
    }
  }

  /**
   * Update agent-specific AI configuration
   */
  public async updateAgentAIConfig(agentId: string, config: Partial<AISessionConfig>): Promise<void> {
    try {
      const dataSource = await this.databaseService.getDatabase('agent-default');
      const repository = dataSource.getRepository(AgentEntity);

      const agent = await repository.findOne({ where: { id: agentId } });

      if (!agent) {
        throw new Error(`Agent with ID ${agentId} not found`);
      }

      // Merge with existing config if it exists
      const currentConfig: AISessionConfig = agent.aiConfig
        ? JSON.parse(agent.aiConfig)
        : { provider: '', model: '' };

      // Get defaults for any missing fields from externalAPIService
      const defaults = await this.externalAPIService.getAIConfig();

      // Merge in this order: defaults -> current -> new config
      const mergedConfig = {
        ...defaults,
        ...currentConfig,
        ...config,
        // Handle nested modelParameters separately
        modelParameters: {
          ...(defaults.modelParameters || {}),
          ...(currentConfig.modelParameters || {}),
          ...(config.modelParameters || {}),
        },
      };

      // Store the updated config
      agent.aiConfig = JSON.stringify(mergedConfig);

      await repository.save(agent);

      logger.info(`Updated AI config for agent ${agentId}`);
    } catch (error) {
      logger.error(`Failed to update AI config for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Get task-specific AI configuration
   */
  public async getTaskAIConfig(taskId: string): Promise<AISessionConfig | undefined> {
    try {
      const dataSource = await this.databaseService.getDatabase('agent-default');
      const repository = dataSource.getRepository(TaskEntity);

      const task = await repository.findOne({
        where: { id: taskId },
        relations: ['agent'], // Load the related agent
      });

      if (!task) {
        return undefined;
      }

      // First try task-specific config
      if (task.aiConfig) {
        return JSON.parse(task.aiConfig) as AISessionConfig;
      }

      // Then try agent-level config
      if (task.agent && task.agent.aiConfig) {
        return JSON.parse(task.agent.aiConfig) as AISessionConfig;
      }

      // Fall back to global defaults
      return undefined;
    } catch (error) {
      logger.error(`Failed to get AI config for task ${taskId}:`, error);
      return undefined;
    }
  }

  /**
   * Update task-specific AI configuration
   */
  public async updateTaskAIConfig(taskId: string, config: Partial<AISessionConfig>): Promise<void> {
    try {
      const dataSource = await this.databaseService.getDatabase('agent-default');
      const repository = dataSource.getRepository(TaskEntity);

      const task = await repository.findOne({
        where: { id: taskId },
        relations: ['agent'], // Load the related agent
      });

      if (!task) {
        throw new Error(`Task with ID ${taskId} not found`);
      }

      // Start with agent config or empty config
      let baseConfig: AISessionConfig = { provider: '', model: '' };

      // Try to use agent config if available
      if (task.agent && task.agent.aiConfig) {
        baseConfig = JSON.parse(task.agent.aiConfig);
      } else {
        // Otherwise get global defaults
        baseConfig = await this.externalAPIService.getAIConfig();
      }

      // Get existing task config if any
      let currentConfig: Partial<AISessionConfig> = {};
      if (task.aiConfig) {
        currentConfig = JSON.parse(task.aiConfig);
      }

      // Merge in this order: base (agent or global) -> current task -> new config
      const mergedConfig = {
        ...baseConfig,
        ...currentConfig,
        ...config,
        // Handle nested modelParameters separately
        modelParameters: {
          ...(baseConfig.modelParameters || {}),
          ...(currentConfig.modelParameters || {}),
          ...(config.modelParameters || {}),
        },
      };

      task.aiConfig = JSON.stringify(mergedConfig);

      await repository.save(task);

      logger.info(`Updated AI config for task ${taskId}`);
    } catch (error) {
      logger.error(`Failed to update AI config for task ${taskId}:`, error);
      throw error;
    }
  }
}
