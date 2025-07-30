import { ToolCallingMatch } from '@services/agentDefinition/interface';
import type { AgentHandlerContext } from '@services/agentInstance/buildInAgentHandlers/type';
import { AgentInstanceMessage } from '@services/agentInstance/interface';
import { AIStreamResponse } from '@services/externalAPI/interface';
import { AsyncSeriesHook, AsyncSeriesWaterfallHook } from 'tapable';
import type { IPrompt, Plugin } from '../promptConcat/promptConcatSchema/';

/**
 * Context passed to plugin hooks
 */
export interface PromptConcatHookContext {
  /** Array of agent instance messages for context */
  messages: AgentInstanceMessage[];
  /** Current prompt tree */
  prompts: IPrompt[];
  /** Plugin configuration */
  pluginConfig: Plugin;
  /** Additional context data */
  metadata?: Record<string, unknown>;
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
 * Next round target options
 */
export type YieldNextRoundTarget = 'human' | 'self' | `agent:${string}`; // allows for future agent IDs like "agent:agent-id"

/**
 * Context for response processing hooks
 */
export interface ResponseHookContext extends PromptConcatHookContext {
  llmResponse: string;
  responses: AgentResponse[];
  actions?: {
    yieldNextRoundTo?: YieldNextRoundTarget;
    newUserMessage?: string;
    toolCalling?: ToolCallingMatch;
  };
}

/**
 * Tool execution result context for handler hooks
 */
export interface ToolExecutionContext {
  /** Handler context */
  handlerContext: AgentHandlerContext;
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
 * AI Response context for streaming updates
 */
export interface AIResponseContext {
  /** Handler context */
  handlerContext: AgentHandlerContext;
  /** AI streaming response */
  response: AIStreamResponse;
  /** Current request ID */
  requestId?: string;
  /** Whether this is the final response */
  isFinal: boolean;
}

/**
 * User message context for new message arrival
 */
export interface UserMessageContext {
  /** Handler context */
  handlerContext: AgentHandlerContext;
  /** User message content */
  content: { text: string; file?: File };
  /** Generated message ID */
  messageId: string;
  /** Timestamp for the message */
  timestamp: Date;
}

/**
 * Agent status context for status updates
 */
export interface AgentStatusContext {
  /** Handler context */
  handlerContext: AgentHandlerContext;
  /** New status state */
  status: {
    state: 'working' | 'completed' | 'failed' | 'canceled';
    modified: Date;
  };
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
  postProcess: AsyncSeriesWaterfallHook<[PromptConcatHookContext & { llmResponse: string }]>;
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
