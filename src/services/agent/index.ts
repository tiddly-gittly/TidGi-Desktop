/* eslint-disable @typescript-eslint/require-await */
import { injectable } from 'inversify';
import { nanoid } from 'nanoid';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';

import { lazyInject } from '@services/container';
import { IDatabaseService } from '@services/database/interface';
import { AIMessage, AIStreamResponse } from '@services/externalAPI/interface';
import { IExternalAPIService } from '@services/externalAPI/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWikiService } from '@services/wiki/interface';
import type { Agent, AgentServiceConfig, AgentSession, IAgentService } from './interface';
import { TaskYieldUpdate } from './server';
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

  // Session updates stream - only sends updated sessions
  public sessionUpdates$ = new BehaviorSubject<Record<string, AgentSession>>({});


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
        handler: this.createEchoHandler(),
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
            card: echoAgent.card ? JSON.stringify(echoAgent.card) : null
          });
          console.log(`Inserted agent record into database: ${echoAgent.id}`);
        } else {
          console.log(`Agent record already exists in database: ${echoAgent.id}`);
        }
      } catch (dbError) {
        console.error(`Failed to store agent in database: ${echoAgent.id}`, dbError);
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
   * Create echo handler
   */
  private createEchoHandler() {
    return async function* echoHandler(context: any) {
      // DEBUG: console
      console.log(`echoHandler`);
      // Send working status first
      yield {
        state: 'working',
        message: {
          role: 'agent',
          parts: [{ text: 'Processing your message...' }],
        },
      } as TaskYieldUpdate;

      // Wait a while to simulate processing
      await new Promise(resolve => setTimeout(resolve, 1000));
      // DEBUG: console context
      console.log(`context`, context);
      // Check if cancelled
      if (context.isCancelled()) {
        yield { state: 'canceled' } as TaskYieldUpdate;
        return;
      }
      // DEBUG: console context.userMessage.parts
      console.log(`context.userMessage.parts`, context.userMessage.parts);
      // Get user message text
      const userText = context.userMessage.parts
        .filter((part: any) => part.text)
        .map((part: any) => part.text)
        .join(' ');
      // DEBUG: console userText
      console.log(`userText`, userText);

      // Echo user message
      yield {
        state: 'completed',
        message: {
          role: 'agent',
          parts: [{ text: `You said: ${userText}` }],
        },
      } as TaskYieldUpdate;
    };
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
   * Notify session update (only updates specified session)
   */
  private notifySessionUpdate(agentId: string, sessionId: string, session: AgentSession | null): void {
    if (session === null) {
      // Send delete session notification
      this.sessionUpdates$.next({ [sessionId]: null as any });
    } else {
      // Send session update notification
      this.sessionUpdates$.next({ [sessionId]: session });
    }
  }

  /**
   * Convert A2A session to UI session object
   */
  private convertSessionToAgentSession(agentId: string, task: schema.Task, history: schema.Message[]): AgentSession {
    const timestamp = task.status.timestamp
      ? new Date(task.status.timestamp)
      : new Date();

    return {
      id: task.id,
      agentId,
      messages: history || [],
      currentSessionId: task.id, // Renamed from currentTaskId
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  /**
   * Get session and its history
   */
  private async getSessionWithHistory(agentId: string, sessionId: string): Promise<{ task: schema.Task; history: schema.Message[] } | null> {
    try {
      const server = await this.getOrCreateAgentServer(agentId);

      // Request to get session
      const getSessionRequest: schema.GetTaskRequest = {
        jsonrpc: '2.0',
        id: nanoid(),
        method: 'tasks/get',
        params: { id: sessionId },
      };

      const response = await server.handleRequest(getSessionRequest);

      if (response.error || !response.result) {
        return null;
      }

      const task = response.result as schema.Task;

      // Get history - use server method to get full history
      let history: schema.Message[] = [];

      try {
        // Get directly from A2A server
        history = await server.getSessionHistory(sessionId);

        // If history is empty but there is a current message, ensure it is included
        if (history.length === 0 && task.status.message) {
          history.push(task.status.message);
        }
      } catch (historyError) {
        console.error(`Failed to get history for session ${sessionId}:`, historyError);
        // Fallback: at least capture current status message
        if (task.status.message) {
          history.push(task.status.message);
        }
      }

      return { task, history };
    } catch (error) {
      console.error(`Failed to get session ${sessionId} for agent ${agentId}:`, error);
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
   * Create new session
   */
  async createSession(agentId: string): Promise<AgentSession> {
    await this.ensureAgentsRegistered();
    
    if (!this.agents.has(agentId)) {
      throw new Error(`Agent with ID ${agentId} not found`);
    }

    // Generate session ID (also task ID)
    const sessionId = nanoid();

    // Create an empty session object
    const now = new Date();
    const session: AgentSession = {
      id: sessionId,
      agentId,
      messages: [],
      currentTaskId: sessionId,
      createdAt: now,
      updatedAt: now,
    };

    // Update cache and notify
    this.notifySessionUpdate(agentId, sessionId, session);

    return session;
  }

  /**
   * Send message to session
   */
  async sendMessage(agentId: string, sessionId: string, messageText: string): Promise<schema.JSONRPCResponse> {
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
        id: sessionId, // Session ID is task ID
        message,
      },
    };

    // Send request
    const response = await server.handleRequest(request);

    // On successful request, get latest session status and update
    if (response.result && !response.error) {
      const taskData = await this.getSessionWithHistory(agentId, sessionId);
      if (taskData) {
        const session = this.convertSessionToAgentSession(agentId, taskData.task, taskData.history);
        this.notifySessionUpdate(agentId, sessionId, session);
      }
    }

    return response;
  }

  /**
   * Stream message to session
   */
  handleStreamingRequest(agentId: string, sessionId: string, messageText: string): Observable<schema.TaskStatusUpdateEvent | schema.TaskArtifactUpdateEvent> {
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
              id: sessionId, // Session ID is task ID
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
              const sessionData = await this.getSessionWithHistory(agentId, sessionId);
              if (sessionData) {
                const session = this.convertSessionToAgentSession(agentId, sessionData.task, sessionData.history);
                console.log(`[Agent Service] Updated session:`, session); // Add log
                this.notifySessionUpdate(agentId, sessionId, session);
              }
            }

            // If final event, complete stream
            if (event.final) {
              console.log(`[Agent Service] Final event received`); // Add log
              // Get complete session status once
              const sessionData = await this.getSessionWithHistory(agentId, sessionId);
              if (sessionData) {
                console.log(`[Agent Service] Final session history:`, sessionData.history); // Add log
                const session = this.convertSessionToAgentSession(agentId, sessionData.task, sessionData.history);
                this.notifySessionUpdate(agentId, sessionId, session);
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
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<AgentSession | undefined> {
    await this.ensureAgentsRegistered();
    
    // Traverse all agent servers to find matching session
    for (const [agentId, server] of this.agentServers.entries()) {
      try {
        const sessionData = await this.getSessionWithHistory(agentId, sessionId);
        if (sessionData) {
          // Found matching session, convert and return
          return this.convertSessionToAgentSession(agentId, sessionData.task, sessionData.history);
        }
      } catch (error) {
        // Continue to next agent
      }
    }
    return undefined;
  }

  /**
   * Get all sessions for an agent
   */
  async getAgentSessions(agentId: string): Promise<AgentSession[]> {
    await this.ensureAgentsRegistered();
    
    try {
      const server = await this.getOrCreateAgentServer(agentId);

      // Get all tasks (each task is a session)
      const tasks = await server.getAllTasks();

      // Convert to session objects
      const sessions: AgentSession[] = [];

      for (const task of tasks) {
        const taskData = await this.getSessionWithHistory(agentId, task.id);
        if (!taskData) continue;

        const session = this.convertSessionToAgentSession(agentId, taskData.task, taskData.history);
        sessions.push(session);
      }

      return sessions;
    } catch (error) {
      logger.error(`Failed to get sessions for agent ${agentId}:`, error);
      return [];
    }
  }

  /**
   * Delete session
   */
  async deleteSession(agentId: string, sessionId: string): Promise<void> {
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
          id: sessionId,
        },
      };
      await server.handleRequest(cancelRequest);

      // Then delete session record from database
      const deleted = await server.deleteSession(sessionId);
      logger.info(`Deleted session ${sessionId} from database: ${deleted}`);

      // Notify frontend about session deletion
      this.notifySessionUpdate(agentId, sessionId, null);
    } catch (error) {
      logger.error(`Failed to delete session ${sessionId}:`, error);
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
}
