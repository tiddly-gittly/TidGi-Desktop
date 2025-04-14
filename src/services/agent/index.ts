/* eslint-disable @typescript-eslint/require-await */
import { injectable } from 'inversify';
import { nanoid } from 'nanoid';
import { BehaviorSubject, Observable } from 'rxjs';

import { lazyInject } from '@services/container';
import { IDatabaseService } from '@services/database/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWikiService } from '@services/wiki/interface';
import type { Agent, AgentServiceConfig, AgentSession, IAgentService } from './interface';
import { AgentHttpServer } from './server/http-server';
import * as schema from './server/schema';
import { A2AServer } from './server/server';
import { InMemoryTaskStore } from './server/store';
import { TaskYieldUpdate } from './server';

@injectable()
export class AgentService implements IAgentService {
  @lazyInject(serviceIdentifier.Database)
  private readonly databaseService!: IDatabaseService;

  @lazyInject(serviceIdentifier.Wiki)
  private readonly wikiService!: IWikiService;

  // 存储所有智能体
  private agents: Map<string, Agent> = new Map();

  // 存储所有智能体服务器实例
  private agentServers: Map<string, A2AServer> = new Map();

  // HTTP服务器实例
  private httpServer: AgentHttpServer | null = null;

  // 会话更新流 - 只会发送已更新的会话
  public sessionUpdates$ = new BehaviorSubject<Record<string, AgentSession>>({});

  constructor() {
    // 初始化智能体
    this.registerDefaultAgents();
  }

  /**
   * 注册默认智能体
   */
  private registerDefaultAgents(): void {
    try {
      // 打印注册信息
      console.log('Registering default agents');

      // 示例：注册一个简单的回显智能体
      const echoAgent: Agent = {
        id: 'echo-agent',
        name: 'Echo Agent',
        description: '简单的回显智能体，将发送的消息返回给用户',
        avatarUrl: 'https://example.com/echo-agent.png',
        handler: this.createEchoHandler(),
        card: {
          name: 'Echo Agent',
          description: '简单的回显智能体',
          url: 'http://localhost:41241/echo-agent',
          version: '1.0.0',
          capabilities: {
            streaming: true,
          },
          skills: [
            {
              id: 'echo',
              name: 'Echo',
              description: '回显用户输入',
            },
          ],
        },
      };

      this.agents.set(echoAgent.id, echoAgent);
      this.createAgentServer(echoAgent);

      console.log('Registered default agent:', echoAgent.id);
    } catch (error) {
      console.error('Error registering default agents:', error);
    }
  }

