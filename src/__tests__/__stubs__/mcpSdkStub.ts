/**
 * Stub for @modelcontextprotocol/sdk — used in Vitest so that the optional
 * MCP SDK dependency doesn't cause import-resolution errors during tests.
 * The real dynamic imports in modelContextProtocol.ts never execute in unit
 * tests because no agent instance actually calls connectAndListTools().
 */
export class Client {
  constructor(_info: unknown, _options: unknown) {}
  async connect(_transport: unknown) {}
  async listTools() { return { tools: [] }; }
  async callTool(_params: unknown) { return { content: [] }; }
  async close() {}
}

export class StdioClientTransport {
  constructor(_options: unknown) {}
}

export class SSEClientTransport {
  constructor(_url: unknown) {}
}
