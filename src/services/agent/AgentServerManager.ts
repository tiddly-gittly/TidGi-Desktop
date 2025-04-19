import { EventEmitter } from 'events';
import { nanoid } from 'nanoid';
import { Observable } from 'rxjs';
import { DataSource } from 'typeorm';

import { logger } from '@services/libs/log';
import { AgentDatabaseManager } from './AgentDatabaseManager';
import { AgentConfigSchema, AgentPromptDescription } from './defaultAgents/schemas';
import { Agent, AgentTask, IAgentService } from './interface';
import { AgentHttpServer } from './server/http-server';
import * as schema from './server/schema';
import { A2AServer } from './server/server';
import { SQLiteTaskStore } from './server/store';

/**
 * Manages agent server instances and HTTP server
 */
export class AgentServerManager {
  // Store all agent server instances
  private agentServers: Map<string, A2AServer> = new Map();

  // HTTP server instance
  private httpServer: AgentHttpServer | null = null;

  // Database manager
  private dbManager: AgentDatabaseManager;

  constructor(dataSource: DataSource) {
    this.dbManager = new AgentDatabaseManager(dataSource);
  }

  /**
   * Create or get server instance for an agent
   */
  async getOrCreateServer(agent: Agent): Promise<A2AServer> {
    // Check if server already exists for this agent
    if (this.agentServers.has(agent.id)) {
      return this.agentServers.get(agent.id)!;
    }

    try {
      // Create SQLite task store
      const taskStore = new SQLiteTaskStore(this.dbManager.getDataSource());

      // Get agent's AI config from database
      let parsedAiConfig: AgentPromptDescription | undefined;
      const agentRecord = await this.dbManager.getAgent(agent.id);

      if (agentRecord && agentRecord.aiConfig) {
        try {
          // 直接使用 Zod 处理解析和验证，不需要额外的类型断言
          parsedAiConfig = AgentConfigSchema.parse(JSON.parse(agentRecord.aiConfig));
          logger.debug(`Loaded and parsed aiConfig for agent: ${agent.id}`);
        } catch (parseError) {
          logger.error(`Failed to parse aiConfig for agent ${agent.id}:`, parseError);
        }
      }

      // Create A2A server instance with parsed aiConfig
      const server = new A2AServer(agent.handler, {
        taskStore,
        card: agent.card,
        agentId: agent.id,
        aiConfig: parsedAiConfig,
      });

      // Store server instance
      this.agentServers.set(agent.id, server);

      logger.info(`Created A2A server for agent: ${agent.id}`);
      return server;
    } catch (error) {
      logger.error(`Failed to create agent server for ${agent.id}:`, error);
      throw error;
    }
  }

  /**
   * Close server for an agent
   */
  async closeServer(agentId: string): Promise<void> {
    if (this.agentServers.has(agentId)) {
      this.agentServers.delete(agentId);
      logger.info(`Closed agent server for ${agentId}`);
    }
  }

  /**
   * Send message to a task
   */
  async sendMessage(agent: Agent, taskId: string, messageText: string): Promise<schema.JSONRPCResponse> {
    // Get server instance
    const server = await this.getOrCreateServer(agent);

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
        id: taskId,
        message,
      },
    };

    // Send request
    return await server.handleRequest(request);
  }

  /**
   * Stream message to a task
   */
  handleStreamingRequest(agent: Agent, taskId: string, messageText: string): Observable<schema.TaskStatusUpdateEvent | schema.TaskArtifactUpdateEvent> {
    // Create observable
    return new Observable<schema.TaskStatusUpdateEvent | schema.TaskArtifactUpdateEvent>(subscriber => {
      // Get server instance asynchronously
      this.getOrCreateServer(agent)
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
              id: taskId,
              message,
            },
          };

          // Call server's streaming handling method
          const eventEmitter: EventEmitter = server.handleStreamingRequest(request);

          // Subscribe to event stream
          eventEmitter.on('update', (event: schema.TaskStatusUpdateEvent | schema.TaskArtifactUpdateEvent) => {
            subscriber.next(event);

            // If final event, complete stream
            if (event.final) {
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
        // Cleanup logic if needed
      };
    });
  }

  /**
   * Get task with history
   */
  async getTaskWithHistory(agentId: string, taskId: string): Promise<{ task: schema.Task; history: schema.Message[] } | null> {
    try {
      // Get agent
      const agent = await this.dbManager.getAgent(agentId);
      if (!agent) {
        throw new Error(`Agent with ID ${agentId} not found`);
      }

      // Get server instance (requires Agent object)
      // Since we don't have full Agent object here, we'll assume the server is already created
      const server = this.agentServers.get(agentId);
      if (!server) {
        throw new Error(`Server for agent ${agentId} not found`);
      }

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
        logger.error(`Failed to get history for task ${taskId}:`, historyError);
        // Fallback: at least capture current status message
        if (task.status.message) {
          history.push(task.status.message);
        }
      }

      return { task, history };
    } catch (error) {
      logger.error(`Failed to get task ${taskId} for agent ${agentId}:`, error);
      return null;
    }
  }

  /**
   * Convert a schema task to an AgentTask
   */
  convertToAgentTask(agentId: string, task: schema.Task, history: schema.Message[]): AgentTask {
    const timestamp = task.status.timestamp
      ? new Date(task.status.timestamp)
      : new Date();

    return {
      id: task.id,
      agentId,
      messages: history || [],
      status: task.status,
      state: task.status.state,
      metadata: task.metadata,
      createdAt: timestamp,
      updatedAt: timestamp,
      artifacts: task.artifacts,
    };
  }

  /**
   * Start HTTP server
   */
  async startHttpServer(config: {
    port: number;
    basePath: string;
    agentService: IAgentService;
  }): Promise<void> {
    if (this.httpServer) {
      await this.stopHttpServer();
    }

    this.httpServer = new AgentHttpServer({
      port: config.port,
      basePath: config.basePath,
      agentService: config.agentService,
    });

    await this.httpServer.start();
    logger.info(`HTTP server started on port ${config.port}`);
  }

  /**
   * Stop HTTP server
   */
  async stopHttpServer(): Promise<void> {
    if (this.httpServer) {
      await this.httpServer.stop();
      this.httpServer = null;
      logger.info('HTTP server stopped');
    }
  }

  /**
   * Delete a task
   */
  async deleteTask(agentId: string, taskId: string): Promise<boolean> {
    try {
      // Get server instance
      const server = this.agentServers.get(agentId);
      if (!server) {
        throw new Error(`Server for agent ${agentId} not found`);
      }

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

      return deleted;
    } catch (error) {
      logger.error(`Failed to delete task ${taskId}:`, error);
      return false;
    }
  }

  /**
   * Get all tasks for an agent
   */
  async getAllTasks(agentId: string): Promise<schema.Task[]> {
    try {
      const server = this.agentServers.get(agentId);
      if (!server) {
        throw new Error(`Server for agent ${agentId} not found`);
      }

      return await server.getAllTasks();
    } catch (error) {
      logger.error(`Failed to get all tasks for agent ${agentId}:`, error);
      return [];
    }
  }

  /**
   * Get all servers
   */
  getAllServers(): Map<string, A2AServer> {
    return this.agentServers;
  }
}
