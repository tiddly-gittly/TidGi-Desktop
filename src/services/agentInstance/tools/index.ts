import { logger } from '@services/libs/log';
import { AsyncSeriesHook, AsyncSeriesWaterfallHook } from 'tapable';
import { registerToolParameterSchema } from './schemaRegistry';
import { AgentResponse, PromptConcatHookContext, PromptConcatHooks, PromptConcatTool, ResponseHookContext } from './types';

// Re-export types for convenience
export type { AgentResponse, PromptConcatHookContext, PromptConcatHooks, PromptConcatTool, ResponseHookContext };
// Backward compatibility aliases
export type { PromptConcatTool as PromptConcatPlugin };

/**
 * Registry for built-in framework tools
 */
export const builtInTools = new Map<string, PromptConcatTool>();

/**
 * Create unified hooks instance for the complete agent framework tool system
 */
export function createAgentFrameworkHooks(): PromptConcatHooks {
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
 * Get all available tools
 */
async function getAllTools() {
  const [
    promptToolsModule,
    wikiSearchModule,
    wikiOperationModule,
    workspacesListModule,
    messageManagementModule,
  ] = await Promise.all([
    import('./prompt'),
    import('./wikiSearch'),
    import('./wikiOperation'),
    import('./workspacesList'),
    import('./messageManagement'),
  ]);

  return {
    messageManagement: messageManagementModule.messageManagementTool,
    fullReplacement: promptToolsModule.fullReplacementTool,
    wikiSearch: wikiSearchModule.wikiSearchTool,
    wikiOperation: wikiOperationModule.wikiOperationTool,
    workspacesList: workspacesListModule.workspacesListTool,
  };
}

/**
 * Register tools to hooks based on framework configuration
 * @param hooks - The hooks instance to register tools to
 * @param agentFrameworkConfig - The framework configuration containing tool settings
 */
export async function registerToolsToHooksFromConfig(
  hooks: PromptConcatHooks,
  agentFrameworkConfig: { plugins?: Array<{ toolId: string; [key: string]: unknown }> },
): Promise<void> {
  // Always register core tools that are needed for basic functionality
  const messageManagementModule = await import('./messageManagement');
  messageManagementModule.messageManagementTool(hooks);
  logger.debug('Registered messageManagementTool to hooks');

  // Register tools based on framework configuration
  if (agentFrameworkConfig.plugins) {
    for (const toolConfig of agentFrameworkConfig.plugins) {
      const { toolId } = toolConfig;

      // Get tool from global registry (supports both built-in and dynamic tools)
      const tool = builtInTools.get(toolId);
      if (tool) {
        tool(hooks);
        logger.debug(`Registered tool ${toolId} to hooks`);
      } else {
        logger.warn(`Tool not found in registry: ${toolId}`);
      }
    }
  }
}

/**
 * Initialize tool system - register all built-in tools to global registry
 * This should be called once during service initialization
 */
export async function initializeToolSystem(): Promise<void> {
  // Import tool schemas and register them
  const [
    promptToolsModule,
    wikiSearchModule,
    wikiOperationModule,
    workspacesListModule,
    modelContextProtocolModule,
  ] = await Promise.all([
    import('./prompt'),
    import('./wikiSearch'),
    import('./wikiOperation'),
    import('./workspacesList'),
    import('./modelContextProtocol'),
  ]);

  // Register tool parameter schemas
  registerToolParameterSchema(
    'fullReplacement',
    promptToolsModule.getFullReplacementParameterSchema(),
    {
      displayName: 'Full Replacement',
      description: 'Replace target content with content from specified source',
    },
  );

  registerToolParameterSchema(
    'dynamicPosition',
    promptToolsModule.getDynamicPositionParameterSchema(),
    {
      displayName: 'Dynamic Position',
      description: 'Insert content at a specific position relative to a target element',
    },
  );

  registerToolParameterSchema(
    'wikiSearch',
    wikiSearchModule.getWikiSearchParameterSchema(),
    {
      displayName: 'Wiki Search',
      description: 'Search content in wiki workspaces and manage vector embeddings',
    },
  );

  registerToolParameterSchema(
    'wikiOperation',
    wikiOperationModule.getWikiOperationParameterSchema(),
    {
      displayName: 'Wiki Operation',
      description: 'Perform operations on wiki workspaces (create, update, delete tiddlers)',
    },
  );

  registerToolParameterSchema(
    'workspacesList',
    workspacesListModule.getWorkspacesListParameterSchema(),
    {
      displayName: 'Workspaces List',
      description: 'Inject available wiki workspaces list into prompts',
    },
  );

  registerToolParameterSchema(
    'modelContextProtocol',
    modelContextProtocolModule.getModelContextProtocolParameterSchema(),
    {
      displayName: 'Model Context Protocol',
      description: 'MCP (Model Context Protocol) integration',
    },
  );

  const tools = await getAllTools();
  // Register all built-in tools to global registry for discovery
  builtInTools.set('messageManagement', tools.messageManagement);
  builtInTools.set('fullReplacement', tools.fullReplacement);
  builtInTools.set('wikiSearch', tools.wikiSearch);
  builtInTools.set('wikiOperation', tools.wikiOperation);
  builtInTools.set('workspacesList', tools.workspacesList);
  logger.debug('All built-in tools and schemas registered successfully');
}

/**
 * Create hooks and register tools based on framework configuration
 * This creates a new hooks instance and registers tools for that specific context
 */
export async function createHooksWithTools(
  agentFrameworkConfig: { plugins?: Array<{ toolId: string; [key: string]: unknown }> },
): Promise<{ hooks: PromptConcatHooks; toolConfigs: Array<{ toolId: string; [key: string]: unknown }> }> {
  const hooks = createAgentFrameworkHooks();
  await registerToolsToHooksFromConfig(hooks, agentFrameworkConfig);
  return {
    hooks,
    toolConfigs: agentFrameworkConfig.plugins || [],
  };
}
