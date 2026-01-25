/**
 * Message Persistence Infrastructure
 *
 * Handles persisting messages to the database.
 * This is core infrastructure, not a user-configurable plugin.
 */
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { app } from 'electron';
import * as fs from 'fs-extra';
import * as path from 'path';
import type { IAgentInstanceService } from '../../interface';
import type { AIResponseContext, PromptConcatHooks, ToolExecutionContext, UserMessageContext } from '../../tools/types';
import { createAgentMessage } from '../../utilities';

/**
 * Register message persistence handlers to hooks
 */
export function registerMessagePersistence(hooks: PromptConcatHooks): void {
  // Handle user message persistence
  hooks.userMessageReceived.tapAsync('messagePersistence', async (context: UserMessageContext, callback) => {
    try {
      const { agentFrameworkContext, content, messageId } = context;

      logger.debug('userMessageReceived hook called', {
        messageId,
        hasFile: !!content.file,
        fileInfo: content.file
          ? {
            hasPath: !!(content.file as unknown as { path?: string }).path,
            hasName: !!(content.file as unknown as { name?: string }).name,
            hasBuffer: !!(content.file as unknown as { buffer?: ArrayBuffer }).buffer,
          }
          : null,
      });

      let persistedFileMetadata: Record<string, unknown> | undefined;

      // Handle file attachment persistence
      if (content.file) {
        try {
          // content.file coming from IPC might be a plain object with path and optional buffer
          const fileObject = content.file as unknown as { path?: string; name?: string; buffer?: ArrayBuffer };

          if ((fileObject.path || fileObject.buffer) && app) {
            const userDataPath = app.getPath('userData');
            const storageDirectory = path.join(userDataPath, 'agent_attachments', agentFrameworkContext.agent.id);
            await fs.ensureDir(storageDirectory);

            const extension = path.extname(fileObject.name || (fileObject.path || '')) || '.bin';
            const newFileName = `${messageId}${extension}`;
            const newPath = path.join(storageDirectory, newFileName);

            if (fileObject.path) {
              await fs.copy(fileObject.path, newPath);
            } else if (fileObject.buffer) {
              await fs.writeFile(newPath, Buffer.from(fileObject.buffer));
            }

            persistedFileMetadata = {
              path: newPath,
              originalPath: fileObject.path,
              name: fileObject.name,
              savedAt: new Date(),
            };
          } else if (fileObject.path || fileObject.name) {
            // If app is not available (e.g., in some test scenarios), at least preserve file info without buffer
            persistedFileMetadata = {
              path: fileObject.path,
              name: fileObject.name,
            };
          }
        } catch (error) {
          logger.error('Failed to persist attachment', { error, messageId });
          // Even on error, try to preserve basic file info (without buffer which can't be serialized)
          const fileObject = content.file as unknown as { path?: string; name?: string };
          if (fileObject.path || fileObject.name) {
            persistedFileMetadata = {
              path: fileObject.path,
              name: fileObject.name,
            };
          }
        }
      }

      // Create user message using the helper function
      const userMessage = createAgentMessage(messageId, agentFrameworkContext.agent.id, {
        role: 'user',
        content: content.text,
        contentType: 'text/plain',
        metadata: persistedFileMetadata ? { file: persistedFileMetadata } : undefined,
        duration: undefined, // User messages persist indefinitely by default
      });

      // Debug log
      if (persistedFileMetadata) {
        logger.debug('User message created with file metadata', {
          messageId,
          hasMetadata: !!userMessage.metadata,
          hasFile: !!userMessage.metadata?.file,
          filePath: (userMessage.metadata?.file as Record<string, unknown> | undefined)?.path,
          fileName: (userMessage.metadata?.file as Record<string, unknown> | undefined)?.name,
        });
      }

      // Add message to the agent's message array for immediate use
      agentFrameworkContext.agent.messages.push(userMessage);

      // Get the agent instance service to access repositories
      const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);

      // Save user message to database
      await agentInstanceService.saveUserMessage(userMessage);

      logger.debug('User message persisted to database', {
        messageId,
        agentId: agentFrameworkContext.agent.id,
        contentLength: content.text.length,
      });

      callback();
    } catch (error) {
      logger.error('Message persistence error in userMessageReceived', {
        error,
        messageId: context.messageId,
        agentId: context.agentFrameworkContext.agent.id,
      });
      callback();
    }
  });

  // Handle AI response completion persistence
  hooks.responseComplete.tapAsync('messagePersistence', async (context: AIResponseContext, callback) => {
    try {
      const { agentFrameworkContext, response } = context;

      if (response.status === 'done' && response.content) {
        // Find the AI message that needs to be persisted
        const aiMessage = agentFrameworkContext.agent.messages.find(
          (message) => message.role === 'assistant' && message.metadata?.isComplete && !message.metadata?.isPersisted,
        );

        if (aiMessage) {
          const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
          await agentInstanceService.saveUserMessage(aiMessage);
          aiMessage.metadata = { ...aiMessage.metadata, isPersisted: true };

          logger.debug('AI response message persisted', {
            messageId: aiMessage.id,
            contentLength: response.content.length,
          });
        }
      }

      callback();
    } catch (error) {
      logger.error('Message persistence error in responseComplete', { error });
      callback();
    }
  });

  // Handle tool result messages persistence
  hooks.toolExecuted.tapAsync('messagePersistence', async (context: ToolExecutionContext, callback) => {
    try {
      const { agentFrameworkContext } = context;

      // Find newly added tool result messages that need to be persisted
      const newToolResultMessages = agentFrameworkContext.agent.messages.filter(
        (message) => message.metadata?.isToolResult && !message.metadata.isPersisted,
      );

      if (newToolResultMessages.length === 0) {
        callback();
        return;
      }

      const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);

      for (const message of newToolResultMessages) {
        try {
          await agentInstanceService.saveUserMessage(message);
          message.metadata = { ...message.metadata, isPersisted: true };

          logger.debug('Tool result message persisted', {
            messageId: message.id,
            toolId: message.metadata.toolId,
          });
        } catch (serviceError) {
          logger.error('Failed to persist tool result message', {
            error: serviceError,
            messageId: message.id,
          });
        }
      }

      callback();
    } catch (error) {
      logger.error('Message persistence error in toolExecuted', { error });
      callback();
    }
  });
}
