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
  'timestamp',
  'lamportClock',
  'role',
  'content',
  'toolCalls',
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
export function toDatabaseCompatibleMessage(message: ChatMessage): Omit<ChatMessage, 'duration'> & { duration?: number } {
  const { duration, ...rest } = message;
  return {
    ...rest,
    duration: duration === null ? undefined : duration,
  };
}

/**
 * Convert AgentInstance data to database-compatible format
 * Handles null duration values in messages by converting them to undefined
 */
export function toDatabaseCompatibleInstance(
  instance: Omit<AgentInstance, 'created' | 'modified'>,
): Omit<AgentInstance, 'created' | 'modified' | 'messages'> & { messages: Array<Omit<ChatMessage, 'duration'> & { duration?: number }> } {
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
  'aiApiConfig',
  'agentFrameworkConfig',
  'closed',
  'volatile',
] as const;