  /**
   * 创建回显处理器
   */
  private createEchoHandler() {
    return async function* echoHandler(context: any) {
      // DEBUG: console
      console.log(`echoHandler`);
      // 先发送工作中状态
      yield {
        state: 'working',
        message: {
          role: 'agent',
          parts: [{ text: 'Processing your message...' }],
        },
      } as TaskYieldUpdate;

      // 等待一会儿模拟处理
      await new Promise(resolve => setTimeout(resolve, 1000));
// DEBUG: console context
console.log(`context`, context);
      // 检查是否取消
      if (context.isCancelled()) {
        yield { state: 'canceled' } as TaskYieldUpdate;
        return;
      }
// DEBUG: console context.userMessage.parts
console.log(`context.userMessage.parts`, context.userMessage.parts);
      // 获取用户消息文本
      const userText = context.userMessage.parts
        .filter((part: any) => part.text)
        .map((part: any) => part.text)
        .join(' ');
        // DEBUG: console userText
        console.log(`userText`, userText);

      // 回显用户消息
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
   * 为智能体创建一个服务器实例
   */
  private createAgentServer(agent: Agent): A2AServer {
    // 检查是否已经存在此智能体的服务器
    if (this.agentServers.has(agent.id)) {
      return this.agentServers.get(agent.id)!;
    }

    // 创建任务存储
    const taskStore = new InMemoryTaskStore();

    // 创建A2A服务器实例
    const server = new A2AServer(agent.handler, {
      taskStore,
      card: agent.card,
    });

    // 存储服务器实例
    this.agentServers.set(agent.id, server);
    
    console.log(`Created A2A server for agent: ${agent.id}`);
    return server;
  }

  /**
   * 通知会话更新（只更新指定会话）
   */
  private notifySessionUpdate(agentId: string, sessionId: string, session: AgentSession | null): void {
    if (session === null) {
      // 发送删除会话通知
      this.sessionUpdates$.next({ [sessionId]: null as any });
    } else {
      // 发送会话更新通知
      this.sessionUpdates$.next({ [sessionId]: session });
    }
  }

  /**
   * 将A2A任务转换为会话对象
   */
  private convertTaskToSession(agentId: string, task: schema.Task, history: schema.Message[]): AgentSession {
    const timestamp = task.status.timestamp
      ? new Date(task.status.timestamp)
      : new Date();

    return {
      id: task.id,
      agentId,
      messages: history || [],
      currentTaskId: task.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  /**
   * 获取任务及其历史记录
   */
  private async getTaskWithHistory(agentId: string, taskId: string): Promise<{ task: schema.Task; history: schema.Message[] } | null> {
    try {
      const server = this.getOrCreateAgentServer(agentId);

      // 请求获取任务
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

      // 获取历史记录 - 使用服务器的方法获取完整历史
      let history: schema.Message[] = [];
      
      try {
        // 直接从A2A服务器获取
        history = await server.getTaskHistory(taskId);
        
        // 如果历史为空但有当前消息，确保至少包含当前消息
        if (history.length === 0 && task.status.message) {
          history.push(task.status.message);
        }
      } catch (historyError) {
        console.error(`Failed to get history for task ${taskId}:`, historyError);
        // 回退方案：至少捕获当前状态消息
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

  // 实现IAgentService接口

  async getAgents(): Promise<Omit<Agent, 'handler'>[]> {
    // 返回不含handler的Agent对象列表，确保可以通过IPC传输
    return Array.from(this.agents.values()).map(agent => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      avatarUrl: agent.avatarUrl,
      card: agent.card,
      // 不包含handler属性，因为函数不能通过IPC传输
    }));
  }

  async getAgent(id: string): Promise<Agent | undefined> {
    return this.agents.get(id);
  }

  /**
   * 创建新会话
   */
  async createSession(agentId: string): Promise<AgentSession> {
    if (!this.agents.has(agentId)) {
      throw new Error(`Agent with ID ${agentId} not found`);
    }

    // 生成会话ID（同时也是任务ID）
    const sessionId = nanoid();

    // 创建一个空会话对象
    const now = new Date();
    const session: AgentSession = {
      id: sessionId,
      agentId,
      messages: [],
      currentTaskId: sessionId,
      createdAt: now,
      updatedAt: now,
    };

    // 更新缓存并通知
    this.notifySessionUpdate(agentId, sessionId, session);

    return session;
  }

  /**
   * 发送消息到会话
   */
  async sendMessage(agentId: string, sessionId: string, messageText: string): Promise<schema.JSONRPCResponse> {
    // 获取服务器实例
    const server = this.getOrCreateAgentServer(agentId);

    // 创建消息对象
    const message: schema.Message = {
      role: 'user',
      parts: [{ text: messageText }],
    };

    // 构建A2A请求
    const request: schema.SendTaskRequest = {
      jsonrpc: '2.0',
      id: nanoid(),
      method: 'tasks/send',
      params: {
        id: sessionId, // 会话ID即任务ID
        message,
      },
    };

    // 发送请求
    const response = await server.handleRequest(request);

    // 请求成功时，获取最新会话状态并更新
    if (response.result && !response.error) {
      const taskData = await this.getTaskWithHistory(agentId, sessionId);
      if (taskData) {
        const session = this.convertTaskToSession(agentId, taskData.task, taskData.history);
        this.notifySessionUpdate(agentId, sessionId, session);
      }
    }

    return response;
  }

  /**
   * 流式发送消息到会话
   */
  handleStreamingRequest(agentId: string, sessionId: string, messageText: string): Observable<schema.TaskStatusUpdateEvent | schema.TaskArtifactUpdateEvent> {
    // 获取服务器实例
    const server = this.getOrCreateAgentServer(agentId);

    // 创建消息对象
    const message: schema.Message = {
      role: 'user',
      parts: [{ text: messageText }],
    };

    // 构建A2A流式请求
    const request: schema.SendTaskStreamingRequest = {
      jsonrpc: '2.0',
      id: nanoid(),
      method: 'tasks/sendSubscribe',
      params: {
        id: sessionId, // 会话ID即任务ID
        message,
      },
    };

    // 创建观察者
    return new Observable<schema.TaskStatusUpdateEvent | schema.TaskArtifactUpdateEvent>(subscriber => {
      // 调用服务器的流式处理方法
      const eventEmitter = server.handleStreamingRequest(request);

      // 订阅事件流
      eventEmitter.on('update', async (event: schema.TaskStatusUpdateEvent | schema.TaskArtifactUpdateEvent) => {
        console.log(`[Agent Service] Received event:`, event); // 添加日志
        subscriber.next(event);

        // 如果更新包含消息，刷新会话
        if ('status' in event && event.status.message) {
          console.log(`[Agent Service] Event contains message:`, event.status.message); // 添加日志
          const taskData = await this.getTaskWithHistory(agentId, sessionId);
          if (taskData) {
            const session = this.convertTaskToSession(agentId, taskData.task, taskData.history);
            console.log(`[Agent Service] Updated session:`, session); // 添加日志
            this.notifySessionUpdate(agentId, sessionId, session);
          }
        }

        // 如果是最终事件，完成流
        if (event.final) {
          console.log(`[Agent Service] Final event received`); // 添加日志
          // 一次性获取完整会话状态
          const taskData = await this.getTaskWithHistory(agentId, sessionId);
          if (taskData) {
            console.log(`[Agent Service] Final session history:`, taskData.history); // 添加日志
            const session = this.convertTaskToSession(agentId, taskData.task, taskData.history);
            this.notifySessionUpdate(agentId, sessionId, session);
          }
          subscriber.complete();
        }
      });

      eventEmitter.on('error', (error: Error) => {
        subscriber.error(error);
      });

      // 返回清理函数
      return () => {
        eventEmitter.removeAllListeners();
      };
    });
  }

  /**
   * 获取或创建智能体服务器实例
   */
  private getOrCreateAgentServer(agentId: string): A2AServer {
    if (!this.agents.has(agentId)) {
      throw new Error(`Agent with ID ${agentId} not found`);
    }

    if (!this.agentServers.has(agentId)) {
      this.createAgentServer(this.agents.get(agentId)!);
    }

    return this.agentServers.get(agentId)!;
  }

  /**
   * 获取指定会话
   */
  async getSession(sessionId: string): Promise<AgentSession | undefined> {
    // 遍历所有智能体服务器，查找匹配的会话
    for (const [agentId, server] of this.agentServers.entries()) {
      try {
        const taskData = await this.getTaskWithHistory(agentId, sessionId);
        if (taskData) {
          // 找到匹配的会话，转换并返回
          return this.convertTaskToSession(agentId, taskData.task, taskData.history);
        }
      } catch (error) {
        // 继续查找下一个智能体
      }
    }
    return undefined;
  }

  /**
   * 获取智能体的所有会话 - 按需加载
   */
  async getAgentSessions(agentId: string): Promise<AgentSession[]> {
    const server = this.getOrCreateAgentServer(agentId);

    try {
      // 获取所有任务（每个任务即一个会话）
      const tasks = await server.getAllTasks();

      // 转换为会话对象
      const sessions: AgentSession[] = [];

      for (const task of tasks) {
        const taskData = await this.getTaskWithHistory(agentId, task.id);
        if (!taskData) continue;

        const session = this.convertTaskToSession(agentId, taskData.task, taskData.history);
        sessions.push(session);
      }

      return sessions;
    } catch (error) {
      logger.error(`Failed to get sessions for agent ${agentId}:`, error);
      return [];
    }
  }

  /**
   * 删除会话
   */
  async deleteSession(agentId: string, sessionId: string): Promise<void> {
    try {
      // 获取服务器实例
      const server = this.getOrCreateAgentServer(agentId);

      // 构建请求
      const request: schema.CancelTaskRequest = {
        jsonrpc: '2.0',
        id: nanoid(),
        method: 'tasks/cancel',
        params: {
          id: sessionId, // 会话ID即任务ID
        },
      };

      // 尝试取消任务（如果正在运行）
      await server.handleRequest(request);

      // 通知删除
      this.notifySessionUpdate(agentId, sessionId, null);

      // 注意：A2A协议本身不支持删除任务，这里只是通知前端删除
      // 真正从存储中删除任务可能需要扩展A2A服务器实现
    } catch (error) {
      logger.error(`Failed to delete session ${sessionId}:`, error);
    }
  }

  async startHttpServer(config: AgentServiceConfig): Promise<void> {
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
