import { AsyncSeriesWaterfallHook } from 'tapable';
import { logger } from '@services/libs/log';
import { IPrompt } from '../promptConcatSchema';
import { Plugin } from '../promptConcatSchema/plugin';
import { fullReplacementPlugin, dynamicPositionPlugin, modelContextProtocolPlugin, retrievalAugmentedGenerationPlugin } from './promptPlugins';
import { toolCallingPlugin, autoReplyPlugin } from './responsePlugins';
import { AgentInstanceMessage } from '@services/agentInstance/interface';

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

/**
 * Registry for built-in plugins
 */
export const builtInPlugins = new Map<string, PromptConcatPlugin>();

/**
 * Register a built-in plugin
 */
export function registerBuiltInPlugin(pluginId: string, plugin: PromptConcatPlugin): void {
  builtInPlugins.set(pluginId, plugin);
  logger.debug(`Registered built-in plugin: ${pluginId}`);
}


/**
 * Register all built-in plugins
 */
export function registerAllBuiltInPlugins(): void {
  // Prompt processing plugins
  registerBuiltInPlugin('fullReplacement', fullReplacementPlugin);
  registerBuiltInPlugin('dynamicPosition', dynamicPositionPlugin);
  registerBuiltInPlugin('modelContextProtocol', modelContextProtocolPlugin);
  registerBuiltInPlugin('retrievalAugmentedGeneration', retrievalAugmentedGenerationPlugin);
  
  // Response processing plugins
  registerBuiltInPlugin('toolCalling', toolCallingPlugin);
  registerBuiltInPlugin('autoReply', autoReplyPlugin);
  
  // Note: fullReplacementResponsePlugin is separate from fullReplacementPlugin
  // They handle different phases of processing
}

/**
 * Initialize plugin system
 */
export function initializePluginSystem(): void {
  registerAllBuiltInPlugins();
}
