/**
 * Persistence plugin for database operations
 * Handles user message storage and agent status updates
 */
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { IAgentInstanceService } from '../interface';
import { createAgentMessage } from '../utilities';
import { AgentStatusContext, HandlerPlugin, UserMessageContext } from './types';

/**
 * Persistence plugin
 * Manages database operations for user messages and agent status
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
};
