/**
 * Thin adapter over @modelcontextprotocol/sdk.
 * SDK types (Server, etc.) must NOT leak into inversify-bound modules —
 * they conflict with inversify's global type namespace causing cascading
 * error-typed container operations. This module wraps the SDK so IoC files
 * only see a plain http.Server factory.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp';

import type { AnySchema } from '@modelcontextprotocol/sdk/server/zod-compat';
import { TOOLS } from './tools';
import type { ToolInput } from './types';

function createMcpServerWithTools(): McpServer {
  const server = new McpServer(
    { name: 'tidgi-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: (tool.inputSchema.properties ?? undefined) as unknown as AnySchema | undefined,
      },
      async (parameters: unknown) => {
        const { callTool } = await import('./tools');
        const result = await callTool(tool.name, parameters as ToolInput);
        return {
          content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }],
        };
      },
    );
  }
  return server;
}

export { createMcpServerWithTools, StreamableHTTPServerTransport };
