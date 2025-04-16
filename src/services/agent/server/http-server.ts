import * as http from 'http';
import { URL } from 'url';
import { IAgentService } from '../interface';
import * as schema from './schema';

interface AgentHttpServerOptions {
  port: number;
  basePath: string;
  agentService: IAgentService;
}

/**
 * 基于Node.js原生HTTP模块的A2A HTTP服务器
 * 这个文件是唯一需要保留兼容性函数的地方，因为它处理的是对外的通信
 */
export class AgentHttpServer {
  private server: http.Server | null = null;
  private options: AgentHttpServerOptions;

  constructor(options: AgentHttpServerOptions) {
    this.options = options;
  }

  /**
   * 启动HTTP服务器
   */
  async start(): Promise<void> {
    if (this.server) {
      await this.stop();
    }

    this.server = http.createServer(this.requestHandler.bind(this));

    return new Promise((resolve, reject) => {
      try {
        this.server!.listen(this.options.port, () => {
          console.log(`A2A HTTP Server started on port ${this.options.port}`);
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 停止HTTP服务器
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((error) => {
        if (error) {
          reject(error);
        } else {
          this.server = null;
          console.log('A2A HTTP Server stopped');
          resolve();
        }
      });
    });
  }

  /**
   * 设置CORS头
   */
  private setCorsHeaders(res: http.ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Accept',
    );
  }

  /**
   * 处理HTTP请求
   */
  private async requestHandler(request: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // 设置CORS头
    this.setCorsHeaders(res);

    // 处理OPTIONS请求（预检请求）
    if (request.method === 'OPTIONS') {
      res.statusCode = 204; // No Content
      res.end();
      return;
    }

    // 解析URL
    const url = new URL(request.url || '/', `http://${request.headers.host}`);
    const pathname = url.pathname;

    // 处理agent.json请求
    if (pathname.endsWith('/.well-known/agent.json')) {
      const agentId = this.extractAgentIdFromPath(pathname);
      await this.handleAgentCardRequest(agentId, res);
      return;
    }

    // 只处理POST请求和指定路径
    if (request.method !== 'POST') {
      res.statusCode = 405; // Method Not Allowed
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    // 处理A2A请求
    const agentId = this.extractAgentIdFromPath(pathname);
    await this.handleA2ARequest(request, res, agentId);
  }

  /**
   * 从路径中提取智能体ID
   */
  private extractAgentIdFromPath(pathname: string): string {
    // 移除基础路径前缀和尾部斜杠
    let path = pathname;
    if (this.options.basePath !== '/' && path.startsWith(this.options.basePath)) {
      path = path.substring(this.options.basePath.length);
    }

    // 移除开始的斜杠
    path = path.replace(/^\/+/, '');

    // 提取第一段作为智能体ID
    const parts = path.split('/');
    return parts[0] || '';
  }

  /**
   * 处理智能体卡片请求
   */
  private async handleAgentCardRequest(agentId: string, res: http.ServerResponse): Promise<void> {
    try {
      const agent = await this.options.agentService.getAgent(agentId);

      if (!agent || !agent.card) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Agent not found' }));
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(agent.card));
    } catch (error) {
      console.error('Error handling agent card request:', error);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  /**
   * 处理A2A API请求 - 这里需要保持A2A协议命名，以便与外部系统兼容
   */
  private async handleA2ARequest(request: http.IncomingMessage, res: http.ServerResponse, agentId: string): Promise<void> {
    // 检查智能体是否存在
    try {
      const agent = await this.options.agentService.getAgent(agentId);
      if (!agent) {
        res.statusCode = 404;
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32001, message: `Agent ${agentId} not found` },
          id: null,
        }));
        return;
      }

      // 读取请求体
      let body = '';
      request.on('data', (chunk) => {
        body += chunk.toString();
      });

      request.on('end', async () => {
        try {
          // 解析JSON-RPC请求
          const jsonRpcRequest = JSON.parse(body) as schema.JSONRPCRequest;

          // 检查是否是流式请求
          if (jsonRpcRequest.method === 'tasks/sendSubscribe') {
            await this.handleStreamingSession(
              res,
              agentId,
              jsonRpcRequest as schema.SendTaskStreamingRequest,
            );
          } else {
            // 在这里我们将会话概念转换为A2A协议中的任务概念
            const response = await this.convertSessionRequestToTaskRequest(
              agentId, 
              jsonRpcRequest
            );

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(response));
          }
        } catch (error) {
          console.error('Error handling A2A request:', error);
          res.statusCode = 200; // 注意：JSON-RPC错误仍返回200，错误在响应体内
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: error instanceof Error ? error.message : 'Internal error',
            },
            id: null, // 我们可能无法确定原始请求的ID
          }));
        }
      });
    } catch (error) {
      console.error('Error processing request:', error);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  /**
   * 将内部会话请求转换为A2A协议中的任务请求
   * 这个函数只存在于http-server.ts中，用于协议兼容
   */
  private async convertSessionRequestToTaskRequest(
    agentId: string, 
    request: schema.JSONRPCRequest
  ): Promise<schema.JSONRPCResponse> {
    // 处理不同类型的请求
    switch (request.method) {
      case 'tasks/send':
        return this.options.agentService.sendMessage(
          agentId,
          (request as schema.SendTaskRequest).params.id,
          (request as schema.SendTaskRequest).params.message.parts[0].text
        );
      
      case 'tasks/get':
        const task = await this.options.agentService.getTask(
          (request as schema.GetTaskRequest).params.id
        );
        
        if (!task) {
          return {
            jsonrpc: '2.0',
            id: request.id || null,
            error: {
              code: -32001,
              message: `Task not found: ${(request as schema.GetTaskRequest).params.id}`
            }
          };
        }
        
        // 将任务转换为A2A格式返回
        return {
          jsonrpc: '2.0',
          id: request.id || null,
          result: this.convertAgentTaskToA2ATask(task)
        };
        
      case 'tasks/cancel':
        await this.options.agentService.deleteTask(
          agentId,
          (request as schema.CancelTaskRequest).params.id
        );
        return {
          jsonrpc: '2.0',
          id: request.id || null,
          result: { 
            id: (request as schema.CancelTaskRequest).params.id,
            status: { 
              state: 'canceled', 
              timestamp: new Date().toISOString() 
            }
          }
        };
        
      default:
        return {
          jsonrpc: '2.0',
          id: request.id || null,
          error: {
            code: -32601,
            message: `Method not found: ${request.method}`
          }
        };
    }
  }

  /**
   * 将AgentTask转换为A2A协议中的Task
   */
  private convertAgentTaskToA2ATask(task: any): schema.Task {
    const lastAgentMessage = task.messages
      .filter((m: any) => m.role === 'agent')
      .pop();
    
    return {
      id: task.id,
      sessionId: task.id,
      status: {
        state: lastAgentMessage ? 'completed' : 'submitted',
        timestamp: task.updatedAt.toISOString(),
        message: lastAgentMessage
      },
      artifacts: task.artifacts || [],
      metadata: task.metadata || {}
    };
  }

  /**
   * 将AgentSession转换为A2A协议中的Task
   * 这个函数只存在于http-server.ts中，用于协议兼容
   */
  private convertAgentSessionToA2ATask(session: any): schema.Task {
    const lastAgentMessage = session.messages
      .filter((m: any) => m.role === 'agent')
      .pop();
    
    return {
      id: session.id,
      sessionId: session.id,
      status: {
        state: lastAgentMessage ? 'completed' : 'submitted',
        timestamp: session.updatedAt.toISOString(),
        message: lastAgentMessage
      },
      artifacts: [],
      metadata: {}
    };
  }

  /**
   * 处理流式会话
   */
  private async handleStreamingSession(
    res: http.ServerResponse,
    agentId: string,
    request: schema.SendTaskStreamingRequest,
  ): Promise<void> {
    // 设置SSE响应头
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      // 获取流式响应
      const stream = this.options.agentService.handleStreamingRequest(
        agentId,
        request.params.id,
        request.params.message.parts[0].text
      );

      // 创建订阅
      const subscription = stream.subscribe({
        next: (event) => {
          // 将事件转换为SSE格式并发送
          const eventData = JSON.stringify({
            jsonrpc: '2.0',
            id: request.id,
            result: event
          });
          res.write(`data: ${eventData}\n\n`);

          // 如果是最终事件，结束连接
          if (event.final) {
            res.end();
          }
        },
        error: (error) => {
          console.error('Error in stream:', error);
          // 发送错误事件
          const errorData = JSON.stringify({
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32603,
              message: error instanceof Error ? error.message : 'Stream error'
            }
          });
          res.write(`data: ${errorData}\n\n`);
          res.end();
        },
        complete: () => {
          // 流完成
          res.end();
        }
      });

      // 当请求关闭时取消订阅
      request.on('close', () => {
        subscription.unsubscribe();
      });
    } catch (error) {
      console.error('Error setting up stream:', error);
      const errorData = JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Stream error'
        }
      });
      res.write(`data: ${errorData}\n\n`);
      res.end();
    }
  }
}
