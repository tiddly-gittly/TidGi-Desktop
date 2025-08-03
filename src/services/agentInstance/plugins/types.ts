import { ToolCallingMatch } from '@services/agentDefinition/interface';
import { AgentHandlerContext } from '@services/agentInstance/buildInAgentHandlers/type';
import { AgentInstanceMessage } from '@services/agentInstance/interface';
import { AIStreamResponse } from '@services/externalAPI/interface';
import { AsyncSeriesHook, AsyncSeriesWaterfallHook } from 'tapable';
import type { IPrompt, IPromptConcatPlugin } from '../promptConcat/promptConcatSchema/';

/**
 * Next round target options
 */
export type YieldNextRoundTarget = 'human' | 'self' | `agent:${string}`; // allows for future agent IDs like "agent:agent-id"

/**
 * Unified actions interface for all plugin hooks
 */
export interface PluginActions {
  /** Whether to yield next round to continue processing */
  yieldNextRoundTo?: YieldNextRoundTarget;
  /** New user message to append */
  newUserMessage?: string;
  /** Tool calling information */
  toolCalling?: ToolCallingMatch;
}

/**
 * Base context interface for all plugin hooks
 */
export interface BasePluginContext {
  /** Handler context */
  handlerContext: AgentHandlerContext;
  /** Additional context data */
  metadata?: Record<string, unknown>;
  /** Actions set by plugins during processing */
  actions?: PluginActions;
}

/**
 * Context for prompt processing hooks (processPrompts, finalizePrompts)
 */
export interface PromptConcatHookContext extends BasePluginContext {
  /** Array of agent instance messages for context */
  messages: AgentInstanceMessage[];
  /** Current prompt tree */
  prompts: IPrompt[];
  /** Plugin configuration */
  pluginConfig: IPromptConcatPlugin;
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
export interface AIResponseContext extends BasePluginContext {
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
export interface UserMessageContext extends BasePluginContext {
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
export interface AgentStatusContext extends BasePluginContext {
  /** New status state */
  status: {
    state: 'working' | 'completed' | 'failed' | 'canceled';
    modified: Date;
  };
}

/**
 * Context for tool execution hooks
 */
export interface ToolExecutionContext extends BasePluginContext {
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
 * Handler hooks for unified plugin system
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
 * Universal plugin function interface - can register handlers for any hooks
 */
export type PromptConcatPlugin = (hooks: PromptConcatHooks) => void;
