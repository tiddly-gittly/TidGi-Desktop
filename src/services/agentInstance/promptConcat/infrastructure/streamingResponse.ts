/**
 * Streaming Response Infrastructure
 *
 * Handles streaming AI responses: creating/updating messages during streaming
 * and finalizing them when complete.
 * This is core infrastructure, not a user-configurable plugin.
 */
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IAgentInstanceService } from '../../interface';
import type { AIResponseContext, PromptConcatHooks } from '../../tools/types';

/**
 * Register streaming response handlers to hooks
 */
export function registerStreamingResponse(hooks: PromptConcatHooks): void {
  // Handle AI response updates during streaming
  hooks.responseUpdate.tapAsync('streamingResponse', async (context: AIResponseContext, callback) => {
    try {
      const { agentFrameworkContext, response } = context;

      if (response.status === 'update' && response.content) {
        // Find or create AI response message in agent's message array
        let aiMessage = agentFrameworkContext.agent.messages.find(
          (message) => message.role === 'assistant' && !message.metadata?.isComplete,
        );

        if (!aiMessage) {
          // Create new AI message for streaming updates
          const now = new Date();
          aiMessage = {
            id: `ai-response-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            agentId: agentFrameworkContext.agent.id,
            role: 'assistant',
            content: response.content,
            created: now,
            modified: now,
            metadata: { isComplete: false },
            duration: undefined,
          };
          agentFrameworkContext.agent.messages.push(aiMessage);

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
          agentInstanceService.debounceUpdateMessage(aiMessage, agentFrameworkContext.agent.id);
        } catch (serviceError) {
          logger.warn('Failed to update UI for streaming message', {
            error: serviceError,
            messageId: aiMessage.id,
          });
        }
      }
    } catch (error) {
      logger.error('Streaming response error in responseUpdate', { error });
    } finally {
      callback();
    }
  });

  // Handle AI response completion
  hooks.responseComplete.tapAsync('streamingResponse', async (context: AIResponseContext, callback) => {
    try {
      const { agentFrameworkContext, response } = context;

      if (response.status === 'done' && response.content) {
        // Find and finalize AI response message
        let aiMessage = agentFrameworkContext.agent.messages.find(
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
            agentId: agentFrameworkContext.agent.id,
            role: 'assistant',
            content: response.content,
            created: nowFinal,
            modified: nowFinal,
            metadata: { isComplete: true },
            duration: undefined,
          };
          agentFrameworkContext.agent.messages.push(aiMessage);
        }

        // Final UI update
        try {
          const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
          agentInstanceService.debounceUpdateMessage(aiMessage, agentFrameworkContext.agent.id);
        } catch (serviceError) {
          logger.warn('Failed to update UI for completed message', {
            error: serviceError,
            messageId: aiMessage.id,
          });
        }

        logger.debug('AI response message completed', {
          messageId: aiMessage.id,
          finalContentLength: response.content.length,
        });
      }

      callback();
    } catch (error) {
      logger.error('Streaming response error in responseComplete', { error });
      callback();
    }
  });

  // Handle tool result UI updates
  hooks.toolExecuted.tapAsync('streamingResponse-ui', async (context, callback) => {
    try {
      const { agentFrameworkContext } = context;

      // Find tool result messages that need UI update
      const messagesNeedingUiUpdate = agentFrameworkContext.agent.messages.filter(
        (message) => message.metadata?.isToolResult && !message.metadata?.uiUpdated,
      );

      if (messagesNeedingUiUpdate.length > 0) {
        const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);

        for (const message of messagesNeedingUiUpdate) {
          agentInstanceService.debounceUpdateMessage(message, agentFrameworkContext.agent.id);
          message.metadata = { ...message.metadata, uiUpdated: true };
        }
      }

      callback();
    } catch (error) {
      logger.error('Streaming response error in toolExecuted UI update', { error });
      callback();
    }
  });
}
