/**
 * Persistence plugin for database operations and UI updates
 * Handles user message storage, agent status updates, AI response management and UI synchronization
 */
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { IAgentInstanceService } from '../interface';
import { createAgentMessage } from '../utilities';
import { AgentStatusContext, AIResponseContext, HandlerPlugin, UserMessageContext } from './types';

/**
 * Persistence plugin
 * Manages database operations, message history and UI updates for all agent interactions
 */
export const persistencePlugin: HandlerPlugin = (hooks) => {
  // Handle user message persistence
  hooks.userMessageReceived.tapAsync('persistencePlugin', async (context: UserMessageContext, callback) => {
    try {
      const { handlerContext, content, messageId } = context;

      // Create user message using the helper function
      const userMessage = createAgentMessage(messageId, handlerContext.agent.id, {
        role: 'user',
        content: content.text,
        contentType: 'text/plain',
        metadata: content.file ? { file: content.file } : undefined,
      });

      // Get the agent instance service to access repositories
      const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);

      // Save user message to database
      await agentInstanceService.saveUserMessage(userMessage);

      // Add message to the agent's message array for immediate use
      handlerContext.agent.messages.push(userMessage);

      logger.debug('User message persisted to database', {
        messageId,
        agentId: handlerContext.agent.id,
        contentLength: content.text.length,
      });

      callback();
    } catch (error) {
      logger.error('Persistence plugin error in userMessageReceived', {
        error: error instanceof Error ? error.message : String(error),
        messageId: context.messageId,
        agentId: context.handlerContext.agent.id,
      });
      callback();
    }
  });

  // Handle agent status persistence
  hooks.agentStatusChanged.tapAsync('persistencePlugin', async (context: AgentStatusContext, callback) => {
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
      logger.error('Persistence plugin error in agentStatusChanged', {
        error: error instanceof Error ? error.message : String(error),
        agentId: context.handlerContext.agent.id,
        status: context.status,
      });
      callback();
    }
  });

  // Handle AI response updates during streaming
  hooks.responseUpdate.tapAsync('persistencePlugin', (context: AIResponseContext, callback) => {
    try {
      const { handlerContext, response } = context;

      if (response.status === 'update' && response.content) {
        // Find or create AI response message in agent's message array
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
          logger.warn('Failed to update UI for streaming message', {
            error: serviceError instanceof Error ? serviceError.message : String(serviceError),
            messageId: aiMessage.id,
          });
        }

        logger.debug('AI response message updated during streaming', {
          messageId: aiMessage.id,
          contentLength: response.content.length,
        });
      }

      callback();
    } catch (error) {
      logger.error('Persistence plugin error in responseUpdate', {
        error: error instanceof Error ? error.message : String(error),
      });
      callback();
    }
  });

  // Handle AI response completion
  hooks.responseComplete.tapAsync('persistencePlugin', async (context: AIResponseContext, callback) => {
    try {
      const { handlerContext, response } = context;

      if (response.status === 'done' && response.content) {
        // Find and finalize AI response message
        let aiMessage = handlerContext.agent.messages.find(
          (message) => message.role === 'assistant' && !message.metadata?.isComplete,
        );

        if (aiMessage) {
          // Mark as complete and update final content
          aiMessage.content = response.content;
          aiMessage.modified = new Date();
          aiMessage.metadata = { ...aiMessage.metadata, isComplete: true };
        } else {
          // Create final message if streaming message wasn't found
          aiMessage = {
            id: `ai-response-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            agentId: handlerContext.agent.id,
            role: 'assistant',
            content: response.content,
            modified: new Date(),
            metadata: { isComplete: true },
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
            error: serviceError instanceof Error ? serviceError.message : String(serviceError),
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
      logger.error('Persistence plugin error in responseComplete', {
        error: error instanceof Error ? error.message : String(error),
      });
      callback();
    }
  });
};
