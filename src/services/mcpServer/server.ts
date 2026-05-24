import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { createMcpServerWithTools, StreamableHTTPServerTransport } from './sdkAdapter';
import { TOOLS } from './tools';

export interface McpAuthConfig {
  requireToken: boolean;
  token: string;
}

export function createMcpHttpServer(authConfig?: McpAuthConfig): http.Server {
  const mcpServer = createMcpServerWithTools();

  return http.createServer(async (httpRequest: IncomingMessage, response: ServerResponse) => {
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');

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
      // Token auth check
      if (authConfig?.requireToken && authConfig.token) {
        const authHeader = httpRequest.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.slice(7) !== authConfig.token) {
          response.writeHead(401, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: 'Unauthorized: invalid or missing Bearer token' }));
          return;
        }
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await mcpServer.connect(transport);

      await transport.handleRequest(httpRequest, response, () => {
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
