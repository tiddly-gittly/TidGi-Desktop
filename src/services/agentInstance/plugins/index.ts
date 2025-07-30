import { logger } from '@services/libs/log';
import { AsyncSeriesHook, AsyncSeriesWaterfallHook } from 'tapable';
import { 
  AgentResponse, 
  PromptConcatHooks,
  PromptConcatHookContext, 
  PromptConcatPlugin, 
  ResponseHookContext,
  UserMessageContext,
  AgentStatusContext,
  ToolExecutionContext,
  AIResponseContext
} from './types';

// Re-export types for convenience
export type { AgentResponse, PromptConcatHooks, PromptConcatHookContext, PromptConcatPlugin, ResponseHookContext };

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
  // Use dynamic imports to avoid circular dependency issues
  Promise.all([
    import('./promptPlugins'),
    import('./responsePlugins'),
    import('./wikiSearchPlugin'),
  ]).then(([promptPluginsModule, responsePluginsModule, wikiSearchModule]) => {
    // Prompt processing plugins
    registerBuiltInPlugin('fullReplacement', promptPluginsModule.fullReplacementPlugin);
    registerBuiltInPlugin('dynamicPosition', promptPluginsModule.dynamicPositionPlugin);
    registerBuiltInPlugin('modelContextProtocol', promptPluginsModule.modelContextProtocolPlugin);
    
    // Wiki search plugin - handles both prompt and response processing
    registerBuiltInPlugin('wikiSearch', wikiSearchModule.wikiSearchPlugin);

    // Response processing plugins
    registerBuiltInPlugin('autoReply', responsePluginsModule.autoReplyPlugin);

    logger.debug('All built-in plugins registered successfully');
  }).catch((error: unknown) => {
    logger.error('Failed to register built-in plugins:', error);
  });
}

/**
 * Initialize plugin system
 */
export function initializePluginSystem(): void {
  registerAllBuiltInPlugins();
}

/**
 * Create unified hooks instance for the complete plugin system
 */
export function createHandlerHooks(): PromptConcatHooks {
  return {
    // Prompt processing hooks
    processPrompts: new AsyncSeriesWaterfallHook(['context']),
    finalizePrompts: new AsyncSeriesWaterfallHook(['context']),
    postProcess: new AsyncSeriesWaterfallHook(['context']),
    // Agent lifecycle hooks
    userMessageReceived: new AsyncSeriesHook(['context']),
    agentStatusChanged: new AsyncSeriesHook(['context']),
    toolExecuted: new AsyncSeriesHook(['context']),
    responseUpdate: new AsyncSeriesHook(['context']),
    responseComplete: new AsyncSeriesHook(['context']),
  };
}

/**
 * Register built-in handler plugins
 */
export function registerBuiltInHandlerPlugins(hooks: PromptConcatHooks): void {
  // Import and register persistence plugin first (handles database operations)
  import('./persistencePlugin').then(module => {
    module.persistencePlugin(hooks);
    logger.debug('Registered persistencePlugin');
  }).catch((error: unknown) => {
    logger.error('Failed to register persistencePlugin:', error);
  });

  // Import and register wiki search handler plugin
  import('./wikiSearchPlugin').then(module => {
    module.wikiSearchPlugin(hooks);
    logger.debug('Registered wikiSearchPlugin');
  }).catch((error: unknown) => {
    logger.error('Failed to register wikiSearchPlugin:', error);
  });

  logger.debug('Built-in handler plugins registration initiated');
}
