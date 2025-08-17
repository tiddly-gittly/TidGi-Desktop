import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  tools?: unknown[];
  stream?: boolean; // Add support for streaming
}

interface ChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class MockOpenAIServer {
  private server: Server | null = null;
  public port: number = 0;
  public baseUrl: string = '';

  constructor(private fixedPort?: number) {}

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((request, response) => {
        console.log(`${request.method} ${request.url}`); // 添加请求日志

        // Enable CORS
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (request.method === 'OPTIONS') {
          response.writeHead(200);
          response.end();
          return;
        }

        // Add a health check endpoint
        if (request.method === 'GET' && request.url === '/health') {
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ status: 'ok', message: 'Mock OpenAI server is running' }));
          return;
        }

        // Parse request URL safely
        try {
          const url = new URL(request.url!, `http://localhost:${this.port}`);

          if (request.method === 'POST' && url.pathname === '/v1/chat/completions') {
            this.handleChatCompletions(request, response);
          } else {
            response.writeHead(404, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ error: 'Not found', path: request.url }));
          }
        } catch (error) {
          console.error('Error parsing URL:', error);
          response.writeHead(400, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: 'Invalid URL' }));
        }
      });

      // 添加服务器事件监听
      this.server.on('error', (error: Error) => {
        console.error('Mock OpenAI server error:', error);
        reject(new Error(`Server error: ${error.message}`));
      });

      this.server.on('listening', () => {
        const address = this.server!.address() as AddressInfo;
        this.port = address.port;
        this.baseUrl = `http://localhost:${this.port}`;
        console.log(`Mock OpenAI server started at ${this.baseUrl}`);
        console.log(`Health check: ${this.baseUrl}/health`);
        resolve();
      });

      // 尝试监听端口 - 使用固定端口或随机端口
      try {
        const portToUse = this.fixedPort || 0;
        this.server.listen(portToUse, '127.0.0.1'); // 使用 127.0.0.1 而不是 localhost
      } catch (error) {
        console.error('Failed to start server:', error);
        reject(new Error(`Failed to start server: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          console.log('Mock OpenAI server stopped');
          this.server = null;
          resolve();
        });
      });
    }
  }

  private handleChatCompletions(request: IncomingMessage, response: ServerResponse): void {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });

    request.on('end', () => {
      try {
        const chatRequest = JSON.parse(body) as ChatRequest;
        
        // Check if streaming is requested
        if (chatRequest.stream === true) {
          this.handleStreamingChatCompletions(chatRequest, response);
        } else {
          const chatResponse: ChatResponse = this.generateChatCompletionResponse(chatRequest);
          response.setHeader('Content-Type', 'application/json');
          response.writeHead(200);
          response.end(JSON.stringify(chatResponse));
        }
      } catch (error) {
        console.error('Error processing chat completion:', error);
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  }

  private generateChatCompletionResponse(chatRequest: ChatRequest): ChatResponse {
    const lastMessage = chatRequest.messages[chatRequest.messages.length - 1];
    const userMessage = lastMessage?.content || '';

    // Use the requested model name, or fallback to a default
    const modelName = chatRequest.model || 'test-model';

    // Check if this is a wiki search request
    if (userMessage.includes('搜索 wiki 中的 index 条目并解释')) {
      return {
        id: 'chatcmpl-test-' + String(Date.now()),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: modelName,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_test_wiki_search',
                  type: 'function',
                  function: {
                    name: 'wiki-search',
                    arguments: JSON.stringify({
                      workspaceName: '-VPTqPdNOEZHGO5vkwllY',
                      filter: '[title[Index]]',
                    }),
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 25,
          total_tokens: 75,
        },
      };
    }

    // Check if this is a tool result response
    if (chatRequest.messages.some((message: ChatMessage) => message.role === 'tool')) {
      return {
        id: 'chatcmpl-test-' + String(Date.now()),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: modelName,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content:
                '在 TiddlyWiki 中，`Index` 条目提供了编辑卡片的方法说明，点击右上角的编辑按钮可以开始对当前卡片进行编辑。此外，它还引导您访问中文教程页面 [[教程 (Chinese)|https://tw-cn.netlify.app/]] 和官方英文站点 [[Official Site (English)|https://tiddlywiki.com/]] 以获取更多信息。',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 80,
          total_tokens: 280,
        },
      };
    }

    // Default response
    return {
      id: 'chatcmpl-test-' + String(Date.now()),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: modelName,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: '这是一个测试响应。',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    };
  }

  private handleStreamingChatCompletions(chatRequest: ChatRequest, response: ServerResponse): void {
    // Set headers for Server-Sent Events
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.writeHead(200);

    const lastMessage = chatRequest.messages[chatRequest.messages.length - 1];
    const userMessage = lastMessage?.content || '';
    const modelName = chatRequest.model || 'test-model';

    // Check if this is a wiki search request
    if (userMessage.includes('搜索 wiki 中的 index 条目并解释')) {
      // First, send tool call chunk
      const toolCallChunk = {
        id: 'chatcmpl-test-' + String(Date.now()),
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: modelName,
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_test_wiki_search',
                  type: 'function',
                  function: {
                    name: 'wiki-search',
                    arguments: JSON.stringify({
                      workspaceName: '-VPTqPdNOEZHGO5vkwllY',
                      filter: '[title[Index]]',
                    }),
                  },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      };

      response.write(`data: ${JSON.stringify(toolCallChunk)}\n\n`);

      // Send finish chunk after a short delay
      setTimeout(() => {
        const finishChunk = {
          id: 'chatcmpl-test-' + String(Date.now()),
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: modelName,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'tool_calls',
            },
          ],
        };

        response.write(`data: ${JSON.stringify(finishChunk)}\n\n`);
        response.write('data: [DONE]\n\n');
        response.end();
      }, 100);
    } else if (chatRequest.messages.some((message: ChatMessage) => message.role === 'tool')) {
      // Handle tool result response - stream the final answer
      const content = '在 TiddlyWiki 中，`Index` 条目提供了编辑卡片的方法说明，点击右上角的编辑按钮可以开始对当前卡片进行编辑。' +
        '此外，它还引导您访问中文教程页面 [[教程 (Chinese)|https://tw-cn.netlify.app/]] 和官方英文站点 ' +
        '[[Official Site (English)|https://tiddlywiki.com/]] 以获取更多信息。';
      
      // Stream content in chunks
      let sentLength = 0;
      const chunkSize = 10; // Characters per chunk
      
      const sendChunk = () => {
        if (sentLength < content.length) {
          const chunk = content.slice(sentLength, sentLength + chunkSize);
          sentLength += chunkSize;
          
          const streamChunk = {
            id: 'chatcmpl-test-' + String(Date.now()),
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: modelName,
            choices: [
              {
                index: 0,
                delta: {
                  content: chunk,
                },
                finish_reason: null,
              },
            ],
          };

          response.write(`data: ${JSON.stringify(streamChunk)}\n\n`);
          setTimeout(sendChunk, 50); // Send next chunk after 50ms
        } else {
          // Send final chunk
          const finishChunk = {
            id: 'chatcmpl-test-' + String(Date.now()),
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: modelName,
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: 'stop',
              },
            ],
          };

          response.write(`data: ${JSON.stringify(finishChunk)}\n\n`);
          response.write('data: [DONE]\n\n');
          response.end();
        }
      };

      sendChunk();
    } else {
      // Default streaming response
      const content = '这是一个测试响应。';
      
      const streamChunk = {
        id: 'chatcmpl-test-' + String(Date.now()),
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: modelName,
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
              content,
            },
            finish_reason: null,
          },
        ],
      };

      response.write(`data: ${JSON.stringify(streamChunk)}\n\n`);

      setTimeout(() => {
        const finishChunk = {
          id: 'chatcmpl-test-' + String(Date.now()),
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: modelName,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop',
            },
          ],
        };

        response.write(`data: ${JSON.stringify(finishChunk)}\n\n`);
        response.write('data: [DONE]\n\n');
        response.end();
      }, 100);
    }
  }
}
