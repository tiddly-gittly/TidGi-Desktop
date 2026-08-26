/**
 * Database-compatible utility functions for agent instance service.
 * These are TypeORM-specific helpers, not domain factories.
 * Domain factories live in memeloop core (createChatMessage, createAgentInstanceFromDefinition).
 */
import type { AgentInstance, ChatMessage } from 'memeloop';

/**
 * Message fields to be extracted when creating message entities
 */
export const MESSAGE_FIELDS = [
  'messageId',
  'conversationId',
  'originNodeId',
  'originSequence',
  'turnId',
  'timestamp',
  'lamportClock',
  'role',
  'content',
  'parts',
  'toolCalls',
  'attachments',
  'detailRef',
  'reasoning_content',
  'contentType',
  'hidden',
  'metadata',
  'duration',
] as const;

/**
 * Convert ChatMessage to database-compatible format
 * Handles null duration values by converting them to undefined
 */
export function toDatabaseCompatibleMessage(
  message: ChatMessage,
): Omit<ChatMessage, 'duration'> & {
  duration?: number;
  isContextCompaction: boolean;
  originSequence: number;
  turnId: string;
} {
  const { duration, ...rest } = message;
  const coordinates = message as ChatMessage & { originSequence?: number; turnId?: string };
  if (!Number.isSafeInteger(coordinates.originSequence) || (coordinates.originSequence ?? 0) <= 0) {
    throw new Error('conversation_event_origin_sequence_required');
  }
  if (!coordinates.turnId) throw new Error('conversation_event_turn_id_required');
  return {
    ...rest,
    originSequence: coordinates.originSequence,
    turnId: coordinates.turnId,
    duration: duration === null ? undefined : duration,
    isContextCompaction: message.metadata?.contextCompaction !== undefined,
  };
}

/**
 * Convert AgentInstance data to database-compatible format
 * Handles null duration values in messages by converting them to undefined
 */
export function toDatabaseCompatibleInstance(
  instance: Omit<AgentInstance, 'created' | 'modified'>,
): Omit<AgentInstance, 'created' | 'modified' | 'messages'> & {
  messages: Array<
    Omit<ChatMessage, 'duration'> & {
      duration?: number;
      isContextCompaction: boolean;
      originSequence: number;
      turnId: string;
    }
  >;
} {
  return {
    ...instance,
    messages: instance.messages.map(toDatabaseCompatibleMessage),
  };
}

/**
 * Agent instance fields to be extracted when retrieving instances
 */
export const AGENT_INSTANCE_FIELDS = [
  'id',
  'agentDefId',
  'name',
  'status',
  'created',
  'modified',
  'avatarUrl',
  'modelConfig',
  'agentFrameworkConfig',
  'closed',
  'volatile',
] as const;
