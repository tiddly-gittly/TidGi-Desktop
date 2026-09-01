/**
 * Model Context Protocol (MCP) Plugin
 * Integrates external MCP servers as tools available to the agent.
 * Uses @modelcontextprotocol/sdk for the client connection.
 *
 * Each agent instance creates its own MCP client connection(s).
 * Connections are managed per-instance and cleaned up when the agent closes.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { t } from '@services/libs/i18n/placeholder';
import { logger } from '@services/libs/log';
import type { ToolExecutionResult } from 'memeloop';
import { z } from 'zod/v4';
import { defineDesktopTool } from './defineToolDefinition';

/**
 * Model Context Protocol Parameter Schema
 * Configuration parameters for the MCP plugin
 */
export const ModelContextProtocolParameterSchema = z.object({
  /** MCP server command (for stdio transport) */
  command: z.string().optional().meta({
    title: 'Server command',
    description: 'Command to start the MCP server (stdio transport). e.g. "npx -y @modelcontextprotocol/server-filesystem"',
  }),
  /** Arguments for the server command */
  args: z.array(z.string()).optional().meta({
    title: 'Command arguments',
    description: 'Arguments to pass to the MCP server command',
  }),
  /** URL for Streamable HTTP transport. */
  serverUrl: z.string().optional().meta({
    title: 'Server URL (HTTP)',
    description: 'URL for an MCP Streamable HTTP endpoint (for example http://localhost:3001/mcp)',
  }),
  /** Timeout for MCP operations in seconds */
  timeoutSecond: z.number().optional().default(30).meta({
    title: t('Schema.MCP.TimeoutSecondTitle'),
    description: t('Schema.MCP.TimeoutSecond'),
  }),
  /** Position for tool list injection */
  toolListPosition: z.object({
    targetId: z.string().meta({ title: t('Schema.Common.ToolListPosition.TargetIdTitle'), description: t('Schema.Common.ToolListPosition.TargetId') }),
    position: z.enum(['before', 'after']).meta({ title: t('Schema.Common.ToolListPosition.PositionTitle'), description: t('Schema.Common.ToolListPosition.Position') }),
  }).optional().meta({ title: t('Schema.Common.ToolListPositionTitle'), description: t('Schema.Common.ToolListPosition.Description') }),
  toolResultDuration: z.number().optional().default(1).meta({ title: 'Tool result duration', description: 'Rounds MCP tool results stay in context' }),
}).meta({
  title: t('Schema.MCP.Title'),
  description: t('Schema.MCP.Description'),
});

/**
 * Type definition for MCP parameters
 */
export type ModelContextProtocolParameter = z.infer<typeof ModelContextProtocolParameterSchema>;

export function getModelContextProtocolParameterSchema() {
  return ModelContextProtocolParameterSchema;
}

/** Per-instance MCP client state, keyed by agent instance ID */
interface MCPClientState {
  /** Available tools from the MCP server */
  tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
  /** Client connection (lazy-loaded to avoid import issues if SDK not installed) */
  client: {
    callTool: (parameters: {
      name: string;
      arguments: Record<string, unknown>;
    }) => Promise<{ content: unknown[] }>;
    close: () => Promise<void>;
  };
  /** Transport */
  transport: unknown;
  /** Whether the client is connected */
  connected: boolean;
  timeoutMs: number;
}

const clientStates = new Map<string, MCPClientState>();

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => {
            reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
          },
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Try to connect to MCP server and list available tools.
 * Returns tool list on success, empty array on failure.
 */
async function connectAndListTools(config: ModelContextProtocolParameter, agentId: string): Promise<MCPClientState['tools']> {
  const client = new Client({ name: 'TidGi-Agent', version: '1.0.0' }, { capabilities: {} });
  try {
    let transport: unknown;

    if (config.command) {
      transport = new StdioClientTransport({ command: config.command, args: config.args ?? [] });
    } else if (config.serverUrl) {
      const serverURL = new URL(config.serverUrl);
      transport = new StreamableHTTPClientTransport(serverURL);
    } else {
      logger.warn('MCP: No command or serverUrl configured', { agentId });
      return [];
    }

    const timeoutMs = Math.max(1, config.timeoutSecond ?? 30) * 1000;
    await withTimeout(client.connect(transport), timeoutMs, 'MCP connection');

    // List available tools
    const toolsResult = await withTimeout(client.listTools(), timeoutMs, 'MCP tool discovery');
    const tools = (toolsResult.tools ?? []).map((t: { name: string; description?: string; inputSchema?: Record<string, unknown> }) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));

    clientStates.set(agentId, {
      tools,
      client: client as MCPClientState['client'],
      transport,
      connected: true,
      timeoutMs,
    });

    logger.info('MCP connected', { agentId, toolCount: tools.length, tools: tools.map((t: { name: string }) => t.name) });
    return tools;
  } catch (error) {
    if (client.close) await client.close().catch(() => undefined);
    logger.error('MCP connection failed', { error, agentId });
    return [];
  }
}

