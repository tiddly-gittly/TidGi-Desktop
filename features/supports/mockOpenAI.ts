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
  embedding?: number[]; // Optional: predefined embedding vector for this response
}

export class MockOpenAIServer {
  private server: Server | null = null;
  public port = 0;
  public baseUrl = '';
  private rules: Rule[] = [];
  private callCount = 0; // Track total API calls (for chat completions)
  private embeddingCallCount = 0; // Track embedding API calls separately
  private lastRequest: ChatRequest | null = null; // Store the most recent request
  private allRequests: ChatRequest[] = []; // Store all requests for debugging

  constructor(private fixedPort?: number, rules?: Rule[]) {
    if (rules && Array.isArray(rules)) this.rules = rules;
  }

  /**
   * Update rules at runtime. This allows tests to reuse a running server
   * and swap the response rules without creating a new server instance.
   */
  public setRules(rules: Rule[]): void {
    if (Array.isArray(rules)) {
      this.rules = rules;
    }
  }

  /**
   * Get the most recent request received by the server
   */
  public getLastRequest(): ChatRequest | null {
    return this.lastRequest;
  }

  /**
   * Get all requests received by the server (for debugging)
   */
  public getAllRequests(): ChatRequest[] {
    return this.allRequests;
  }

  /**
   * Clear all stored requests
   */
  public clearAllRequests(): void {
    this.lastRequest = null;
    this.allRequests = [];
    this.callCount = 0;
    this.embeddingCallCount = 0;
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

          if (request.method === 'POST' && url.pathname === '/v1/embeddings') {
            void this.handleEmbeddings(request, response);
            return;
          }

          if (request.method === 'POST' && url.pathname === '/reset') {
            // Reset call count for testing
            this.callCount = 0;
            this.embeddingCallCount = 0;
            this.lastRequest = null;
            if (!response.writableEnded && !response.headersSent) {
              response.writeHead(200, { 'Content-Type': 'application/json' });
              response.end(JSON.stringify({ success: true, message: 'Call count reset' }));
            }
            return;
          }

          if (request.method === 'GET' && url.pathname === '/last-request') {
            // Return the last received request for testing
            if (!response.writableEnded && !response.headersSent) {
              response.writeHead(200, { 'Content-Type': 'application/json' });
              response.end(JSON.stringify({ lastRequest: this.lastRequest }));
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
      // Force close all connections before closing server
      this.server!.closeAllConnections?.();

      this.server!.close(() => {
        this.server = null;
        resolve();
      });

      // Fallback: force resolve after timeout to prevent hanging
      setTimeout(() => {
        if (this.server) {
          this.server = null;
          resolve();
        }
      }, 1000);
    });
  }

  private async handleEmbeddings(request: IncomingMessage, response: ServerResponse) {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    request.on('end', () => {
      try {
        const embeddingRequest = JSON.parse(body) as { input: string | string[]; model?: string };

        const inputs = Array.isArray(embeddingRequest.input) ? embeddingRequest.input : [embeddingRequest.input];

        // Use embeddingCallCount to get predefined embeddings from rules
        const embeddings = inputs.map((input) => {
          this.embeddingCallCount++;
          const ruleIndex = this.embeddingCallCount - 1;
          const rule = this.rules[ruleIndex];

          // Use predefined embedding from rule (generated by semantic tag in agent.ts)
          if (rule?.embedding && Array.isArray(rule.embedding)) {
            return rule.embedding;
          }

          // For UI-generated embeddings (not from agent chat), return a simple default vector
          // This allows UI operations (like clicking "Generate" button in preferences) to work
          const simpleVector: number[] = new Array<number>(384).fill(0);
          // Add some variation based on input length to make it somewhat unique
          simpleVector[0] = (input.length % 100) / 100;
          return simpleVector;
        });

        const resp = {
          object: 'list',
          data: embeddings.map((embedding, index) => ({
            object: 'embedding',
            embedding,
            index,
          })),
          model: embeddingRequest.model || 'text-embedding-ada-002',
          usage: {
            prompt_tokens: inputs.reduce((sum, input) => sum + input.length, 0),
            total_tokens: inputs.reduce((sum, input) => sum + input.length, 0),
          },
        };

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

  private async handleChatCompletions(request: IncomingMessage, response: ServerResponse) {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    request.on('end', () => {
      try {
        // Parse request and handle each request based on provided rules
        const chatRequest = JSON.parse(body) as ChatRequest;

        // Store the request for testing validation
        this.lastRequest = chatRequest;
        this.allRequests.push(chatRequest);

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

    // Use call count to determine which response to return (1-indexed)
    const ruleIndex = this.callCount - 1;
    const responseRule = this.rules[ruleIndex];
    if (!responseRule) {
      return {
        id: 'chatcmpl-test-' + Date.now().toString(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: modelName,
        choices: [],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };
    }

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

      // Send content chunks. Support multiple chunks separated by '<stream_split>'
      const rawResponse = typeof responseRule.response === 'string'
        ? responseRule.response
        : String(responseRule.response);
      const chunks = rawResponse.split('<stream_split>');

      const roleLine = `data: ${JSON.stringify(roleChunk)}\n\n`;
      response.write(roleLine);

      // Helper to write a chunk line
      const writeChunkLine = (content: string) => {
        const contentChunk = {
          id: 'chatcmpl-test-' + Date.now().toString(),
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: modelName,
          choices: [
            {
              index: 0,
              delta: { content },
              finish_reason: null,
            },
          ],
        };
        const contentLine = `data: ${JSON.stringify(contentChunk)}\n\n`;
        response.write(contentLine);
      };

      // Stream each chunk with a small delay to simulate streaming
      // Chunks separator: '###' is used to denote chunk boundaries in the rule string
      void (async () => {
        for (let index = 0; index < chunks.length; index++) {
          // If client closed connection, stop streaming
          if (response.writableEnded) return;
          writeChunkLine(chunks[index]);
          // Short delay between chunks (simulate pacing).
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Send final empty chunk with finish_reason
        if (!response.writableEnded) {
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
          const finalLine = `data: ${JSON.stringify(finalChunk)}\n\n`;
          response.write(finalLine);
          response.write('data: [DONE]\n\n');
          response.end();
        }
      })();
      return;
    }

    // If matched but client did not request stream, return a regular JSON chat completion
    if (responseRule && !chatRequest.stream) {
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
