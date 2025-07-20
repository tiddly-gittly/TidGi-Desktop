import { AgentInstanceMessage } from '@services/agentInstance/interface';
import { logger } from '@services/libs/log';
import { AsyncSeriesWaterfallHook } from 'tapable';
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
  plugin: Plugin;
  /** Additional context data */
  metadata?: Record<string, any>;
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
 * Context for response processing hooks
 */
export interface ResponseHookContext extends PromptConcatHookContext {
  llmResponse: string;
  responses: AgentResponse[];
}

/**
 * Plugin function type - receives hooks object and registers handlers
 */
export type PromptConcatPlugin = (hooks: PromptConcatHooks) => void;

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
