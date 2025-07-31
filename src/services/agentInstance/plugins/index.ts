import { logger } from '@services/libs/log';
import { AsyncSeriesHook, AsyncSeriesWaterfallHook } from 'tapable';
import { AgentResponse, PromptConcatHookContext, PromptConcatHooks, PromptConcatPlugin, ResponseHookContext } from './types';

// Re-export types for convenience
export type { AgentResponse, PromptConcatHookContext, PromptConcatHooks, PromptConcatPlugin, ResponseHookContext };

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
 * Register all built-in plugins to hooks
 */
export function registerAllBuiltInPlugins(hooks?: PromptConcatHooks): void {
  // If hooks provided, register plugins directly to hooks for immediate use
  if (hooks) {
    // Import and register message management plugin first (handles database operations, message persistence, and UI updates)
    import('./messageManagementPlugin').then(module => {
      module.messageManagementPlugin(hooks);
      logger.debug('Registered messageManagementPlugin to hooks');
    }).catch((error: unknown) => {
      logger.error('Failed to register messageManagementPlugin to hooks:', error);
    });

    // Import and register wiki search handler plugin
    import('./wikiSearchPlugin').then(module => {
      module.wikiSearchPlugin(hooks);
      logger.debug('Registered wikiSearchPlugin to hooks');
    }).catch((error: unknown) => {
      logger.error('Failed to register wikiSearchPlugin to hooks:', error);
    });

    // Temporarily disable auto reply plugin to debug
    // import('./responsePlugins').then(module => {
    //   module.autoReplyPlugin(hooks);
    //   logger.debug('Registered autoReplyPlugin to hooks');
    // }).catch((error: unknown) => {
    //   logger.error('Failed to register autoReplyPlugin to hooks:', error);
    // });

    logger.debug('Built-in plugins registration to hooks initiated');
    return;
  }

  // Otherwise, register plugins to global registry for plugin discovery
  Promise.all([
    import('./promptPlugins'),
    import('./responsePlugins'),
    import('./wikiSearchPlugin'),
    import('./messageManagementPlugin'),
  ]).then(([promptPluginsModule, _responsePluginsModule, wikiSearchModule, messageManagementModule]) => {
    // Message management plugin (should be first to handle message persistence and UI updates)
    registerBuiltInPlugin('messageManagement', messageManagementModule.messageManagementPlugin);

    // Prompt processing plugins
    registerBuiltInPlugin('fullReplacement', promptPluginsModule.fullReplacementPlugin);

    // Wiki search plugin - handles both prompt and response processing
    registerBuiltInPlugin('wikiSearch', wikiSearchModule.wikiSearchPlugin);

    // Temporarily disable auto reply plugin
    // registerBuiltInPlugin('autoReply', responsePluginsModule.autoReplyPlugin);

    logger.debug('All built-in plugins registered to global registry successfully');
  }).catch((error: unknown) => {
    logger.error('Failed to register built-in plugins to global registry:', error);
  });
}

/**
 * Initialize plugin system
 */
export function initializePluginSystem(): void {
  registerAllBuiltInPlugins();
}
