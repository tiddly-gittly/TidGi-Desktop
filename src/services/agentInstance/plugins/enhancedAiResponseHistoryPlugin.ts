/**
 * Enhanced AI response and message history plugin
 * Handles AI response streaming updates, completion, user message processing, and status updates
 */
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { AgentInstanceMessage, IAgentInstanceService } from '../interface';
import { AgentStatusContext, AIResponseContext, HandlerPlugin, UserMessageContext } from './types';

/**
 * Enhanced AI response history plugin
 * Manages AI response messages in conversation history during streaming and completion
 * Also handles user message processing and status updates
 */
export const enhancedAiResponseHistoryPlugin: HandlerPlugin = (hooks) => {
  // Handle user message processing
  hooks.userMessageReceived.tapAsync('enhancedAiResponseHistoryPlugin', (context: UserMessageContext, callback) => {
    try {
      const { handlerContext, messageId } = context;

      logger.debug('User message received in enhanced AI response history plugin', {
        messageId,
        agentId: handlerContext.agent.id,
      });

      // User message has already been processed by persistencePlugin
      // This hook can be used for additional processing like analytics, notifications, etc.
      callback();
    } catch (error) {
      logger.error('Enhanced AI response history plugin error in userMessageReceived', {
        error: error instanceof Error ? error.message : String(error),
        messageId: context.messageId,
        agentId: context.handlerContext.agent.id,
      });
      callback();
    }
  });

  // Handle agent status changes
  hooks.agentStatusChanged.tapAsync('enhancedAiResponseHistoryPlugin', (context: AgentStatusContext, callback) => {
    try {
      const { handlerContext, status } = context;

      logger.debug('Agent status changed in enhanced AI response history plugin', {
        agentId: handlerContext.agent.id,
        state: status.state,
      });

      // Status has already been updated by persistencePlugin
      // This hook can be used for additional processing like notifications, analytics, etc.
      callback();
    } catch (error) {
      logger.error('Enhanced AI response history plugin error in agentStatusChanged', {
        error: error instanceof Error ? error.message : String(error),
        agentId: context.handlerContext.agent.id,
        status: context.status,
      });
      callback();
    }
  });

  // Handle AI response updates (streaming)
  hooks.responseUpdate.tapAsync('enhancedAiResponseHistoryPlugin', (context: AIResponseContext, callback) => {
    try {
      const { handlerContext, response } = context;

      if (response.status === 'update' && response.content) {
        // Find or create AI response message
        let aiMessage = handlerContext.agent.messages.find(
          (message) => message.role === 'assistant' && !message.metadata?.isComplete,
        );

        if (!aiMessage) {
          // Create new AI message for streaming updates
          aiMessage = {
            id: `ai-response-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            agentId: handlerContext.agent.id,
            role: 'assistant',
            content: response.content,
            modified: new Date(),
            metadata: { isComplete: false },
          };
          handlerContext.agent.messages.push(aiMessage);
        } else {
          // Update existing message content
          aiMessage.content = response.content;
          aiMessage.modified = new Date();
        }

        // Update UI using the agent instance service
        try {
          const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
          agentInstanceService.debounceUpdateMessage(aiMessage, handlerContext.agent.id);
        } catch (serviceError) {
          logger.warn('Failed to update UI for message', {
            error: serviceError instanceof Error ? serviceError.message : String(serviceError),
            messageId: aiMessage.id,
          });
        }

        logger.debug('AI response message updated', {
          messageId: aiMessage.id,
          contentLength: response.content.length,
        });
      }

      callback();
    } catch (error) {
      logger.error('Enhanced AI response history plugin error in responseUpdate', {
        error: error instanceof Error ? error.message : String(error),
      });
      callback();
    }
  });

  // Handle AI response completion
  hooks.responseComplete.tapAsync('enhancedAiResponseHistoryPlugin', (context: AIResponseContext, callback) => {
    try {
      const { handlerContext, response } = context;

      if (response.status === 'done' && response.content) {
        // Find and finalize AI response message
        const aiMessage = handlerContext.agent.messages.find(
          (message) => message.role === 'assistant' && !message.metadata?.isComplete,
        );

        if (aiMessage) {
          // Mark as complete and update final content
          aiMessage.content = response.content;
          aiMessage.modified = new Date();
          aiMessage.metadata = { ...aiMessage.metadata, isComplete: true };

          // Final UI update
          try {
            const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
            agentInstanceService.debounceUpdateMessage(aiMessage, handlerContext.agent.id);
          } catch (serviceError) {
            logger.warn('Failed to update UI for completed message', {
              error: serviceError instanceof Error ? serviceError.message : String(serviceError),
              messageId: aiMessage.id,
            });
          }

          logger.debug('AI response message completed', {
            messageId: aiMessage.id,
            finalContentLength: response.content.length,
          });
        } else {
          // Create final message if streaming message wasn't found
          const finalMessage: AgentInstanceMessage = {
            id: `ai-response-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            agentId: handlerContext.agent.id,
            role: 'assistant',
            content: response.content,
            modified: new Date(),
            metadata: { isComplete: true },
          };
          handlerContext.agent.messages.push(finalMessage);

          // UI update for final message
          try {
            const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
            agentInstanceService.debounceUpdateMessage(finalMessage, handlerContext.agent.id);
          } catch (serviceError) {
            logger.warn('Failed to update UI for final message', {
              error: serviceError instanceof Error ? serviceError.message : String(serviceError),
              messageId: finalMessage.id,
            });
          }

          logger.debug('AI response message created as final', {
            messageId: finalMessage.id,
            contentLength: response.content.length,
          });
        }
      }

      callback();
    } catch (error) {
      logger.error('Enhanced AI response history plugin error in responseComplete', {
        error: error instanceof Error ? error.message : String(error),
      });
      callback();
    }
  });
};
