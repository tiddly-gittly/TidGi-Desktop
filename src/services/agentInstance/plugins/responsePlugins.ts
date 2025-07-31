/**
 * Response processing plugins
 */
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IAgentInstanceService } from '../interface';
import type { AgentInstanceMessage } from '../interface';
import { PromptConcatPlugin, ResponseHookContext } from './types';

/**
 * Auto reply plugin
 * Automatically generates follow-up responses
 */
export const autoReplyPlugin: PromptConcatPlugin = (hooks) => {
  // Map to store auto reply configs by agent ID
  const autoReplyConfigs = new Map<string, { text: string; targetId: string }>();

  // First pass: Mark for auto reply in postProcess
  hooks.postProcess.tapAsync('autoReplyPlugin-mark', (context, callback) => {
    const { pluginConfig } = context as ResponseHookContext;

    if (pluginConfig.pluginId !== 'autoReply' || !pluginConfig.autoReplyParam) {
      callback();
      return;
    }

    const { targetId, text } = pluginConfig.autoReplyParam;

    try {
      // Auto reply is always triggered since we removed trigger conditions
      logger.debug('Auto reply plugin triggered', {
        targetId,
        text: text.substring(0, 100) + '...',
        pluginId: pluginConfig.id,
      });

      // Set actions to continue round
      const responseContext = context as ResponseHookContext;
      if (!responseContext.actions) {
        responseContext.actions = {};
      }
      responseContext.actions.yieldNextRoundTo = 'self'; // Continue with AI

      // Store config for responseComplete hook (using a unique key based on context)
      const contextKey = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      autoReplyConfigs.set(contextKey, { text, targetId });

      // Store the key in metadata for retrieval
      responseContext.metadata = {
        ...responseContext.metadata,
        autoReplyKey: contextKey,
      };

      callback();
    } catch (error) {
      logger.error('Auto reply plugin error in postProcess', error);
      callback();
    }
  });

  // Second pass: Add auto reply message in responseComplete
  hooks.responseComplete.tapAsync('autoReplyPlugin-execute', async (context, callback) => {
    try {
      const { handlerContext, response } = context;

      if (response.status !== 'done' || !response.content) {
        callback();
        return;
      }

      // Find auto reply config by checking recent messages metadata
      let autoReplyConfig: { text: string; targetId: string } | undefined;
      let configKey: string | undefined;

      // Check if any recent message has autoReplyKey in metadata
      for (const config of autoReplyConfigs.entries()) {
        configKey = config[0];
        autoReplyConfig = config[1];
        break; // Use the first/most recent config
      }

      if (!autoReplyConfig || !configKey) {
        callback();
        return;
      }

      const { text, targetId } = autoReplyConfig;

      // Add the auto reply message directly to agent history
      const autoReplyMessage: AgentInstanceMessage = {
        id: `auto-reply-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        agentId: handlerContext.agent.id,
        role: 'user',
        content: text,
        modified: new Date(),
        duration: 1, // Auto reply messages are only visible to AI for 1 round
        metadata: {
          isAutoReply: true,
          targetId,
        },
      };

      handlerContext.agent.messages.push(autoReplyMessage);

      // Save auto reply message to database
      try {
        const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
        await agentInstanceService.saveUserMessage(autoReplyMessage);
      } catch (saveError) {
        logger.warn('Failed to save auto reply message to database', {
          error: saveError instanceof Error ? saveError.message : String(saveError),
          messageId: autoReplyMessage.id,
        });
      }

      // Clean up the config
      autoReplyConfigs.delete(configKey);

      logger.debug('Auto reply message added', {
        messageId: autoReplyMessage.id,
        content: text.substring(0, 100) + '...',
        agentId: handlerContext.agent.id,
      });

      callback();
    } catch (error) {
      logger.error('Auto reply plugin error in responseComplete', error);
      callback();
    }
  });
};
