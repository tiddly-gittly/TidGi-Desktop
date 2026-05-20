import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { createMcpServerWithTools, StreamableHTTPServerTransport } from './sdkAdapter';
import { TOOLS } from './tools';

export function createMcpHttpServer(): http.Server {
  const mcpServer = createMcpServerWithTools();

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
      await mcpServer.connect(transport);

      await transport.handleRequest(httpRequest, response, () => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ success: true }));
      });

      httpRequest.on('close', () => {
        await transport.close();
      });
      return;
    }

    response.writeHead(404);
    response.end('Not found');
  });
}
