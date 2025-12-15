/**
 * Agent Framework Plugin System
 *
 * This module provides a unified registration and hook system for:
 * 1. Modifiers - Transform the prompt tree (fullReplacement, dynamicPosition)
 * 2. LLM Tools - Inject tool descriptions and handle AI tool calls (wikiSearch, wikiOperation, etc.)
 * 3. Core Infrastructure - Message persistence, streaming, status (always enabled)
 *
 * All plugins are configured via the `plugins` array in agentFrameworkConfig.
 * Each plugin has a `toolId` that identifies it and a corresponding `xxxParam` object for configuration.
 */
import { logger } from '@services/libs/log';
import { AsyncSeriesHook, AsyncSeriesWaterfallHook } from 'tapable';

import { registerCoreInfrastructure } from '../promptConcat/infrastructure';
import { getAllModifiers } from '../promptConcat/modifiers';
import { getAllToolDefinitions } from './defineTool';
import { registerToolParameterSchema } from './schemaRegistry';
import { PromptConcatHooks, PromptConcatTool } from './types';

// Re-export types for convenience
export type { AgentResponse, PostProcessContext, PromptConcatHookContext, PromptConcatHooks, PromptConcatTool, ResponseHookContext } from './types';

// Re-export defineTool API for LLM tools
export { defineTool, getAllToolDefinitions, registerToolDefinition } from './defineTool';
export type { ResponseHandlerContext, ToolDefinition, ToolExecutionResult, ToolHandlerContext } from './defineTool';

// Re-export modifier API
export { defineModifier, getAllModifiers, registerModifier } from '../promptConcat/modifiers';
export type { InsertContentOptions, ModifierDefinition, ModifierHandlerContext } from '../promptConcat/modifiers';

/**
 * Registry for all plugins (modifiers + LLM tools)
 */
export const pluginRegistry = new Map<string, PromptConcatTool>();

/**
 * Create unified hooks instance for the agent framework
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
 * Register plugins to hooks based on framework configuration
 */
export async function registerPluginsToHooks(
  hooks: PromptConcatHooks,
  agentFrameworkConfig: { plugins?: Array<{ toolId: string; [key: string]: unknown }> },
): Promise<void> {
  // Always register core infrastructure first (message persistence, streaming, status)
  registerCoreInfrastructure(hooks);
  logger.debug('Registered core infrastructure to hooks');

  // Register plugins based on framework configuration
  if (agentFrameworkConfig.plugins) {
    for (const pluginConfig of agentFrameworkConfig.plugins) {
      const { toolId } = pluginConfig;

      const plugin = pluginRegistry.get(toolId);
      if (plugin) {
        plugin(hooks);
        logger.debug(`Registered plugin ${toolId} to hooks`);
      } else {
        logger.warn(`Plugin not found in registry: ${toolId}`);
      }
    }
  }
}

/**
 * Initialize plugin system - register all built-in modifiers and LLM tools
 * This should be called once during service initialization
 */
export async function initializePluginSystem(): Promise<void> {
  // Import all plugin modules to trigger registration
  await Promise.all([
    // LLM Tools
    import('./wikiSearch'),
    import('./wikiOperation'),
    import('./workspacesList'),
    import('./git'),
    import('./tiddlywikiPlugin'),
    import('./modelContextProtocol'),
    // Modifiers (imported via modifiers/index.ts)
    import('../promptConcat/modifiers'),
  ]);

  // Register modifiers from the modifier registry
  const modifiers = getAllModifiers();
  for (const [modifierId, modifierDefinition] of modifiers) {
    pluginRegistry.set(modifierId, modifierDefinition.modifier);
    registerToolParameterSchema(modifierId, modifierDefinition.configSchema, {
      displayName: modifierDefinition.displayName,
      description: modifierDefinition.description,
    });
    logger.debug(`Registered modifier: ${modifierId}`);
  }

  // Register LLM tools from the tool registry
  const llmTools = getAllToolDefinitions();
  for (const [toolId, toolDefinition] of llmTools) {
    pluginRegistry.set(toolId, toolDefinition.tool);
    registerToolParameterSchema(toolId, toolDefinition.configSchema, {
      displayName: toolDefinition.displayName,
      description: toolDefinition.description,
    });
    logger.debug(`Registered LLM tool: ${toolId}`);
  }

  logger.debug('Plugin system initialized', {
    totalPlugins: pluginRegistry.size,
    modifiers: modifiers.size,
    llmTools: llmTools.size,
  });
}

/**
 * Create hooks and register plugins based on framework configuration
 */
export async function createHooksWithPlugins(
  agentFrameworkConfig: { plugins?: Array<{ toolId: string; [key: string]: unknown }> },
): Promise<{ hooks: PromptConcatHooks; pluginConfigs: Array<{ toolId: string; [key: string]: unknown }> }> {
  const hooks = createAgentFrameworkHooks();
  await registerPluginsToHooks(hooks, agentFrameworkConfig);
  return {
    hooks,
    pluginConfigs: agentFrameworkConfig.plugins ?? [],
  };
}
