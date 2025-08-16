import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
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
  tools?: any[];
}

export class MockOpenAIServer {
  private server: Server | null = null;
  public port: number = 0;
  public baseUrl: string = '';

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        // Parse request URL
        const url = new URL(req.url!, `http://localhost:${this.port}`);
        
        if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
          this.handleChatCompletions(req, res);
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      });

      this.server.listen(0, 'localhost', () => {
        const address = this.server!.address() as AddressInfo;
        this.port = address.port;
        this.baseUrl = `http://localhost:${this.port}`;
        console.log(`Mock OpenAI server started at ${this.baseUrl}`);
        resolve();
      });

      this.server.on('error', (error) => {
        console.error('Mock OpenAI server error:', error);
        reject(error);
      });
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
        const chatResponse = this.generateChatCompletionResponse(chatRequest);

        response.setHeader('Content-Type', 'application/json');
        response.writeHead(200);
        response.end(JSON.stringify(chatResponse));
      } catch (_error) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  }

  private generateChatCompletionResponse(chatRequest: ChatRequest): any {
    const lastMessage = chatRequest.messages[chatRequest.messages.length - 1];
    const userMessage = lastMessage?.content || '';

    // Check if this is a wiki search request
    if (userMessage.includes('搜索 wiki 中的 index 条目并解释')) {
      return {
        id: 'chatcmpl-test-' + Date.now(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'gpt-3.5-turbo',
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
                      filter: '[title[Index]]'
                    })
                  }
                }
              ]
            },
            finish_reason: 'tool_calls'
          }
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 25,
          total_tokens: 75
        }
      };
    }

    // Check if this is a tool result response
    if (chatRequest.messages.some((msg: ChatMessage) => msg.role === 'tool')) {
      return {
        id: 'chatcmpl-test-' + Date.now(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'gpt-3.5-turbo',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '在 TiddlyWiki 中，`Index` 条目提供了编辑卡片的方法说明，点击右上角的编辑按钮可以开始对当前卡片进行编辑。此外，它还引导您访问中文教程页面 [[教程 (Chinese)|https://tw-cn.netlify.app/]] 和官方英文站点 [[Official Site (English)|https://tiddlywiki.com/]] 以获取更多信息。'
            },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 80,
          total_tokens: 280
        }
      };
    }

    // Default response
    return {
      id: 'chatcmpl-test-' + Date.now(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'gpt-3.5-turbo',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: '这是一个测试响应。'
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15
      }
    };
  }
}
