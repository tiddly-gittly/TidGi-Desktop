/**
 * Agent Framework Plugin System
 *
 * This module provides a unified registration and hook system for:
 * 1. LLM Tools - Inject tool descriptions and handle AI tool calls
 * 2. Core Infrastructure - Message persistence, streaming, status (always enabled)
 *
 * All plugins are configured via the `plugins` array in agentFrameworkConfig.
 * Each plugin has a `toolId` that identifies it and a corresponding `xxxParam` object for configuration.
 */
import { logger } from '@services/libs/log';

import { getAllToolDefinitions } from 'memeloop';
import { registerToolParameterSchema } from './schemaRegistry';
import { PromptConcatTool } from './types';

// Re-export types for convenience
export type { AgentResponse, PostProcessContext, PromptConcatHookContext, PromptConcatHooks, PromptConcatTool, ResponseHookContext } from './types';

// Re-export defineTool API for LLM tools
export { defineTool, getAllToolDefinitions, registerToolDefinition } from 'memeloop';
import type { ResponseHandlerContext, ToolDefinition, ToolExecutionResult, ToolHandlerContext } from 'memeloop';
export type { ResponseHandlerContext, ToolDefinition, ToolExecutionResult, ToolHandlerContext };

/**
 * Registry for all plugins (LLM tools)
 */
export const pluginRegistry = new Map<string, PromptConcatTool>();

/**
 * Initialize plugin system - register all built-in tools
 * This should be called once during service initialization
 */
export async function initializePluginSystem(): Promise<void> {
  // Import all tool modules to trigger registration
  await Promise.all([
    import('./wikiSearch'),
    import('./wikiOperation'),
    import('./workspacesList'),
    import('./git'),
    import('./tiddlywikiPlugin'),
    import('./modelContextProtocol'),
    import('./summary'),
    import('./alarmClock'),
    import('./editAgentDefinition'),
    import('./askQuestion'),
    import('./backlinks'),
    import('./toc'),
    import('./recent'),
    import('./listTiddlers'),
    import('./getErrors'),
    import('./zxScript'),
    import('./webFetch'),
    import('./spawnAgent'),
    import('./editTiddler'),
    import('./todo'),
  ]);

  // Register LLM tools from the tool registry
  const llmTools = getAllToolDefinitions();
  for (const [toolId, toolDefinition] of llmTools) {
    pluginRegistry.set(toolId, toolDefinition.tool as unknown as PromptConcatTool);
    registerToolParameterSchema(toolId, toolDefinition.configSchema, {
      displayName: toolDefinition.displayName,
      description: toolDefinition.description,
    });
    logger.debug(`Registered LLM tool: ${toolId}`);
  }

  logger.debug('Plugin system initialized', {
    totalPlugins: pluginRegistry.size,
  });
}
