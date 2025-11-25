/**
 * Message management plugin
 * Unified plugin for handling message persistence, streaming updates, and UI synchronization
 * Combines functionality from persistencePlugin and aiResponseHistoryPlugin
 */
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IAgentInstanceService } from '../interface';
import { createAgentMessage } from '../utilities';
import type { AgentStatusContext, AIResponseContext, PromptConcatTool, ToolExecutionContext, UserMessageContext } from './types';

/**
 * Message management plugin
 * Handles all message-related operations: persistence, streaming, UI updates, and duration-based filtering
 */
export const messageManagementPlugin: PromptConcatTool = (hooks) => {
  // Handle user message persistence
  hooks.userMessageReceived.tapAsync('messageManagementPlugin', async (context: UserMessageContext, callback) => {
    try {
      const { handlerContext, content, messageId } = context;

      // Create user message using the helper function
      const userMessage = createAgentMessage(messageId, handlerContext.agent.id, {
        role: 'user',
        content: content.text,
        contentType: 'text/plain',
        metadata: content.file ? { file: content.file } : undefined,
        duration: undefined, // User messages persist indefinitely by default
      });

      // Add message to the agent's message array for immediate use (do this before persistence so plugins see it)
      handlerContext.agent.messages.push(userMessage);

      // Get the agent instance service to access repositories
      const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);

      // Save user message to database (if persistence fails, we still keep the in-memory message)
      await agentInstanceService.saveUserMessage(userMessage);

      logger.debug('User message persisted to database', {
        messageId,
        agentId: handlerContext.agent.id,
        contentLength: content.text.length,
      });

      callback();
    } catch (error) {
      logger.error('Message management plugin error in userMessageReceived', {
        error,
        messageId: context.messageId,
        agentId: context.handlerContext.agent.id,
      });
      callback();
    }
  });

  // Handle agent status persistence
  hooks.agentStatusChanged.tapAsync('messageManagementPlugin', async (context: AgentStatusContext, callback) => {
    try {
      const { handlerContext, status } = context;

      // Get the agent instance service to update status
      const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);

      // Update agent status in database
      await agentInstanceService.updateAgent(handlerContext.agent.id, {
        status,
      });

      // Update the agent object for immediate use
      handlerContext.agent.status = status;

      logger.debug('Agent status updated in database', {
        agentId: handlerContext.agent.id,
        state: status.state,
      });

      callback();
    } catch (error) {
      logger.error('Message management plugin error in agentStatusChanged', {
        error,
        agentId: context.handlerContext.agent.id,
        status: context.status,
      });
      callback();
    }
  });

  // Handle AI response updates during streaming
  hooks.responseUpdate.tapAsync('messageManagementPlugin', async (context: AIResponseContext, callback) => {
    try {
      const { handlerContext, response } = context;

      if (response.status === 'update' && response.content) {
        // Find or create AI response message in agent's message array
        let aiMessage = handlerContext.agent.messages.find(
          (message) => message.role === 'assistant' && !message.metadata?.isComplete,
        );

        if (!aiMessage) {
          // Create new AI message for streaming updates
          const now = new Date();
          aiMessage = {
            id: `ai-response-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            agentId: handlerContext.agent.id,
            role: 'assistant',
            content: response.content,
            created: now,
            modified: now,
            metadata: { isComplete: false },
            duration: undefined, // AI responses persist indefinitely by default
          };
          handlerContext.agent.messages.push(aiMessage);
          // Persist immediately so DB timestamp reflects conversation order
          try {
            const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
            await agentInstanceService.saveUserMessage(aiMessage);
            aiMessage.metadata = { ...aiMessage.metadata, isPersisted: true };
          } catch (persistError) {
            logger.warn('Failed to persist initial streaming AI message', {
              error: persistError,
              messageId: aiMessage.id,
            });
          }
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
          logger.warn('Failed to update UI for streaming message', {
            error: serviceError,
            messageId: aiMessage.id,
          });
        }
      }
    } catch (error) {
      logger.error('Message management plugin error in responseUpdate', {
        error,
      });
    } finally {
      callback();
    }
  });

  // Handle AI response completion
  hooks.responseComplete.tapAsync('messageManagementPlugin', async (context: AIResponseContext, callback) => {
    try {
      const { handlerContext, response } = context;

      if (response.status === 'done' && response.content) {
        // Find and finalize AI response message
        let aiMessage = handlerContext.agent.messages.find(
          (message) => message.role === 'assistant' && !message.metadata?.isComplete && !message.metadata?.isToolResult,
        );

        if (aiMessage) {
          // Mark as complete and update final content
          aiMessage.content = response.content;
          aiMessage.modified = new Date();
          aiMessage.metadata = { ...aiMessage.metadata, isComplete: true };
        } else {
          // Create final message if streaming message wasn't found
          const nowFinal = new Date();
          aiMessage = {
            id: `ai-response-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            agentId: handlerContext.agent.id,
            role: 'assistant',
            content: response.content,
            created: nowFinal,
            modified: nowFinal,
            metadata: {
              isComplete: true,
            },
            duration: undefined, // Default duration for AI responses
          };
          handlerContext.agent.messages.push(aiMessage);
        }

        // Get the agent instance service for persistence and UI updates
        const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);

        // Save final AI message to database using the same method as user messages
        await agentInstanceService.saveUserMessage(aiMessage);

        // Final UI update
        try {
          agentInstanceService.debounceUpdateMessage(aiMessage, handlerContext.agent.id);
        } catch (serviceError) {
          logger.warn('Failed to update UI for completed message', {
            error: serviceError,
            messageId: aiMessage.id,
          });
        }

        logger.debug('AI response message completed and persisted', {
          messageId: aiMessage.id,
          finalContentLength: response.content.length,
        });
      }

      callback();
    } catch (error) {
      logger.error('Message management plugin error in responseComplete', {
        error,
      });
      callback();
    }
  });

  // Handle tool result messages persistence and UI updates
  hooks.toolExecuted.tapAsync('messageManagementPlugin', async (context: ToolExecutionContext, callback) => {
    try {
      const { handlerContext } = context;

      // Find newly added tool result messages that need to be persisted
      const newToolResultMessages = handlerContext.agent.messages.filter(
        (message) => message.metadata?.isToolResult && !message.metadata.isPersisted,
      );

      const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);

      // Save tool result messages to database and update UI
      for (const message of newToolResultMessages) {
        try {
          // Save to database using the same method as user messages
          await agentInstanceService.saveUserMessage(message);

          // Update UI
          agentInstanceService.debounceUpdateMessage(message, handlerContext.agent.id);

          // Mark as persisted to avoid duplicate saves
          message.metadata = { ...message.metadata, isPersisted: true, uiUpdated: true };

          logger.debug('Tool result message persisted to database', {
            messageId: message.id,
            toolId: message.metadata.toolId,
            duration: message.duration,
          });
        } catch (serviceError) {
          logger.error('Failed to persist tool result message', {
            error: serviceError,
            messageId: message.id,
          });
        }
      }

      if (newToolResultMessages.length > 0) {
        logger.debug('Tool result messages processed', {
          count: newToolResultMessages.length,
          messageIds: newToolResultMessages.map(m => m.id),
        });
      }

      callback();
    } catch (error) {
      logger.error('Message management plugin error in toolExecuted', {
        error,
      });
      callback();
    }
  });
};
