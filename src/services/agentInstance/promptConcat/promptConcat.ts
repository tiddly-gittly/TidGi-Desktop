/*
 * This module provides a plugin-based system for processing and flattening prompt trees for language model input.
 * It uses tapable hooks to allow plugins to modify prompts dynamically.
 *
 * Key Exports:
 * - flattenPrompts: Flattens a tree of prompts into a linear array for LLMs.
 * - promptConcat: Main entry, applies plugins via hooks and returns processed prompts.
 * - findPromptById: Utility to find a prompt node by ID.
 *
 * Main Concepts:
 * - Prompts are tree-structured, can have roles (system/user/assistant) and children.
 * - Plugins use hooks to modify the prompt tree at runtime.
 * - Built-in plugins are registered by pluginId and executed when matching plugins are found.
 */

import { logger } from '@services/libs/log';
import { CoreMessage } from 'ai';
import { cloneDeep } from 'lodash';
import { AgentInstanceMessage } from '../interface';
import { builtInPlugins, createHandlerHooks, initializePluginSystem, PromptConcatHookContext } from '../plugins';
import { AgentPromptDescription, IPrompt } from './promptConcatSchema';
import { Plugin } from './promptConcatSchema/plugin';

// Initialize plugin system on module load
initializePluginSystem();

/**
 * Context type specific for prompt concatenation operations
 * Contains message history and source path mapping for form field navigation
 */
export interface PromptConcatContext {
  /** Array of agent instance messages for context */
  messages: AgentInstanceMessage[];
  /** Mapping from prompt/modification IDs to their form field paths for navigation */
  sourcePaths?: Map<string, string[]>;
}

/**
 * Generate ID-based path mapping for prompts to enable source tracking
 * Uses actual node IDs instead of indices to avoid path conflicts with dynamic content
 */
function generateSourcePaths(prompts: IPrompt[], plugins: Plugin[] = []): Map<string, string[]> {
  const pathMap = new Map<string, string[]>();
  function traversePrompts(items: IPrompt[], currentPath: string[]): void {
    items.forEach((item) => {
      const itemPath = [...currentPath, item.id];
      pathMap.set(item.id, itemPath);
      if (item.children && item.children.length > 0) {
        traversePrompts(item.children, [...itemPath, 'children']);
      }
    });
  }
  function traversePlugins(items: Plugin[], currentPath: string[]): void {
    items.forEach((item) => {
      const itemPath = [...currentPath, item.id];
      pathMap.set(item.id, itemPath);
    });
  }
  traversePrompts(prompts, ['prompts']);
  traversePlugins(plugins, ['plugins']);
  return pathMap;
}

/**
 * Find a prompt by its ID in the prompt array
 * @param prompts Array of prompts to search
 * @param id Target ID
 * @returns The found prompt object along with its parent array and index
 */
