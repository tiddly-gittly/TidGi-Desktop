/**
 * Response processing plugins
 */
import { matchToolCalling } from '@services/agentDefinition/responsePatternUtility';
import { logger } from '@services/libs/log';
import { PromptConcatPlugin, ResponseHookContext } from './types';

/**
 * Tool calling plugin
 * Detects and parses tool calls in AI responses, delegates execution to handler
 */
export const toolCallingPlugin: PromptConcatPlugin = (hooks) => {
  hooks.postProcess.tapAsync('toolCallingPlugin', (context, callback) => {
    const responseContext = context as ResponseHookContext;
    const { pluginConfig, llmResponse } = responseContext;

    if (pluginConfig.pluginId !== 'toolCalling') {
      callback();
      return;
    }

    try {
      // Use matchToolCalling to detect tool calls in the full LLM response
      const toolMatch = matchToolCalling(llmResponse);

      if (toolMatch.found && toolMatch.toolId && toolMatch.parameters) {
        logger.info('Tool call detected in LLM response', {
          toolId: toolMatch.toolId,
          parameters: toolMatch.parameters,
          pluginId: pluginConfig.id,
          originalText: toolMatch.originalText,
        });

        // Set actions to continue round and pass tool call info
        if (!responseContext.actions) {
          responseContext.actions = {};
        }
        responseContext.actions.yieldNextRoundTo = 'self'; // Continue with AI after tool execution
        responseContext.actions.toolCalling = toolMatch;

        // Update context metadata to indicate processing was successful
        if (responseContext.metadata) {
          responseContext.metadata.toolCallsProcessed = true;
          responseContext.metadata.toolId = toolMatch.toolId;
        }

        logger.debug('Tool calling plugin set yieldNextRoundTo=self with tool info', {
          toolId: toolMatch.toolId,
          pluginId: pluginConfig.id,
        });
      } else {
        logger.debug('No tool calls found in LLM response', {
          pluginId: pluginConfig.id,
        });
      }

      callback();
    } catch (error) {
      logger.error('Tool calling plugin error', {
        error: error instanceof Error ? error.message : String(error),
        pluginId: pluginConfig.id,
      });
      callback();
    }
  });
};

/**
 * Auto reply plugin
 * Automatically generates follow-up responses
 */
export const autoReplyPlugin: PromptConcatPlugin = (hooks) => {
  hooks.postProcess.tapAsync('autoReplyPlugin', (context, callback) => {
    const { pluginConfig, llmResponse } = context as ResponseHookContext;

    if (pluginConfig.pluginId !== 'autoReply' || !pluginConfig.autoReplyParam) {
      callback();
      return;
    }

    const { targetId, text, trigger, maxAutoReply = 5 } = pluginConfig.autoReplyParam;

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
            system: trigger.model.system ? trigger.model.system.substring(0, 50) + '...' : undefined,
            user: trigger.model.user ? trigger.model.user.substring(0, 50) + '...' : undefined,
          });
        }
      }

      if (shouldTrigger) {
        logger.info('Auto reply plugin triggered', {
          targetId,
          text: text.substring(0, 100) + '...',
          maxAutoReply,
          pluginId: pluginConfig.id,
        });

        // Set actions to continue round with custom user message
        const responseContext = context as ResponseHookContext;
        if (!responseContext.actions) {
          responseContext.actions = {};
        }
        responseContext.actions.yieldNextRoundTo = 'self'; // Continue with AI
        responseContext.actions.newUserMessage = text; // Use custom message
      } else {
        logger.debug('Auto reply trigger conditions not met', {
          pluginId: pluginConfig.id,
        });
      }

      callback();
    } catch (error) {
      logger.error('Auto reply plugin error', error);
      callback();
    }
  });
};
