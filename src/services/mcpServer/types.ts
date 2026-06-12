import type { AnySchema, ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: ZodRawShapeCompat | AnySchema;
}

export type ToolInput = Record<string, unknown>;
