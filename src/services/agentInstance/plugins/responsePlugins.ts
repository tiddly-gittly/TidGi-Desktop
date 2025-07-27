/**
 * Response processing plugins
 */
import { logger } from '@services/libs/log';
import { PromptConcatPlugin, ResponseHookContext } from './types';

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
