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
   * 处理A2A API请求
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
          const request = JSON.parse(body) as schema.JSONRPCRequest;

          // 检查是否是流式请求
          if (request.method === 'tasks/sendSubscribe') {
            await this.handleStreamingRequest(
              res,
              agentId,
              request as schema.SendTaskStreamingRequest,
            );
          } else {
            // 处理常规请求
            const response = await this.options.agentService.handleRequest(agentId, request);

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
   * 处理流式请求（SSE）
   */
  private async handleStreamingRequest(
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
      const stream = this.options.agentService.handleStreamingRequest(agentId, request);

      // 订阅流
      const subscription = stream.subscribe({
        next: (event) => {
          const response = {
            jsonrpc: '2.0',
            id: request.id,
            result: event,
          };
          res.write(`data: ${JSON.stringify(response)}\n\n`);

          // 如果是最终事件，结束连接
          if (event.final) {
            res.end();
          }
        },
        error: (error) => {
          console.error('Error in stream:', error);
          const errorResponse = {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32603,
              message: error instanceof Error ? error.message : 'Stream error',
            },
          };
          res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
          res.end();
        },
        complete: () => {
          // 流完成
          res.end();
        },
      });

      // 当连接关闭时取消订阅
      req.on('close', () => {
        subscription.unsubscribe();
      });
    } catch (error) {
      console.error('Error setting up stream:', error);
      const errorResponse = {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Stream error',
        },
      };
      res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
      res.end();
    }
  }
}
