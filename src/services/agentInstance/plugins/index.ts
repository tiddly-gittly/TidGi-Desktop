import { logger } from '@services/libs/log';
import { AsyncSeriesHook } from 'tapable';
import { AgentResponse, HandlerHooks, PromptConcatHookContext, PromptConcatHooks, PromptConcatPlugin, ResponseHookContext } from './types';

// Re-export types for convenience
export type { AgentResponse, HandlerHooks, PromptConcatHookContext, PromptConcatPlugin, ResponseHookContext };
export { PromptConcatHooks };

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
    import('./toolCallingUnifiedPlugin'),
  ]).then(([promptPluginsModule, responsePluginsModule, toolCallingModule]) => {
    // Prompt processing plugins
    registerBuiltInPlugin('fullReplacement', promptPluginsModule.fullReplacementPlugin);
    registerBuiltInPlugin('dynamicPosition', promptPluginsModule.dynamicPositionPlugin);
    registerBuiltInPlugin('modelContextProtocol', promptPluginsModule.modelContextProtocolPlugin);
    registerBuiltInPlugin('retrievalAugmentedGeneration', promptPluginsModule.retrievalAugmentedGenerationPlugin);

    // Response processing plugins
    registerBuiltInPlugin('toolCalling', toolCallingModule.toolCallingResponsePlugin);
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
 * Create handler hooks instance for basicPromptConcatHandler
 */
export function createHandlerHooks(): HandlerHooks {
  return {
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
export function registerBuiltInHandlerPlugins(hooks: HandlerHooks): void {
  // Import and register persistence plugin first (handles database operations)
  import('./persistencePlugin').then(module => {
    module.persistencePlugin(hooks);
    logger.debug('Registered persistencePlugin');
  }).catch((error: unknown) => {
    logger.error('Failed to register persistencePlugin:', error);
  });

  // Import and register handler plugins
  import('./toolCallingUnifiedPlugin').then(module => {
    module.toolExecutionHistoryPlugin(hooks);
    logger.debug('Registered toolExecutionHistoryPlugin');
  }).catch((error: unknown) => {
    logger.error('Failed to register toolExecutionHistoryPlugin:', error);
  });

  import('./enhancedAiResponseHistoryPlugin').then(module => {
    module.enhancedAiResponseHistoryPlugin(hooks);
    logger.debug('Registered enhancedAiResponseHistoryPlugin');
  }).catch((error: unknown) => {
    logger.error('Failed to register enhancedAiResponseHistoryPlugin:', error);
  });

  logger.debug('Built-in handler plugins registration initiated');
}
