import { ToolCallingMatch } from '@services/agentDefinition/interface';
import type { AgentHandlerContext } from '@services/agentInstance/buildInAgentHandlers/type';
import { AgentInstanceMessage } from '@services/agentInstance/interface';
import { AIStreamResponse } from '@services/externalAPI/interface';
import { logger } from '@services/libs/log';
import { AsyncSeriesHook, AsyncSeriesWaterfallHook } from 'tapable';
import { IPrompt } from '../promptConcatSchema';
import { Plugin } from '../promptConcatSchema/plugin';

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
 * Handler hooks for basicPromptConcatHandler extensibility
 */
export interface HandlerHooks {
  /** Called when tool execution completes */
  toolExecuted: AsyncSeriesHook<[ToolExecutionContext]>;
  /** Called when AI response status updates (streaming) */
  responseUpdate: AsyncSeriesHook<[AIResponseContext]>;
  /** Called when AI response is complete */
  responseComplete: AsyncSeriesHook<[AIResponseContext]>;
}

/**
 * Plugin function interface - can register handlers for any hooks
 */
export type PromptConcatPlugin = (hooks: PromptConcatHooks) => void;

/**
 * Handler plugin interface - can register handlers for handler hooks
 */
export type HandlerPlugin = (hooks: HandlerHooks) => void;

/**
 * Universal plugin interface - can register handlers for all types of hooks
 */
export type UniversalPlugin = {
  promptConcat?: PromptConcatPlugin;
  handler?: HandlerPlugin;
};

/**
 * Hooks system for prompt concatenation
 */
export class PromptConcatHooks {
  /** Hook for processing prompt modifications */
  public readonly processPrompts = new AsyncSeriesWaterfallHook<[PromptConcatHookContext]>(['context']);

  /** Hook for finalizing prompts before LLM call */
  public readonly finalizePrompts = new AsyncSeriesWaterfallHook<[PromptConcatHookContext]>(['context']);

  /** Hook for post-processing after LLM response */
  public readonly postProcess = new AsyncSeriesWaterfallHook<[PromptConcatHookContext & { llmResponse: string }]>(['context']);

  /**
   * Register a plugin
   */
  public registerPlugin(plugin: PromptConcatPlugin): void {
    logger.debug('Registering prompt concat plugin');
    plugin(this);
  }
}
