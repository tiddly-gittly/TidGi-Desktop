import { logger } from '@services/libs/log';
import { AsyncSeriesHook, AsyncSeriesWaterfallHook } from 'tapable';
import { registerPluginParameterSchema } from './schemaRegistry';
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
  const [
    promptPluginsModule,
    wikiSearchModule,
    wikiOperationModule,
    workspacesListModule,
    messageManagementModule,
  ] = await Promise.all([
    import('./promptPlugins'),
    import('./wikiSearchPlugin'),
    import('./wikiOperationPlugin'),
    import('./workspacesListPlugin'),
    import('./messageManagementPlugin'),
  ]);

  return {
    messageManagementPlugin: messageManagementModule.messageManagementPlugin,
    fullReplacementPlugin: promptPluginsModule.fullReplacementPlugin,
    wikiSearchPlugin: wikiSearchModule.wikiSearchPlugin,
    wikiOperationPlugin: wikiOperationModule.wikiOperationPlugin,
    workspacesListPlugin: workspacesListModule.workspacesListPlugin,
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
  // Import plugin schemas and register them
  const [
    promptPluginsModule,
    wikiSearchModule,
    wikiOperationModule,
    workspacesListModule,
    modelContextProtocolModule,
  ] = await Promise.all([
    import('./promptPlugins'),
    import('./wikiSearchPlugin'),
    import('./wikiOperationPlugin'),
    import('./workspacesListPlugin'),
    import('./modelContextProtocolPlugin'),
  ]);

  // Register plugin parameter schemas
  registerPluginParameterSchema(
    'fullReplacement',
    promptPluginsModule.getFullReplacementParameterSchema(),
    {
      displayName: 'Full Replacement',
      description: 'Replace target content with content from specified source',
    },
  );

  registerPluginParameterSchema(
    'dynamicPosition',
    promptPluginsModule.getDynamicPositionParameterSchema(),
    {
      displayName: 'Dynamic Position',
      description: 'Insert content at a specific position relative to a target element',
    },
  );

  registerPluginParameterSchema(
    'wikiSearch',
    wikiSearchModule.getWikiSearchParameterSchema(),
    {
      displayName: 'Wiki Search',
      description: 'Search content in wiki workspaces and manage vector embeddings',
    },
  );

  registerPluginParameterSchema(
    'wikiOperation',
    wikiOperationModule.getWikiOperationParameterSchema(),
    {
      displayName: 'Wiki Operation',
      description: 'Perform operations on wiki workspaces (create, update, delete tiddlers)',
    },
  );

  registerPluginParameterSchema(
    'workspacesList',
    workspacesListModule.getWorkspacesListParameterSchema(),
    {
      displayName: 'Workspaces List',
      description: 'Inject available wiki workspaces list into prompts',
    },
  );

  registerPluginParameterSchema(
    'modelContextProtocol',
    modelContextProtocolModule.getModelContextProtocolParameterSchema(),
    {
      displayName: 'Model Context Protocol',
      description: 'MCP (Model Context Protocol) integration',
    },
  );

  const plugins = await getAllPlugins();
  // Register all built-in plugins to global registry for discovery
  builtInPlugins.set('messageManagement', plugins.messageManagementPlugin);
  builtInPlugins.set('fullReplacement', plugins.fullReplacementPlugin);
  builtInPlugins.set('wikiSearch', plugins.wikiSearchPlugin);
  builtInPlugins.set('wikiOperation', plugins.wikiOperationPlugin);
  builtInPlugins.set('workspacesList', plugins.workspacesListPlugin);
  logger.debug('All built-in plugins and schemas registered successfully');
}

/**
 * Create hooks and register plugins based on handler configuration
 * This creates a new hooks instance and registers plugins for that specific context
 */
export async function createHooksWithPlugins(
  handlerConfig: { plugins?: Array<{ pluginId: string; [key: string]: unknown }> },
): Promise<{ hooks: PromptConcatHooks; pluginConfigs: Array<{ pluginId: string; [key: string]: unknown }> }> {
  const hooks = createHandlerHooks();
  await registerPluginsToHooksFromConfig(hooks, handlerConfig);
  return {
    hooks,
    pluginConfigs: handlerConfig.plugins || [],
  };
}
