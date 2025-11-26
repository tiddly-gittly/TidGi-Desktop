import { ToolCallingMatch } from '@services/agentDefinition/interface';
import { AgentFrameworkContext } from '@services/agentInstance/agentFrameworks/utilities/type';
import { AgentInstanceMessage } from '@services/agentInstance/interface';
import { AIStreamResponse } from '@services/externalAPI/interface';
import { AsyncSeriesHook, AsyncSeriesWaterfallHook } from 'tapable';
import type { IPrompt, IPromptConcatTool } from '../promptConcat/promptConcatSchema';

/**
 * Next round target options
 */
export type YieldNextRoundTarget = 'human' | 'self' | `agent:${string}`; // allows for future agent IDs like "agent:agent-id"

/**
 * Unified actions interface for all tool hooks
 */
export interface ToolActions {
  /** Whether to yield next round to continue processing */
  yieldNextRoundTo?: YieldNextRoundTarget;
  /** New user message to append */
  newUserMessage?: string;
  /** Tool calling information */
  toolCalling?: ToolCallingMatch;
}

/**
 * Base context interface for all tool hooks
 */
export interface BaseToolContext {
  /** Framework context */
  agentFrameworkContext: AgentFrameworkContext;
  /** Additional context data */
  metadata?: Record<string, unknown>;
  /** Actions set by tools during processing */
  actions?: ToolActions;
}

/**
 * Context for prompt processing hooks (processPrompts, finalizePrompts)
 */
export interface PromptConcatHookContext extends BaseToolContext {
  /** Array of agent instance messages for context */
  messages: AgentInstanceMessage[];
  /** Current prompt tree */
  prompts: IPrompt[];
  /** Tool configuration */
  toolConfig: IPromptConcatTool;
}

/**
 * Context for post-processing hooks
 */
export interface PostProcessContext extends PromptConcatHookContext {
  /** LLM response text */
  llmResponse: string;
  /** Processed agent responses */
  responses?: AgentResponse[];
}

/**
 * Context for AI response hooks (responseUpdate, responseComplete)
 */
export interface AIResponseContext extends BaseToolContext {
  /** Tool configuration - for backward compatibility */
  toolConfig: IPromptConcatTool;
  /** Complete framework configuration - allows tools to access all configs */
  agentFrameworkConfig?: { plugins?: Array<{ toolId: string; [key: string]: unknown }> };
  /** AI streaming response */
  response: AIStreamResponse;
  /** Current request ID */
  requestId?: string;
  /** Whether this is the final response */
  isFinal?: boolean;
}

/**
 * Context for user message hooks
 */
export interface UserMessageContext extends BaseToolContext {
  /** User message content */
  content: { text: string; file?: File };
  /** Generated message ID */
  messageId: string;
  /** Timestamp for the message */
  timestamp: Date;
}

/**
 * Context for agent status hooks
 */
export interface AgentStatusContext extends BaseToolContext {
  /** New status state */
  status: {
    state: 'working' | 'completed' | 'failed' | 'canceled';
    modified: Date;
  };
}

/**
 * Context for tool execution hooks
 */
export interface ToolExecutionContext extends BaseToolContext {
  /** Tool execution result */
  toolResult: {
    success: boolean;
    data?: string;
    error?: string;
    metadata?: Record<string, unknown>;
  };
  /** Tool information */
  toolInfo: {
    toolId: string;
    parameters: Record<string, unknown>;
    originalText?: string;
  };
  /** Current request ID */
  requestId?: string;
}

/**
 * Agent response interface
 * Represents a structured response from an agent
 */
export interface AgentResponse {
  id: string;
  text?: string;
  enabled?: boolean;
  children?: AgentResponse[];
}

/**
 * Context for response processing hooks (legacy support)
 */
export interface ResponseHookContext extends PromptConcatHookContext {
  llmResponse: string;
  responses: AgentResponse[];
}

/**
 * Framework hooks for unified tool system
 * Handles both prompt processing and agent lifecycle events
 */
export interface PromptConcatHooks {
  /** Called to process prompt modifications (tool injection, etc.) */
  processPrompts: AsyncSeriesWaterfallHook<[PromptConcatHookContext]>;
  /** Called to finalize prompts before LLM call */
  finalizePrompts: AsyncSeriesWaterfallHook<[PromptConcatHookContext]>;
  /** Called for post-processing after LLM response */
  postProcess: AsyncSeriesWaterfallHook<[PostProcessContext]>;
  /** Called when user sends a new message */
  userMessageReceived: AsyncSeriesHook<[UserMessageContext]>;
  /** Called when agent status changes */
  agentStatusChanged: AsyncSeriesHook<[AgentStatusContext]>;
  /** Called when tool execution completes */
  toolExecuted: AsyncSeriesHook<[ToolExecutionContext]>;
  /** Called when AI response status updates (streaming) */
  responseUpdate: AsyncSeriesHook<[AIResponseContext]>;
  /** Called when AI response is complete */
  responseComplete: AsyncSeriesHook<[AIResponseContext]>;
}

/**
 * Universal tool function interface - can register handlers for any hooks
 */
export type PromptConcatTool = (hooks: PromptConcatHooks) => void;
