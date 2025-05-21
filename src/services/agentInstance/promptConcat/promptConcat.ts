/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { logger } from '@services/libs/log';
import { CoreMessage } from 'ai';
import { cloneDeep } from 'lodash';
import { AgentInstanceMessage } from '../interface';
import { AgentPromptDescription, Prompt, PromptDynamicModification, PromptPart } from './promptConcatSchema';

/**
 * Minimal context interface for prompt concat operations
 * Contains only fields actually used by prompt modification handlers
 */
export interface PromptConcatContext {
  messages: AgentInstanceMessage[];
}

/**
 * Type definition for prompt dynamic modification handlers
 * Supports both synchronous and asynchronous operations
 */
export type PromptDynamicModificationHandler = (
  prompts: Prompt[],
  modification: PromptDynamicModification,
  context: PromptConcatContext,
) => Prompt[] | Promise<Prompt[]>;

/**
 * Registry for prompt dynamic modification handlers
 */
const promptDynamicModificationHandlers: Record<string, PromptDynamicModificationHandler | undefined> = {};

/**
 * Register a prompt dynamic modification handler
 * @param type Handler type
 * @param handler Handler function
 */
export function registerPromptDynamicModificationHandler(
  type: string,
  handler: PromptDynamicModificationHandler,
): void {
  promptDynamicModificationHandlers[type] = handler;
}

/**
 * Find a prompt by its ID in the prompt array
 * @param prompts Array of prompts to search
 * @param id Target ID
 * @returns The found prompt object along with its parent array and index
 */
export function findPromptById(
  prompts: Prompt[] | PromptPart[],
  id: string,
): { prompt: Prompt | PromptPart; parent: (Prompt | PromptPart)[]; index: number } | undefined {
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
export function flattenPrompts(prompts: Prompt[]): CoreMessage[] {
  logger.debug('Starting prompt flattening', {
    promptCount: prompts.length,
  });

  const result: CoreMessage[] = [];

  // Process prompt tree recursively
  function processPrompt(prompt: Prompt | PromptPart): string {
    if (prompt.children && prompt.children.length > 5) {
      logger.debug('Processing complex prompt part', {
        id: prompt.id,
        textLength: prompt.text?.length || 0,
        childrenCount: prompt.children.length,
      });
    }

    let text = prompt.text || '';
    if (prompt.children) {
      for (const child of prompt.children) {
        text += processPrompt(child);
      }
    }
    return text;
  }

  // Process each top-level prompt
  for (const prompt of prompts) {
    if (!prompt.enabled) {
      logger.debug('Skipping disabled prompt', { id: prompt.id });
      continue;
    }

    const content = processPrompt(prompt);
    if (content.trim()) {
      if (content.length > 1000) {
        logger.debug('Adding large content to result', {
          id: prompt.id,
          role: prompt.role || 'system',
          contentLength: content.length,
        });
      }

      result.push({
        role: prompt.role || 'system',
        content,
      });
    } else {
      logger.debug('Skipping empty content', { id: prompt.id });
    }
  }

  logger.debug('Prompt flattening completed', {
    resultCount: result.length,
    roles: result.map(r => r.role),
  });

  return result;
}

/**
 * Process prompt configuration, apply dynamic modifications, and return a flat array for language model input
 * Pure function version, only accepts necessary parameters
 *
 * @param agentConfig Prompt configuration
 * @param messages Message history
 * @returns Processed prompt array and original prompt tree
 */
export async function promptConcat(
  agentConfig: AgentPromptDescription,
  messages: AgentInstanceMessage[],
): Promise<{
  flatPrompts: CoreMessage[];
  processedPrompts: Prompt[];
}> {
  // Generate unique ID for logging
  const messageId = messages[0]?.id || 'unknown';

  logger.debug('Starting prompt concatenation', {
    method: 'promptConcat',
    messageId,
    configId: agentConfig.id,
    messageCount: messages.length,
  });

  // Ensure configuration exists and has correct structure
  const promptConfig = agentConfig.promptConfig || {};
  const prompts = Array.isArray(promptConfig.prompts) ? promptConfig.prompts : [];

  // 1. Clone prompt configuration for modification
  const promptsCopy = cloneDeep(prompts);

  // 2. Get list of dynamic modification configurations
  let modifiedPrompts = promptsCopy;
  const promptDynamicModifications = Array.isArray(promptConfig.promptDynamicModification)
    ? promptConfig.promptDynamicModification
    : [];

  // 3. Apply dynamic modifications
  for (const modification of promptDynamicModifications) {
    const handler = promptDynamicModificationHandlers[modification.dynamicModificationType];

    logger.debug('Processing modification', {
      modificationType: modification.dynamicModificationType,
      targetId: modification.fullReplacementParam?.targetId,
      handlerAvailable: !!handler,
    });

    if (handler) {
      modifiedPrompts = await Promise.resolve(handler(modifiedPrompts, modification, { messages }));
    } else {
      logger.warn(`No handler found for modification type: ${modification.dynamicModificationType}`);
    }
  }

  // 5. Flatten tree-structured prompts into an array
  const flatPrompts = flattenPrompts(modifiedPrompts);

  logger.debug('Flattened prompts', {
    flatPromptCount: flatPrompts.length,
    roles: flatPrompts.map(p => p.role),
  });

  // 6. Add user messages (if any)
  const [userMessage] = messages;

  if (userMessage && userMessage.role === 'user') {
    logger.debug('Adding user message to prompts', {
      messageId: userMessage.id,
      contentLength: userMessage.content.length,
    });

    flatPrompts.push({ role: 'user', content: userMessage.content });
  }

  logger.debug('Prompt concatenation completed', {
    finalPromptCount: flatPrompts.length,
    processedPromptsCount: modifiedPrompts.length,
  });

  return {
    flatPrompts,
    processedPrompts: modifiedPrompts,
  };
}
