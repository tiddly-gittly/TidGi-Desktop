import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
}

interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  stream?: boolean;
}

interface Rule {
  response: string;
  stream?: boolean;
}

export class MockOpenAIServer {
  private server: Server | null = null;
  public port = 0;
  public baseUrl = '';
  private rules: Rule[] = [];
  private callCount = 0; // Track total API calls

  constructor(private fixedPort?: number, rules?: Rule[]) {
    if (rules && Array.isArray(rules)) this.rules = rules;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((request: IncomingMessage, response: ServerResponse) => {
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (request.method === 'OPTIONS') {
          if (!response.writableEnded && !response.headersSent) {
            response.writeHead(200);
            response.end();
          }
          return;
        }

        try {
          const url = new URL(request.url || '', `http://127.0.0.1:${this.port}`);

          if (request.method === 'GET' && url.pathname === '/health') {
            if (!response.writableEnded && !response.headersSent) {
              response.writeHead(200, { 'Content-Type': 'application/json' });
              response.end(JSON.stringify({ status: 'ok' }));
            }
            return;
          }

          if (request.method === 'POST' && url.pathname === '/v1/chat/completions') {
            void this.handleChatCompletions(request, response);
            return;
          }

          if (request.method === 'POST' && url.pathname === '/reset') {
            // Reset call count for testing
            this.callCount = 0;
            if (!response.writableEnded && !response.headersSent) {
              response.writeHead(200, { 'Content-Type': 'application/json' });
              response.end(JSON.stringify({ success: true, message: 'Call count reset' }));
            }
            return;
          }

          if (!response.writableEnded && !response.headersSent) {
            response.writeHead(404, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ error: 'Not found' }));
          }
        } catch {
          if (!response.writableEnded && !response.headersSent) {
            response.writeHead(400, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ error: 'Bad request' }));
          }
        }
      });

      this.server.on('error', (error) => {
        reject(new Error(String(error)));
      });

      this.server.on('listening', () => {
        const addr = this.server!.address() as AddressInfo;
        this.port = addr.port;
        this.baseUrl = `http://127.0.0.1:${this.port}`;
        resolve();
      });

      try {
        this.server.listen(this.fixedPort || 0, '127.0.0.1');
      } catch (error) {
        reject(new Error(String(error)));
      }
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    return new Promise((resolve) => {
      this.server!.close(() => {
        this.server = null;
        resolve();
      });
    });
  }

  private async handleChatCompletions(request: IncomingMessage, response: ServerResponse) {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    request.on('end', () => {
      try {
        // Parse request and handle each request based on provided rules
        const chatRequest = JSON.parse(body) as ChatRequest;

        // Debug log: incoming request summary
        try {
          const summary = chatRequest.messages.map((m) => `${m.role}:${String(m.content)}`).join(' || ');
          console.log('[mockOpenAI] Received chat request:', { model: chatRequest.model, stream: chatRequest.stream, summary });
        } catch {
          console.log('[mockOpenAI] Received chat request (unable to stringify messages)');
        }

        if (chatRequest.stream) {
          this.handleStreamingChatCompletions(chatRequest, response);
          return;
        }

        const resp = this.generateChatCompletionResponse(chatRequest);
        if (!response.writableEnded && !response.headersSent) {
          response.setHeader('Content-Type', 'application/json');
          response.writeHead(200);
          response.end(JSON.stringify(resp));
        }
      } catch {
        if (!response.writableEnded && !response.headersSent) {
          response.writeHead(400, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      }
    });
  }

  private generateChatCompletionResponse(chatRequest: ChatRequest) {
    const modelName = chatRequest.model || 'test-model';
    
    // Increment call count for each API request
    this.callCount++;
    
    console.log('[mockOpenAI] generateChatCompletionResponse');
    console.log('  - model:', modelName);
    console.log('  - callCount:', this.callCount);
    console.log('  - total messages:', chatRequest.messages.length);
    console.log(
      '  - message types:',
      chatRequest.messages.map(m => `${m.role}:${String(m.content).includes('<functions_result>') ? 'FUNCTIONS_RESULT' : (String(m.content).substring(0, 30) + '...')}`),
    );

    // Use call count to determine which response to return (1-indexed)
    const ruleIndex = this.callCount - 1;
    const responseRule = this.rules[ruleIndex];
    
    if (!responseRule) {
      console.log('[mockOpenAI] No more responses available for call', this.callCount);
      return {
        id: 'chatcmpl-test-' + Date.now().toString(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: modelName,
        choices: [],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };
    }

    console.log('[mockOpenAI] Using rule for call', this.callCount, ':', responseRule.response.substring(0, 100) + '...');

    return {
      id: 'chatcmpl-test-' + Date.now().toString(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: modelName,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: responseRule.response,
          },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  }

  private handleStreamingChatCompletions(chatRequest: ChatRequest, response: ServerResponse) {
    if (response.writableEnded) return;

    const modelName = chatRequest.model || 'test-model';
    
    // Increment call count for streaming requests too
    this.callCount++;
    
    // Use call count to determine which response to return (1-indexed)
    const ruleIndex = this.callCount - 1;
    const responseRule = this.rules[ruleIndex];

    console.log('[mockOpenAI] handleStreamingChatCompletions - model=', modelName, 'callCount=', this.callCount, 'matched=', responseRule ? 'yes' : 'no');

    // If matched: honor client's stream request. If client requests stream, always stream the matched.response.
    if (responseRule && chatRequest.stream) {
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.setHeader('Cache-Control', 'no-cache');
      response.setHeader('Connection', 'keep-alive');
      response.writeHead(200);

      // Send first chunk with role
      const roleChunk = {
        id: 'chatcmpl-test-' + Date.now().toString(),
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: modelName,
        choices: [
          {
            index: 0,
            delta: { role: 'assistant' },
            finish_reason: null,
          },
        ],
      };

      // Send content chunk
      const contentChunk = {
        id: 'chatcmpl-test-' + Date.now().toString(),
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: modelName,
        choices: [
          {
            index: 0,
            delta: { content: responseRule.response },
            finish_reason: null,
          },
        ],
      };

      // Send final chunk
      const finalChunk = {
        id: 'chatcmpl-test-' + Date.now().toString(),
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

      const roleLine = `data: ${JSON.stringify(roleChunk)}\n\n`;
      const contentLine = `data: ${JSON.stringify(contentChunk)}\n\n`;
      const finalLine = `data: ${JSON.stringify(finalChunk)}\n\n`;
      
      console.log('[mockOpenAI] Sending streaming chunks:', {
        responseContent: responseRule.response,
        role: roleLine.substring(0, 100) + '...',
        content: contentLine.substring(0, 200) + '...',
        final: finalLine.substring(0, 100) + '...',
      });
      
      response.write(roleLine);
      response.write(contentLine);
      response.write(finalLine);
      response.write('data: [DONE]\n\n');
      console.log('[mockOpenAI] stream finished for call=', this.callCount);
      response.end();
      return;
    }

    // If matched but client did not request stream, return a regular JSON chat completion
    if (responseRule && !chatRequest.stream) {
      console.log('[mockOpenAI] Using non-stream rule for call', this.callCount, ':', responseRule.response.substring(0, 100) + '...');
      const resp = {
        id: 'chatcmpl-test-' + Date.now().toString(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: modelName,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: responseRule.response,
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };
      
      if (!response.writableEnded) {
        response.setHeader('Content-Type', 'application/json');
        response.writeHead(200);
        response.end(JSON.stringify(resp));
      }
      return;
    }

    // Default for unmatched stream requests: send only DONE so client can close stream without producing assistant content
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.writeHead(200);
    response.write('data: [DONE]\n\n');
    response.end();
  }
}

