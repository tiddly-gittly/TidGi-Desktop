import { logger } from '@services/libs/log';
import { AgentResponse, PromptConcatHookContext, PromptConcatHooks, PromptConcatPlugin, ResponseHookContext } from './types';

// Re-export types for convenience
export type { AgentResponse, PromptConcatHookContext, PromptConcatPlugin, ResponseHookContext };
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
  ]).then(([promptPluginsModule, responsePluginsModule]) => {
    // Prompt processing plugins
    registerBuiltInPlugin('fullReplacement', promptPluginsModule.fullReplacementPlugin);
    registerBuiltInPlugin('dynamicPosition', promptPluginsModule.dynamicPositionPlugin);
    registerBuiltInPlugin('modelContextProtocol', promptPluginsModule.modelContextProtocolPlugin);
    registerBuiltInPlugin('retrievalAugmentedGeneration', promptPluginsModule.retrievalAugmentedGenerationPlugin);

    // Response processing plugins
    registerBuiltInPlugin('toolCalling', responsePluginsModule.toolCallingPlugin);
    registerBuiltInPlugin('autoReply', responsePluginsModule.autoReplyPlugin);

    logger.debug('All built-in plugins registered successfully');
  }).catch(error => {
    logger.error('Failed to register built-in plugins:', error);
  });
}

/**
 * Initialize plugin system
 */
export function initializePluginSystem(): void {
  registerAllBuiltInPlugins();
}
