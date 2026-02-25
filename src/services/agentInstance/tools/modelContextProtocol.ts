/**
 * Model Context Protocol (MCP) Plugin
 * Integrates external MCP servers as tools available to the agent.
 * Uses @modelcontextprotocol/sdk for the client connection.
 *
 * Each agent instance creates its own MCP client connection(s).
 * Connections are managed per-instance and cleaned up when the agent closes.
 */
import { t } from '@services/libs/i18n/placeholder';
import { logger } from '@services/libs/log';
import { z } from 'zod/v4';
import { registerToolDefinition, type ToolExecutionResult } from './defineTool';

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
  /** URL for SSE transport */
  serverUrl: z.string().optional().meta({
    title: 'Server URL (SSE)',
    description: 'URL for SSE-based MCP server. e.g. "http://localhost:3001/sse"',
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
  client: unknown;
  /** Transport */
  transport: unknown;
  /** Whether the client is connected */
  connected: boolean;
}

const clientStates = new Map<string, MCPClientState>();

/**
 * Try to connect to MCP server and list available tools.
 * Returns tool list on success, empty array on failure.
 */
async function connectAndListTools(config: ModelContextProtocolParameter, agentId: string): Promise<MCPClientState['tools']> {
  try {
    // Dynamic import to handle cases where SDK isn't installed.
    // Use /* @vite-ignore */ so Vite/Vitest don't try to resolve the path at build time.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { Client } = await import(/* @vite-ignore */ '@modelcontextprotocol/sdk/client/index.js');

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const client = new Client({ name: 'TidGi-Agent', version: '1.0.0' }, { capabilities: {} });

    let transport: unknown;

    if (config.command) {
      // Stdio transport
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { StdioClientTransport } = await import(/* @vite-ignore */ '@modelcontextprotocol/sdk/client/stdio.js');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      transport = new StdioClientTransport({ command: config.command, args: config.args ?? [] });
    } else if (config.serverUrl) {
      // SSE transport
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { SSEClientTransport } = await import(/* @vite-ignore */ '@modelcontextprotocol/sdk/client/sse.js');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      transport = new SSEClientTransport(new URL(config.serverUrl));
    } else {
      logger.warn('MCP: No command or serverUrl configured', { agentId });
      return [];
    }

    await client.connect(transport as Parameters<typeof client.connect>[0]);

    // List available tools
    const toolsResult = await client.listTools();
    const tools = (toolsResult.tools ?? []).map((t: { name: string; description?: string; inputSchema?: Record<string, unknown> }) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));

    clientStates.set(agentId, { tools, client, transport, connected: true });

    logger.info('MCP connected', { agentId, toolCount: tools.length, tools: tools.map((t: { name: string }) => t.name) });
    return tools;
  } catch (error) {
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
    const client = state.client as { callTool: (params: { name: string; arguments: Record<string, unknown> }) => Promise<{ content: unknown[] }> };
    const result = await client.callTool({ name: toolName, arguments: arguments_ });
    const contentParts = (result.content ?? []) as Array<{ type: string; text?: string }>;
    const textContent = contentParts
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text)
      .join('\n');

    return { success: true, data: textContent || JSON.stringify(result.content), metadata: { toolName } };
  } catch (error) {
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
const mcpDefinition = registerToolDefinition({
  toolId: 'modelContextProtocol',
  displayName: 'MCP (Model Context Protocol)',
  description: 'Connect to external MCP servers and use their tools',
  configSchema: ModelContextProtocolParameterSchema,
  // No static llmToolSchemas — MCP tools are dynamic

  async onProcessPrompts({ config, agentFrameworkContext, injectContent }) {
    const agentId = agentFrameworkContext.agent.id;

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
      const schemaStr = tool.inputSchema ? JSON.stringify(tool.inputSchema, null, 2) : '{}';
      return `Tool: mcp-${tool.name}\nDescription: ${tool.description ?? 'No description'}\nParameters schema:\n${schemaStr}`;
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
    if (!toolCall) return;

    // MCP tools are prefixed with "mcp-"
    if (!toolCall.toolId?.startsWith('mcp-')) return;

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

export const modelContextProtocolTool = mcpDefinition.tool;
