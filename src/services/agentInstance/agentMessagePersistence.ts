/**
 * Agent Message Persistence — saveUserMessage and debounceUpdateMessage.
 *
 * Pure functions extracted from AgentInstanceService to reduce class size.
 * The debounce-map state is managed by the caller (AgentInstanceService).
 */
import { debounce, pick } from 'lodash';
import { DataSource, Repository } from 'typeorm';

import { AgentInstanceEntity, AgentInstanceMessageEntity } from '@services/database/schema/agent';
import { logger } from '@services/libs/log';

import type { AgentInstance, ChatMessage } from 'memeloop';
import { createChatMessage } from 'memeloop';
import { AGENT_INSTANCE_FIELDS, toDatabaseCompatibleMessage } from './utilities';

/**
 * Persist a message (user, tool, or error) to the database.
 */
export async function saveUserMessage(
  agentMessageRepo: Repository<AgentInstanceMessageEntity>,
  userMessage: ChatMessage,
): Promise<void> {
  const now = new Date();
  const summary = {
    messageId: userMessage.messageId,
    role: userMessage.role,
    conversationId: userMessage.conversationId,
    isToolResult: !!userMessage.metadata?.isToolResult,
    isPersisted: !!userMessage.metadata?.isPersisted,
  };
  logger.debug('Saving user message to DB (start)', {
    when: now.toISOString(),
    ...summary,
    source: 'saveUserMessage',
    stack: new Error().stack?.split('\n').slice(0, 4).join('\n'),
  });

  await agentMessageRepo.save(agentMessageRepo.create(toDatabaseCompatibleMessage(userMessage)));

  logger.debug('User message saved to database', {
    when: new Date().toISOString(),
    ...summary,
    hasMetadata: !!userMessage.metadata,
    hasFile: !!userMessage.metadata?.file,
    metadataKeys: userMessage.metadata ? Object.keys(userMessage.metadata) : [],
    source: 'saveUserMessage',
  });
}

/**
 * Create a debounced update/create function for a given message ID.
 *
 * Returns a debounced function that upserts the message in a transaction.
 * The caller is responsible for caching the returned function per messageId.
 */
export function createDebouncedMessageUpdater(
  dataSource: DataSource,
  messageId: string,
  debounceMs: number,
  /** Callback to notify agent subscribers after a new message is created */
  onNewMessage?: (agentId: string, updatedAgent: AgentInstance) => void,
): (messageData: ChatMessage, agentId?: string) => void {
  return debounce(
    async (messageData_: ChatMessage, aid?: string) => {
      try {
        await dataSource.transaction(async transaction => {
          const messageRepo = transaction.getRepository(AgentInstanceMessageEntity);
          const messageEntity = await messageRepo.findOne({ where: { messageId } });

          if (messageEntity) {
            // Update existing message
            messageEntity.content = messageData_.content;
            if (messageData_.contentType) messageEntity.contentType = messageData_.contentType;
            if (messageData_.metadata) messageEntity.metadata = messageData_.metadata;
            if (messageData_.duration !== undefined) messageEntity.duration = messageData_.duration ?? undefined;
            messageEntity.timestamp = messageData_.timestamp;
            messageEntity.lamportClock = messageData_.lamportClock;

            const startSave = new Date();
            logger.debug('Updating existing message (start save)', {
              when: startSave.toISOString(),
              messageId,
              agentId: aid,
              source: 'debounceUpdateMessage:update',
              stack: new Error().stack?.split('\n').slice(0, 4).join('\n'),
            });
            await messageRepo.save(messageEntity);
            logger.debug('Updating existing message (saved)', {
              when: new Date().toISOString(),
              messageId,
              agentId: aid,
              source: 'debounceUpdateMessage:update',
            });
          } else if (aid) {
            // Create new message
            const messageData = createChatMessage({
              messageId,
              conversationId: aid,
              role: messageData_.role,
              content: messageData_.content,
              originNodeId: 'tidgi-desktop',
              contentType: messageData_.contentType,
              metadata: messageData_.metadata,
              duration: messageData_.duration,
            });
            const newMessage = messageRepo.create(toDatabaseCompatibleMessage(messageData));

            const startSaveNew = new Date();
            logger.debug('Creating new message (start save)', {
              when: startSaveNew.toISOString(),
              messageId,
              agentId: aid,
              source: 'debounceUpdateMessage:create',
              stack: new Error().stack?.split('\n').slice(0, 4).join('\n'),
            });
            await messageRepo.save(newMessage);
            logger.debug('Creating new message (saved)', {
              when: new Date().toISOString(),
              messageId,
              agentId: aid,
              source: 'debounceUpdateMessage:create',
            });

            // Update agent entity to link message
            const agentRepo = transaction.getRepository(AgentInstanceEntity);
            const agentEntity = await agentRepo.findOne({ where: { id: aid }, relations: { messages: true } });
            if (agentEntity) {
              if (!agentEntity.messages) agentEntity.messages = [];
              agentEntity.messages.push(newMessage);
              await agentRepo.save(agentEntity);

              const updatedAgent: AgentInstance = {
                ...pick(agentEntity, AGENT_INSTANCE_FIELDS),
                aiApiConfig: agentEntity.aiApiConfig,
                systemPrompt: '',
                tools: [],
                description: '',
                version: '1',
                messages: agentEntity.messages,
              };
              onNewMessage?.(aid, updatedAgent);
            } else {
              logger.warn(`Agent instance not found for message: ${messageId}`);
            }
          } else {
            logger.warn(`Cannot create message: missing agent ID for message ID: ${messageId}`);
          }
        });
      } catch (error) {
        logger.error('Failed to update/create message content', { error });
      }
    },
    debounceMs,
  );
}
