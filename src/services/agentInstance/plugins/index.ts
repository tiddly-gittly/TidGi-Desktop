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
 * Get all available plugins
 */
async function getAllPlugins() {
  const [promptPluginsModule, responsePluginsModule, wikiSearchModule, messageManagementModule] = await Promise.all([
    import('./promptPlugins'),
    import('./responsePlugins'),
    import('./wikiSearchPlugin'),
    import('./messageManagementPlugin'),
  ]);

  return {
    messageManagementPlugin: messageManagementModule.messageManagementPlugin,
    fullReplacementPlugin: promptPluginsModule.fullReplacementPlugin,
    wikiSearchPlugin: wikiSearchModule.wikiSearchPlugin,
    autoReplyPlugin: responsePluginsModule.autoReplyPlugin,
  };
}

/**
 * Register plugins to hooks based on handler configuration
 * @param hooks - The hooks instance to register plugins to
 * @param handlerConfig - The handler configuration containing plugin settings
 */
export async function registerPluginsToHooksFromConfig(
  hooks: PromptConcatHooks,
  handlerConfig: { plugins?: Array<{ pluginId: string; [key: string]: unknown }> },
): Promise<void> {
  // Always register core plugins that are needed for basic functionality
  const messageManagementModule = await import('./messageManagementPlugin');
  messageManagementModule.messageManagementPlugin(hooks);
  logger.debug('Registered messageManagementPlugin to hooks');

  // Register plugins based on handler configuration
  if (handlerConfig.plugins) {
    for (const pluginConfig of handlerConfig.plugins) {
      const { pluginId } = pluginConfig;

      // Get plugin from global registry (supports both built-in and dynamic plugins)
      const plugin = builtInPlugins.get(pluginId);
      if (plugin) {
        plugin(hooks);
        logger.debug(`Registered plugin ${pluginId} to hooks`);
      } else {
        logger.warn(`Plugin not found in registry: ${pluginId}`);
      }
    }
  }
}

/**
 * Initialize plugin system - register all built-in plugins to global registry
 * This should be called once during service initialization
 */
export async function initializePluginSystem(): Promise<void> {
  const plugins = await getAllPlugins();
  // Register all built-in plugins to global registry for discovery
  builtInPlugins.set('messageManagement', plugins.messageManagementPlugin);
  builtInPlugins.set('fullReplacement', plugins.fullReplacementPlugin);
  builtInPlugins.set('wikiSearch', plugins.wikiSearchPlugin);
  builtInPlugins.set('autoReply', plugins.autoReplyPlugin);

  logger.debug('All built-in plugins registered to global registry successfully');
}

/**
 * Create hooks and register plugins based on handler configuration
 * This creates a new hooks instance and registers plugins for that specific context
 */
export async function createHooksWithPlugins(
  handlerConfig: { plugins?: Array<{ pluginId: string; [key: string]: unknown }> },
): Promise<PromptConcatHooks> {
  const hooks = createHandlerHooks();
  await registerPluginsToHooksFromConfig(hooks, handlerConfig);
  return hooks;
}
