/**
 * Response processing plugins
 */
import { logger } from '@services/libs/log';
import { AgentResponse, PromptConcatPlugin, ResponseHookContext } from './types';

/**
 * Find response by ID in response array
 */
function findResponseById(responses: AgentResponse[], id: string): { response: AgentResponse; parent: AgentResponse[]; index: number } | undefined {
  for (let index = 0; index < responses.length; index++) {
    const response = responses[index];
    if (response.id === id) {
      return { response, parent: responses, index };
    }
    if (response.children) {
      const found = findResponseById(response.children, id);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

/**
 * Parse regex string with flags
 */
function parseRegexString(regexString: string): RegExp | null {
  try {
    // Handle regex format like "/<pattern>/flags"
    const match = regexString.match(/^\/(.+)\/([gimuy]*)$/);
    if (match) {
      return new RegExp(match[1], match[2]);
    }
    // Handle plain string as pattern
    return new RegExp(regexString, 'g');
  } catch (error) {
    logger.error('Failed to parse regex string', { regexString, error });
    return null;
  }
}

/**
 * Tool calling plugin
 * Processes function calls in AI responses
 */
export const toolCallingPlugin: PromptConcatPlugin = (hooks) => {
  hooks.postProcess.tapAsync('toolCallingPlugin', async (context, callback) => {
    const { plugin } = context as ResponseHookContext;

    if (plugin.pluginId !== 'toolCalling' || !plugin.toolCallingParam) {
      callback(null, context);
      return;
    }

    const { targetId, match } = plugin.toolCallingParam;
    const responseContext = context as ResponseHookContext;
    const { responses } = responseContext;

    try {
      // Early return if no responses
      if (responses.length === 0) {
        logger.debug('Skipping tool calling - no responses', {
          pluginId: plugin.id,
        });
        callback(null, context);
        return;
      }

      // Find the target response by ID
      const found = findResponseById(responses, targetId);

      if (!found || !found.response.text) {
        logger.warn('Tool calling target not found or has no text', {
          targetId,
          hasText: !!found?.response.text,
          pluginId: plugin.id,
        });
        callback(null, context);
        return;
      }

      const targetText = found.response.text;

      // Create a RegExp from the match string
      const matchRegex = parseRegexString(match);

      if (!matchRegex) {
        logger.error('Invalid regex pattern for tool calling', {
          match,
          pluginId: plugin.id,
        });
        callback(null, context);
        return;
      }

      // Test if the response contains any function calls
      const hasMatches = matchRegex.test(targetText);

      if (!hasMatches) {
        logger.debug('No tool calls found in response', {
          targetId,
          pluginId: plugin.id,
        });
        callback(null, context);
        return;
      }

      // Reset the lastIndex to start matching from the beginning
      matchRegex.lastIndex = 0;

      // Extract function calls from the response
      const matches: string[] = [];
      let matchResult;
      while ((matchResult = matchRegex.exec(targetText)) !== null) {
        if (matchResult[1]) {
          matches.push(matchResult[1]);
        }
      }

      if (matches.length === 0) {
        logger.debug('No capture groups found in tool call matches', {
          targetId,
          pluginId: plugin.id,
        });
        callback(null, context);
        return;
      }

      // Process the extracted function calls
      logger.info('Found tool calls in response', {
        count: matches.length,
        targetId,
        pluginId: plugin.id,
        calls: matches,
      });

      // For tool calling, we typically want to remove the function call syntax from the response
      // and continue with the normal response flow without triggering a new LLM call
      const processedText = targetText.replace(matchRegex, '').trim();
      found.response.text = processedText;

      // Log the tool calls for debugging - actual tool execution would happen elsewhere
      logger.info('Tool calls extracted from response', {
        count: matches.length,
        targetId,
        pluginId: plugin.id,
        calls: matches.map((call, index) => `Call ${index + 1}: ${call.substring(0, 100)}...`),
      });

      // Update context metadata to indicate processing was successful
      if (responseContext.metadata) {
        responseContext.metadata.toolCallsProcessed = true;
        responseContext.metadata.toolCallCount = matches.length;
        responseContext.metadata.extractedCalls = matches;
      }

      callback(null, context);
    } catch (error) {
      logger.error('Tool calling plugin error', {
        error: error instanceof Error ? error.message : String(error),
        pluginId: plugin.id,
      });
      callback(error instanceof Error ? error : new Error(String(error)), context);
    }
  });
};

/**
 * Auto reply plugin
 * Automatically generates follow-up responses
 */
export const autoReplyPlugin: PromptConcatPlugin = (hooks) => {
  hooks.postProcess.tapAsync('autoReplyPlugin', async (context, callback) => {
    const { plugin, llmResponse } = context as ResponseHookContext;

    if (plugin.pluginId !== 'autoReply' || !plugin.autoReplyParam) {
      callback(null, context);
      return;
    }

    const { targetId, text, trigger, maxAutoReply = 5 } = plugin.autoReplyParam;

    try {
      // Simple trigger evaluation based on content matching
      let shouldTrigger = true;

      if (trigger) {
        shouldTrigger = false;

        // Check search keywords
        if (trigger.search) {
          const searchTerms = trigger.search.split(',');
          const responseMatches = searchTerms.some((term: string) => llmResponse.toLowerCase().includes(term.trim().toLowerCase()));
          if (responseMatches) shouldTrigger = true;
        }

        // Check random chance
        if (typeof trigger.randomChance === 'number') {
          if (Math.random() < trigger.randomChance) shouldTrigger = true;
        }

        // Check filter
        if (trigger.filter && llmResponse.includes(trigger.filter)) {
          shouldTrigger = true;
        }

        // Model-based trigger would require additional LLM call (TODO)
        if (trigger.model) {
          logger.debug('Model-based trigger configured but not implemented', {
            preset: trigger.model.preset,
            system: trigger.model.system?.substring(0, 50) + '...',
            user: trigger.model.user?.substring(0, 50) + '...',
          });
        }
      }

      if (shouldTrigger) {
        logger.info('Auto reply plugin triggered', {
          targetId,
          text: text.substring(0, 100) + '...',
          maxAutoReply,
          pluginId: plugin.id,
        });

        // Set metadata to indicate a new user message should be generated
        const responseContext = context as ResponseHookContext;
        if (responseContext.metadata) {
          responseContext.metadata.needsNewLLMCall = true;
          responseContext.metadata.newUserMessage = text;
          responseContext.metadata.autoReplyTriggered = true;
        }
      } else {
        logger.debug('Auto reply trigger conditions not met', {
          pluginId: plugin.id,
        });
      }

      callback(null, context);
    } catch (error) {
      logger.error('Auto reply plugin error', error);
      callback(error instanceof Error ? error : new Error(String(error)), context);
    }
  });
};
