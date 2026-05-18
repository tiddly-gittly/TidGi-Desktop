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
      const { name, arguments: toolArgs } = params as { name: string; arguments: ToolInput };
      const toolResult = await callTool(name, toolArgs ?? {});
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

    return { jsonrpc: '2.0', id, error: { code: -32_601, message: `Method not found: ${method}` } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('MCP tool call error', { method, message });
    return { jsonrpc: '2.0', id, error: { code: -32_000, message } };
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => { chunks.push(chunk); });
    req.on('end', () => { resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/mcp' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const request = JSON.parse(body) as JsonRpcRequest;
      const response = await handleJsonRpc(request);
      const responseBody = JSON.stringify(response);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(responseBody) });
      res.end(responseBody);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errResponse = JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32_700, message: `Parse error: ${message}` } });
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(errResponse);
    }
    return;
  }

  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ name: 'tidgi-mcp', status: 'ok', tools: TOOLS.map(t => t.name) }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
}

export function createMcpHttpServer(): http.Server {
  return http.createServer((req, res) => {
    void handleRequest(req, res);
  });
}
