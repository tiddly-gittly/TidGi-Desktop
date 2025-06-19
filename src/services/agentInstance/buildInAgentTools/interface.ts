import { z } from 'zod/v4';

/**
 * Base interface for all agent tools
 */
export interface IAgentTool {
  /** Unique identifier for the tool */
  id: string;
  /** Human-readable name of the tool */
  name: string;
  /** Description of what the tool does */
  description: string;
  /** JSON schema for the tool's input parameters */
  parameterSchema: z.ZodType;
  /** Execute the tool with given parameters */
  execute(parameters: unknown, context?: AgentToolContext): Promise<AgentToolResult>;
}

/**
 * Context provided to tools during execution
 */
export interface AgentToolContext {
  /** Current workspace ID if available */
  workspaceId?: string;
  /** User messages for context */
  userMessages?: string[];
  /** Any additional context data */
  metadata?: Record<string, unknown>;
}

/**
 * Result returned by tool execution
 */
export interface AgentToolResult {
  /** Whether the tool execution was successful */
  success: boolean;
  /** Result data if successful */
  data?: unknown;
  /** Error message if failed */
  error?: string;
  /** Optional metadata about the execution */
  metadata?: Record<string, unknown>;
}

/**
 * Registry for agent tools
 */
export interface IAgentToolRegistry {
  /** Register a new tool */
  registerTool(tool: IAgentTool): void;
  /** Get a tool by ID */
  getTool(id: string): IAgentTool | undefined;
  /** Get all registered tools */
  getAllTools(): IAgentTool[];
  /** Get tools that match certain criteria */
  getToolsByTag(tag: string): IAgentTool[];
}

/**
 * Tool registration metadata
 */
export interface AgentToolRegistration {
  /** Tool instance */
  tool: IAgentTool;
  /** Tags for categorization */
  tags?: string[];
  /** Whether the tool is enabled */
  enabled?: boolean;
}
