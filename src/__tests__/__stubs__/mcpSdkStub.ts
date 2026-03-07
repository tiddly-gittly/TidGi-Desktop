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