export function findPromptById(
  prompts: IPrompt[],
  id: string,
): { prompt: IPrompt; parent: IPrompt[]; index: number } | undefined {
  for (let index = 0; index < prompts.length; index++) {
    const prompt = prompts[index];
    if (prompt.id === id) {
      return { prompt, parent: prompts, index: index };
    }
    if (prompt.children) {
      const found = findPromptById(prompt.children, id);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

/**
 * Convert tree-structured prompts into a flat array for language model input
 * @param prompts Tree-structured prompt array
 * @returns Flattened array of prompts
 */
export function flattenPrompts(prompts: IPrompt[]): CoreMessage[] {
  logger.debug('Starting prompt flattening', {
    promptCount: prompts.length,
  });

  const result: CoreMessage[] = [];

  // Process prompt tree recursively - collect non-role children text
  function processPrompt(prompt: IPrompt): string {
    // If the prompt has many children, log for debugging
    if (prompt.children && prompt.children.length > 5) {
      logger.debug('Processing complex prompt part', {
        id: prompt.id,
        textLength: prompt.text?.length || 0,
        childrenCount: prompt.children.length,
      });
    }

    let text = prompt.text || '';

    // Collect content from children without a role
    if (prompt.children) {
      for (const child of prompt.children) {
        if (!child.role) {
          // If child has no role, concatenate its content to parent text
          text += processPrompt(child);
        }
      }
    }
    return text;
  }

  // Traverse prompt tree, collect nodes with a role in depth-first order
  function collectRolePrompts(prompts: IPrompt[]): void {
    for (const prompt of prompts) {
      if (prompt.enabled === false) {
        logger.debug('Skipping disabled prompt', { id: prompt.id });
        continue;
      }

      // Process current node first
      const content = processPrompt(prompt);
      if (content.trim() || prompt.role) {
        if (content.length > 1000) {
          logger.debug('Adding large content to result', {
            id: prompt.id,
            role: prompt.role || 'system',
            contentLength: content.length,
          });
        }

        result.push({
          role: prompt.role || 'system',
          content: content.trim() || '',
        });
      }

      // Depth-first traversal for all children with a role
      if (prompt.children) {
        // Collect all children with a role
        const roleChildren: IPrompt[] = [];
        const processChild = (children: IPrompt[]) => {
          for (const child of children) {
            if (child.role) {
              roleChildren.push(child);
            }
            if (child.children) {
              processChild(child.children);
            }
          }
        };

        processChild(prompt.children);

        // Process all collected children with a role
        for (const child of roleChildren) {
          const childContent = processPrompt(child);
          if (childContent.trim() || child.role) {
            result.push({
              role: child.role as 'system' | 'user' | 'assistant',
              content: childContent.trim() || '',
            });
          }
        }
      }
    }
  }

  collectRolePrompts(prompts);

  logger.debug('Skipping any empty content');

  logger.debug('Prompt flattening completed', {
    resultCount: result.length,
    roles: result.map(r => r.role),
  });

  return result;
}

/**
 * Streaming state for prompt processing
 */
export interface PromptConcatStreamState {
  /** Current processed prompts */
  processedPrompts: IPrompt[];
  /** Current flat prompts for LLM */
  flatPrompts: CoreMessage[];
  /** Current processing step */
  step: 'plugin' | 'finalize' | 'flatten' | 'complete';
  /** Current plugin being processed (if step is 'plugin') */
  currentPlugin?: Plugin;
  /** Processing progress (0-1) */
  progress: number;
  /** Whether processing is complete */
  isComplete: boolean;
}

/**
 * Async generator version of promptConcat for streaming updates
 * Yields intermediate results for real-time UI updates
 */
export async function* promptConcatStream(
  agentConfig: Pick<AgentPromptDescription, 'handlerConfig'>,
  messages: AgentInstanceMessage[],
): AsyncGenerator<PromptConcatStreamState, PromptConcatStreamState, unknown> {
  const promptConfigs = Array.isArray(agentConfig.handlerConfig.prompts) ? agentConfig.handlerConfig.prompts : [];
  const pluginConfigs = Array.isArray(agentConfig.handlerConfig.plugins) ? agentConfig.handlerConfig.plugins : [];
  const promptsCopy = cloneDeep(promptConfigs);
  const sourcePaths = generateSourcePaths(promptsCopy, pluginConfigs);

  const hooks = createHandlerHooks();
  // Register plugins that match the configuration
  for (const plugin of pluginConfigs) {
    const builtInPlugin = builtInPlugins.get(plugin.pluginId);
    if (builtInPlugin) {
      builtInPlugin(hooks);
      logger.debug('Registered plugin', {
        pluginId: plugin.pluginId,
        pluginInstanceId: plugin.id,
      });
    } else {
      logger.info(`No built-in plugin found for pluginId: ${plugin.pluginId}`);
    }
  }

  // Process each plugin through hooks with streaming
  let modifiedPrompts = promptsCopy;
  const totalSteps = pluginConfigs.length + 2; // plugins + finalize + flatten

  for (let index = 0; index < pluginConfigs.length; index++) {
    const context: PromptConcatHookContext = {
      messages,
      prompts: modifiedPrompts,
      pluginConfig: pluginConfigs[index],
      metadata: { sourcePaths },
    };
    try {
      const result = await hooks.processPrompts.promise(context);
      modifiedPrompts = result.prompts;
      // Yield intermediate state
      const intermediateFlat = flattenPrompts(modifiedPrompts);
      const messagesCopy = cloneDeep(messages);
      const userMessage = messagesCopy.length > 0 ? messagesCopy[messagesCopy.length - 1] : null;

      if (userMessage && userMessage.role === 'user') {
        intermediateFlat.push({ role: 'user', content: userMessage.content });
      }

      yield {
        processedPrompts: modifiedPrompts,
        flatPrompts: intermediateFlat,
        step: 'plugin',
        currentPlugin: pluginConfigs[index],
        progress: (index + 1) / totalSteps,
        isComplete: false,
      };
    } catch (error) {
      logger.error('Plugin processing error', {
        pluginConfig: pluginConfigs[index],
        error,
      });
      // Continue processing other plugins even if one fails
    }
  }

  // Finalize prompts
  yield {
    processedPrompts: modifiedPrompts,
    flatPrompts: flattenPrompts(modifiedPrompts),
    step: 'finalize',
    progress: (pluginConfigs.length + 1) / totalSteps,
    isComplete: false,
  };

  const finalContext: PromptConcatHookContext = {
    messages,
    prompts: modifiedPrompts,
    pluginConfig: {} as Plugin, // Empty plugin for finalization
    metadata: { sourcePaths },
  };

  try {
    const finalResult = await hooks.finalizePrompts.promise(finalContext);
    modifiedPrompts = finalResult.prompts;
  } catch (error) {
    logger.error('Prompt finalization error', error);
  }

  // Final flattening
  yield {
    processedPrompts: modifiedPrompts,
    flatPrompts: flattenPrompts(modifiedPrompts),
    step: 'flatten',
    progress: (pluginConfigs.length + 2) / totalSteps,
    isComplete: false,
  };

  const flatPrompts = flattenPrompts(modifiedPrompts);
  const messagesCopy = cloneDeep(messages);
  const userMessage = messagesCopy.length > 0 ? messagesCopy[messagesCopy.length - 1] : null;

  if (userMessage && userMessage.role === 'user') {
    logger.debug('Adding user message to prompts', {
      messageId: userMessage.id,
      contentLength: userMessage.content.length,
    });
    flatPrompts.push({ role: 'user', content: userMessage.content });
  }

  logger.debug('Streaming prompt concatenation completed', {
    finalPromptCount: flatPrompts.length,
    processedPromptsCount: modifiedPrompts.length,
  });

  // Final complete state
  const finalState: PromptConcatStreamState = {
    processedPrompts: modifiedPrompts,
    flatPrompts,
    step: 'complete',
    progress: 1,
    isComplete: true,
  };

  yield finalState;
  return finalState;
}

/**
 * Process prompt configuration, apply dynamic modifications, and return a flat array for language model input
 * Synchronous version that waits for all processing to complete - use for backend LLM calls
 *
 * @param agentConfig Prompt configuration
 * @param messages Message history
 * @returns Processed prompt array and original prompt tree
 */
export async function promptConcat(
  agentConfig: Pick<AgentPromptDescription, 'handlerConfig'>,
  messages: AgentInstanceMessage[],
): Promise<{
  flatPrompts: CoreMessage[];
  processedPrompts: IPrompt[];
}> {
  // Use the streaming version and just return the final result
  const stream = promptConcatStream(agentConfig, messages);
  let finalResult: PromptConcatStreamState;

  // Consume all intermediate states to get the final result
  for await (const state of stream) {
    finalResult = state;
  }

  return {
    flatPrompts: finalResult!.flatPrompts,
    processedPrompts: finalResult!.processedPrompts,
  };
}
