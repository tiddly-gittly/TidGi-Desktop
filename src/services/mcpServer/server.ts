import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { logger } from '@services/libs/log';
import { TOOLS } from './tools';
import type { ToolInput } from './types';

function registerTools(server: McpServer): void {
  for (const tool of TOOLS) {
    server.tool(
      tool.name,
      tool.description,
      tool.inputSchema.properties ?? {},
      async (params) => {
        const { callTool } = await import('./tools');
        const result = await callTool(tool.name, params as ToolInput);
        return {
          content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }],
        };
      },
    );
  }
}

export function createMcpHttpServer(): http.Server {
  const mcpServer = new McpServer(
    { name: 'tidgi-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );
  registerTools(mcpServer);

  return http.createServer(async (httpRequest: IncomingMessage, response: ServerResponse) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

    if (httpRequest.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    if (httpRequest.url === '/' || httpRequest.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ name: 'tidgi-mcp', status: 'ok', tools: TOOLS.map(t => t.name) }));
      return;
    }

    if (httpRequest.url === '/mcp' && httpRequest.method === 'POST') {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      mcpServer.connect(transport);

      transport.handleRequest(httpRequest, response, () => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ success: true }));
      });

      httpRequest.on('close', () => {
        void transport.close();
      });
      return;
    }

    response.writeHead(404);
    response.end('Not found');
  });
}
