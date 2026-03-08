/**
 * Type definitions for the Tool Definition Framework.
 *
 * Extracted from defineTool.ts to reduce file size and improve importability.
 */
import type { ToolCallingMatch } from '@services/agentDefinition/interface';
import type { z } from 'zod/v4';
import type { AgentInstanceMessage } from '../interface';
import type { findPromptById } from '../promptConcat/promptConcat';
import type { IPrompt } from '../promptConcat/promptConcatSchema';
import type { AIResponseContext, PostProcessContext, PromptConcatHookContext, PromptConcatHooks, PromptConcatTool } from './types';

/**
 * Tool definition configuration
 */
export interface ToolDefinition<
  TConfigSchema extends z.ZodType = z.ZodType,
  TLLMToolSchemas extends Record<string, z.ZodType> = Record<string, z.ZodType>,
> {
  /** Unique tool identifier - must match the toolId used in agent configuration */
  toolId: string;

  /** Display name for UI */
  displayName: string;

  /** Description of what this tool does */
  description: string;

  /** Schema for tool configuration parameters (user-configurable in UI) */
  configSchema: TConfigSchema;

  /**
   * Optional schemas for LLM-callable tools.
   * Each key is the tool name (e.g., 'wiki-search'), value is the parameter schema.
   * The schema's title meta will be used as the tool name in prompts.
   */
  llmToolSchemas?: TLLMToolSchemas;

  /**
   * Called during prompt processing phase.
   * Use this to inject tool descriptions, modify prompts, etc.
   */
  onProcessPrompts?: (context: ToolHandlerContext<TConfigSchema>) => Promise<void> | void;

  /**
   * Called after LLM generates a response.
   * Use this to parse tool calls, execute tools, etc.
   */
  onResponseComplete?: (context: ResponseHandlerContext<TConfigSchema, TLLMToolSchemas>) => Promise<void> | void;

  /**
   * Called during post-processing phase.
   * Use this to transform LLM responses, etc.
   */
  onPostProcess?: (context: PostProcessHandlerContext<TConfigSchema>) => Promise<void> | void;
}

/**
 * Context passed to prompt processing handlers
 */
export interface ToolHandlerContext<TConfigSchema extends z.ZodType> {
  /** The parsed configuration for this tool instance */
  config: z.infer<TConfigSchema>;

  /** Full tool configuration object */
  toolConfig: PromptConcatHookContext['toolConfig'];

  /** Current prompt tree (mutable) */
  prompts: IPrompt[];

  /** Message history */
  messages: AgentInstanceMessage[];

  /** Agent framework context */
  agentFrameworkContext: PromptConcatHookContext['agentFrameworkContext'];

  /** Utility: Find a prompt by ID */
  findPrompt: (id: string) => ReturnType<typeof findPromptById>;

  /** Utility: Inject a tool list at a target position */
  injectToolList: (options: InjectToolListOptions) => void;

  /** Utility: Inject content at a target position */
  injectContent: (options: InjectContentOptions) => void;
}

/**
 * Context passed to response handlers
 */
export interface ResponseHandlerContext<
  TConfigSchema extends z.ZodType,
  TLLMToolSchemas extends Record<string, z.ZodType>,
> extends Omit<ToolHandlerContext<TConfigSchema>, 'prompts' | 'config'> {
  /** The parsed configuration for this tool instance (may be undefined if no config provided) */
  config: z.infer<TConfigSchema> | undefined;

  /** AI response content */
  response: AIResponseContext['response'];

  /** Parsed tool call from response (first match, backward compatible) */
  toolCall: ToolCallingMatch | null;

  /** All parsed tool calls from response (for parallel tool call support) */
  allToolCalls: Array<ToolCallingMatch & { found: true }>;

  /** Whether the response contains <parallel_tool_calls> wrapper */
  isParallel: boolean;

  /** Full agent framework config for accessing other tool configs */
  agentFrameworkConfig: AIResponseContext['agentFrameworkConfig'];

  /** Utility: Execute a tool call and handle the result (first matching call, backward compatible) */
  executeToolCall: <TToolName extends keyof TLLMToolSchemas>(
    toolName: TToolName,
    executor: (parameters: z.infer<TLLMToolSchemas[TToolName]>) => Promise<ToolExecutionResult>,
  ) => Promise<boolean>;

  /**
   * Utility: Execute ALL matching tool calls for this tool.
   * When parallel mode is active, uses concurrent execution with per-tool timeout.
   * Collects both success and failure results (NOT Promise.all semantics).
   * Returns the number of calls executed.
   */
  executeAllMatchingToolCalls: <TToolName extends keyof TLLMToolSchemas>(
    toolName: TToolName,
    executor: (parameters: z.infer<TLLMToolSchemas[TToolName]>) => Promise<ToolExecutionResult>,
    options?: { timeoutMs?: number },
  ) => Promise<number>;

  /** Utility: Add a tool result message */
  addToolResult: (options: AddToolResultOptions) => void;

  /** Utility: Signal that the agent should continue with another round */
  yieldToSelf: () => void;

  /** Utility: Signal that the agent should stop and wait for user input (sets status to 'input-required') */
  yieldToHuman: () => void;

  /** Raw hooks for advanced usage */
  hooks: PromptConcatHooks;

  /** Request ID for tracking */
  requestId?: string;
}

/**
 * Context passed to post-process handlers
 */
export interface PostProcessHandlerContext<TConfigSchema extends z.ZodType> extends Omit<ToolHandlerContext<TConfigSchema>, never> {
  /** LLM response text */
  llmResponse: string;

  /** Processed responses array (mutable) */
  responses: PostProcessContext['responses'];
}

/**
 * Options for injecting tool list into prompts
 */
export interface InjectToolListOptions {
  /** Target prompt ID to inject relative to */
  targetId: string;

  /** Position relative to target: 'before'/'after' inserts as sibling, 'child' adds to children */
  position: 'before' | 'after' | 'child';

  /** Tool schemas to inject (will use all llmToolSchemas if not specified) */
  toolSchemas?: z.ZodType[];

  /** Optional caption for the injected prompt */
  caption?: string;
}

/**
 * Options for injecting content into prompts
 */
export interface InjectContentOptions {
  /** Target prompt ID to inject relative to */
  targetId: string;

  /** Position relative to target */
  position: 'before' | 'after' | 'child';

  /** Content to inject */
  content: string;

  /** Caption for the injected prompt */
  caption?: string;

  /** Optional ID for the injected prompt */
  id?: string;
}

/**
 * Options for adding tool result messages
 */
export interface AddToolResultOptions {
  /** Tool name */
  toolName: string;

  /** Tool parameters */
  parameters: unknown;

  /** Result content */
  result: string;

  /** Whether this is an error result */
  isError?: boolean;

  /** How many rounds this result should be visible */
  duration?: number;
}

/**
 * Result from tool execution
 */
export interface ToolExecutionResult {
  success: boolean;
  data?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Return type of defineTool
 */
export interface DefinedTool<
  TConfigSchema extends z.ZodType = z.ZodType,
  TLLMToolSchemas extends Record<string, z.ZodType> = Record<string, z.ZodType>,
> {
  tool: PromptConcatTool;
  toolId: string;
  configSchema: TConfigSchema;
  llmToolSchemas: TLLMToolSchemas | undefined;
  displayName: string;
  description: string;
}
