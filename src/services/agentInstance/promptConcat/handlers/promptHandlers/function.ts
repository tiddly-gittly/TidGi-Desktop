/**
 * Function handler
 *
 * Executes a function and inserts its result at the specified position
 */
import { logger } from '@services/libs/log';
import { cloneDeep } from 'lodash';
import { findPromptById, PromptConcatContext } from '../../promptConcat';
import { Prompt, PromptDynamicModification, PromptPart } from '../../promptConcatSchema';
import { insertContent, shouldTrigger } from '../shared/utilities';

/**
 * Handler for dynamicModificationType: "function"
 * Executes a function and inserts its result at the specified position
 */
export function functionHandler(prompts: Prompt[], modification: PromptDynamicModification, context: PromptConcatContext): Prompt[] {
  if (!modification.functionParam) {
    logger.debug('Missing functionParam', {
      modificationType: 'function',
      modificationId: modification.id || 'unknown',
    });
    return prompts;
  }

  const parameter = modification.functionParam;
  const { targetId, position, functionId, timeoutSecond = 10, timeoutMessage = 'Function execution timed out' } = parameter;
  const target = findPromptById(prompts, targetId);

  if (!target) {
    logger.warn('Target prompt not found for function', {
      targetId,
      modificationId: modification.id || 'unknown',
    });
    return prompts;
  }

  // Skip if trigger conditions not met - make the handler async to handle trigger check
  void (async () => {
    try {
      const shouldExecute = await shouldTrigger(parameter.trigger, undefined, context);
      if (!shouldExecute) {
        logger.debug('Function trigger conditions not met, skipping', {
          modificationId: modification.id || 'unknown',
          functionId,
        });
        return;
      }

      logger.debug('Executing function', {
        functionId,
        timeout: timeoutSecond,
      });

      // Execute function with timeout
      const result = await executeFunctionWithTimeout(functionId, context, timeoutSecond, timeoutMessage);
      if (!result) return;

      // Create new prompt part
      const newPart: PromptPart = {
        id: `function-${Date.now()}`,
        text: result,
        source: context.sourcePaths?.get(modification.id),
      };

      // Insert content based on position
      insertContent(target, newPart, position);
    } catch (error: unknown) {
      logger.error('Error executing function', {
        error: error instanceof Error ? error.message : String(error),
        functionId,
      });
    }
  })();

  return prompts;
}

/**
 * Executes a function with a timeout
 */
async function executeFunctionWithTimeout(
  functionId: string,
  context: PromptConcatContext,
  timeoutSeconds: number,
  timeoutMessage: string,
): Promise<string> {
  try {
    // Create a promise that rejects after the timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutSeconds * 1000);
    });

    // Create the function execution promise
    const executionPromise = executeFunction(functionId, context);

    // Race the two promises
    return await Promise.race([executionPromise, timeoutPromise]);
  } catch (error: unknown) {
    logger.error('Function execution failed or timed out', {
      error: error instanceof Error ? error.message : String(error),
      functionId,
    });
    return timeoutMessage;
  }
}

/**
 * Executes a function using the function registry service
 * This is a placeholder implementation
 */
async function executeFunction(functionId: string, context: PromptConcatContext): Promise<string> {
  try {
    // In a real implementation, you would get the function registry service from the container
    // const functionRegistry = container.get<FunctionRegistryService>(serviceIdentifier.FunctionRegistry);
    // return await functionRegistry.executeFunction(functionId, context);

    // For now, we'll return a placeholder
    logger.debug('Executing function (placeholder)', {
      functionId,
    });

    // Simulate function execution based on the functionId
    if (functionId === 'default-ai-search-function') {
      // Get all messages except the last one which is the user message
      const messages = cloneDeep(context.messages);
      const userMessage = messages.pop(); // Last message is the user message
      const userContent = userMessage?.content || '';
      const keywords = userContent.split(' ').slice(0, 3).join(', ');
      return `已进行了一次网络搜索，搜索使用关键词为: ${keywords}。搜索结果为: 这是一个模拟的搜索结果，实际实现中会调用真实的搜索API。`;
    }

    return `Result from function "${functionId}"`;
  } catch (error: unknown) {
    logger.error('Error executing function', {
      error: error instanceof Error ? error.message : String(error),
      functionId,
    });
    throw error;
  }
}
