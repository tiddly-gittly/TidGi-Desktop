import crypto from 'node:crypto';
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';

import { logger } from '@services/libs/log';

import { createMcpServerWithTools, StreamableHTTPServerTransport } from './sdkAdapter';
import { TOOLS } from './tools';

export interface McpAuthConfig {
  requireToken: boolean;
  token: string;
}

function isValidToken(token: string): (candidate: string) => boolean {
  const expectedBuffer = Buffer.from(token);
  return (candidate) => {
    const candidateBuffer = Buffer.from(candidate);
    const maxLength = Math.max(candidateBuffer.length, expectedBuffer.length);
    if (maxLength === 0) return false;
    const paddedCandidate = Buffer.alloc(maxLength);
    const paddedExpected = Buffer.alloc(maxLength);
    candidateBuffer.copy(paddedCandidate);
    expectedBuffer.copy(paddedExpected);
    return crypto.timingSafeEqual(paddedCandidate, paddedExpected);
  };
}

/**
 * Extract token from Authorization Bearer header or ?token= query parameter.
 * Query param fallback exists because VS Code's built-in MCP client doesn't support
 * custom HTTP headers in .vscode/mcp.json http-type server configs.
 */
function extractToken(request: IncomingMessage): string | undefined {
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  if (request.url) {
    const urlPath = request.url.split('?')[0];
    // Only check query params on /mcp endpoint, not /health or root
    if (urlPath === '/mcp' && request.url.includes('?')) {
      try {
        const parsed = new URL(request.url, 'http://127.0.0.1');
        return parsed.searchParams.get('token') ?? undefined;
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}

export function createMcpHttpServer(authConfig?: McpAuthConfig): http.Server {
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

    // /mcp POST — handle both /mcp and /mcp?token=…
    const urlPath = httpRequest.url?.split('?')[0];
    if (urlPath === '/mcp' && httpRequest.method === 'POST') {
      if (authConfig?.requireToken) {
        const providedToken = extractToken(httpRequest);
        if (!providedToken || !isValidToken(authConfig.token)(providedToken)) {
          response.writeHead(401, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: 'Unauthorized: invalid or missing token' }));
          return;
        }
      }

      const mcpServer = createMcpServerWithTools();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      response.on('close', () => {
        void transport.close();
        void mcpServer.close();
      });
      try {
        await mcpServer.connect(transport);
        await transport.handleRequest(httpRequest, response);
      } catch (error) {
        logger.error('MCP transport error', { error });
        if (!response.headersSent) {
          response.writeHead(500, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: 'Internal Server Error' }));
        }
      }

      return;
    }

    response.writeHead(404);
    response.end('Not found');
  });
}
