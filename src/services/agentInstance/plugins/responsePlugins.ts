/**
 * Response processing plugins
 */
import { logger } from '@services/libs/log';
import { ResponseHookContext, PromptConcatPlugin } from './types';

/**
 * Auto reply plugin
 * Automatically generates follow-up responses
 */
export const autoReplyPlugin: PromptConcatPlugin = (hooks) => {
  hooks.postProcess.tapAsync('autoReplyPlugin', (context, callback) => {
    const { pluginConfig } = context as ResponseHookContext;

    if (pluginConfig.pluginId !== 'autoReply' || !pluginConfig.autoReplyParam) {
      callback();
      return;
    }

    const { targetId, text, maxAutoReply = 5 } = pluginConfig.autoReplyParam;

    try {
      // Auto reply is always triggered since we removed trigger conditions
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

      callback();
    } catch (error) {
      logger.error('Auto reply plugin error', error);
      callback();
    }
  });
};