/**
 * Call an MCP tool via the connected client.
 */
async function callMCPTool(agentId: string, toolName: string, arguments_: Record<string, unknown>): Promise<ToolExecutionResult> {
  const state = clientStates.get(agentId);
  if (!state?.connected || !state.client) {
    return { success: false, error: 'MCP client not connected. Reconnect needed.' };
  }

  try {
    const result = await withTimeout(
      state.client.callTool({ name: toolName, arguments: arguments_ }),
      state.timeoutMs,
      `MCP tool "${toolName}"`,
    );
    const contentParts = (result.content ?? []) as Array<{ type: string; text?: string }>;
    const textContent = contentParts
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text)
      .join('\n');

    return { success: true, data: textContent || JSON.stringify(result.content), metadata: { toolName } };
  } catch (error) {
    state.connected = false;
    clientStates.delete(agentId);
    await state.client.close().catch(() => undefined);
    return { success: false, error: `MCP tool "${toolName}" failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Clean up MCP client for an agent instance (call on agent close/delete).
 */
export async function cleanupMCPClient(agentId: string): Promise<void> {
  const state = clientStates.get(agentId);
  if (state) {
    try {
      if (state.client && typeof (state.client as { close?: () => Promise<void> }).close === 'function') {
        await (state.client as { close: () => Promise<void> }).close();
      }
    } catch (error) {
      logger.warn('MCP cleanup error', { error, agentId });
    }
    clientStates.delete(agentId);
  }
}

/**
 * MCP Tool Definition — dynamically creates tool schemas based on connected server's tools.
 */
export const mcpDefinition = defineDesktopTool({
  toolId: 'mcpClient',
  displayName: 'MCP (Model Context Protocol)',
  description: 'Connect to external MCP servers and use their tools',
  configSchema: ModelContextProtocolParameterSchema,
  // No static llmToolSchemas — MCP tools are dynamic

  async onProcessPrompts({ config, agentFrameworkContext, injectContent }) {
    const agentId = agentFrameworkContext?.agent?.id;
    if (!agentId) return;

    // Connect if not already connected
    let state = clientStates.get(agentId);
    if (!state?.connected) {
      const tools = await connectAndListTools(config, agentId);
      state = clientStates.get(agentId);
      if (!tools.length) return;
    }

    if (!state?.tools.length) return;

    // Build tool descriptions for prompt injection
    const toolDescriptions = state.tools.map((tool) => {
      const schemaString = tool.inputSchema ? JSON.stringify(tool.inputSchema, null, 2) : '{}';
      return `Tool: mcp-${tool.name}\nDescription: ${tool.description ?? 'No description'}\nParameters schema:\n${schemaString}`;
    }).join('\n\n');

    const content = `MCP Server Tools (use <tool_use name="mcp-TOOLNAME">{params}</tool_use> to call):\n\n${toolDescriptions}`;

    const pos = config.toolListPosition;
    if (pos?.targetId) {
      injectContent({
        targetId: pos.targetId,
        position: pos.position || 'after',
        content,
        caption: 'MCP Tools',
      });
    }
  },

  async onResponseComplete({ toolCall, addToolResult, agentFrameworkContext, hooks, requestId }) {
    if (!toolCall || !toolCall.found || !toolCall.toolId.startsWith('mcp-')) return;

    const agentId = agentFrameworkContext.agent.id;
    const mcpToolName = toolCall.toolId.replace(/^mcp-/, '');

    logger.debug('Executing MCP tool', { agentId, mcpToolName });

    const result = await callMCPTool(agentId, mcpToolName, toolCall.parameters ?? {});

    addToolResult({
      toolName: toolCall.toolId,
      parameters: toolCall.parameters ?? {},
      result: result.success ? (result.data ?? 'Success') : (result.error ?? 'Unknown error'),
      isError: !result.success,
      duration: 1,
    });

    // Signal tool execution
    await hooks.toolExecuted.promise({
      agentFrameworkContext,
      toolResult: result,
      toolInfo: { toolId: toolCall.toolId, parameters: toolCall.parameters ?? {}, originalText: toolCall.originalText },
      requestId,
    });

    // Continue processing
    // (yieldToSelf would be called by the caller if needed)
  },
});
