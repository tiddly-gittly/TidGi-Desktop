import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { logger } from '@services/libs/log';
import { callTool, TOOLS } from './tools';
import type { JsonRpcRequest, JsonRpcResponse, ToolInput } from './types';

async function handleJsonRpc(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const { id, method, params } = request;

  try {
    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'tidgi-mcp', version: '1.0.0' },
        },
      };
    }

    if (method === 'notifications/initialized') {
      return { jsonrpc: '2.0', id, result: null };
    }

    if (method === 'tools/list') {
      return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
    }

    if (method === 'tools/call') {
      const { name, arguments: toolArguments } = params as { name: string; arguments: ToolInput };
      const toolResult = await callTool(name, toolArguments ?? {});
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2),
            },
          ],
        },
      };
    }

    return { jsonrpc: '2.0', id, error: { code: -32_601, message: 'Method not found: ' } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('MCP tool call error', { method, message });
    return { jsonrpc: '2.0', id, error: { code: -32_000, message } };
  }
}

function readBody(httpRequest: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    httpRequest.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    httpRequest.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    httpRequest.on('error', reject);
  });
}

async function handleRequest(httpRequest: IncomingMessage, response: ServerResponse): Promise<void> {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (httpRequest.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  if (httpRequest.url === '/mcp' && httpRequest.method === 'POST') {
    try {
      const body = await readBody(httpRequest);
      const request = JSON.parse(body) as JsonRpcRequest;
      const jsonRpcResponse = await handleJsonRpc(request);
      const responseBody = JSON.stringify(jsonRpcResponse);
      response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(responseBody) });
      response.end(responseBody);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorResponse = JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32_700, message: 'Parse error: ' } });
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(errorResponse);
    }
    return;
  }

  if (httpRequest.url === '/' || httpRequest.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ name: 'tidgi-mcp', status: 'ok', tools: TOOLS.map(t => t.name) }));
    return;
  }

  response.writeHead(404);
  response.end('Not found');
}

export function createMcpHttpServer(): http.Server {
  return http.createServer((httpRequest, response) => {
    void handleRequest(httpRequest, response);
  });
}
