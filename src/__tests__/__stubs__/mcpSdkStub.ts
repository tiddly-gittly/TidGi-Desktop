/**
 * Stub for @modelcontextprotocol/sdk — used in Vitest so that the optional
 * MCP SDK dependency doesn't cause import-resolution errors during tests.
 * The real dynamic imports in modelContextProtocol.ts never execute in unit
 * tests because no agent instance actually calls connectAndListTools().
 */
export class Client {
  constructor(_info: unknown, _options: unknown) {
    void _info;
    void _options;
  }

  async connect(_transport: unknown) {}

  async listTools() {
    return { tools: [] };
  }

  async callTool(_parameters: unknown) {
    return { content: [] };
  }

  async close() {}
}

export class StdioClientTransport {
  readonly command: unknown;
  constructor(_options: unknown) {
    this.command = _options;
  }
}

export class SSEClientTransport {
  readonly url: unknown;
  constructor(_url: unknown) {
    this.url = _url;
  }
}

export class McpServer {
  constructor(readonly info: unknown, readonly options?: unknown) {}
  registerTool(_name: string, _schema: unknown, _handler: unknown) {}
  async connect(_transport: unknown) {}
  async close() {}
  get server() {
    return this;
  }
  async sendLoggingMessage(_message: unknown, _sessionId?: unknown) {}
}

export class StreamableHTTPServerTransport {
  constructor(readonly options?: unknown) {}
  async handleRequest(_request: unknown, _response: unknown, _parsedBody?: unknown) {
    const response = _response as {
      writeHead: (status: number, headers: Record<string, string>) => void;
      end: (data: string) => void;
    };
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ jsonrpc: '2.0', id: null, result: {} }));
  }
  async close() {}
  get sessionId() {
    return undefined;
  }
  set onclose(_handler: unknown) {}
  get onclose() {
    return undefined;
  }
  set onerror(_handler: unknown) {}
  get onerror() {
    return undefined;
  }
  set onmessage(_handler: unknown) {}
  get onmessage() {
    return undefined;
  }
  async start() {}
  async send(_message: unknown, _options?: unknown) {}
  closeSSEStream(_requestId?: unknown) {}
  closeStandaloneSSEStream() {}
}
