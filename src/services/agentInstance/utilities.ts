/**
 * Utility functions and constants for agent instance service
 */
import type { AgentDefinition, AgentInstance, AgentInstanceLatestStatus, ChatMessage } from 'memeloop';
import { nanoid } from 'nanoid';

/**
 * Create initial data for a new agent instance
 * @param agentDefinition Agent definition
 * @returns Initial agent instance data
 */
export function createAgentInstanceData(agentDefinition: AgentDefinition): {
  instanceData: Omit<AgentInstance, 'created' | 'modified'>;
  instanceId: string;
  now: Date;
} {
  const instanceId = nanoid();
  const now = new Date();

  // Initialize agent status
  const initialStatus: AgentInstanceLatestStatus = {
    state: 'completed',
    modified: now,
  };

  const instanceData: Omit<AgentInstance, 'created' | 'modified'> = {
    ...agentDefinition,
    id: instanceId,
    agentDefId: agentDefinition.id,
    name: agentDefinition.name,
    status: initialStatus,
    messages: [],
    closed: false,
    volatile: false,
  };

  return { instanceData, instanceId, now };
}

/**
 * Create a new agent message object with required fields
 * @param id Message ID
 * @param agentId Agent instance ID
 * @param message Base message data
 * @returns Complete message object
 */
export function createAgentMessage(
  messageId: string,
  conversationId: string,
  message: Pick<ChatMessage, 'role' | 'content' | 'contentType' | 'metadata' | 'duration'>,
): ChatMessage {
  const now = Date.now();
  return {
    ...message,
    messageId,
    conversationId,
    originNodeId: 'tidgi-desktop',
    timestamp: now,
    lamportClock: now,
    role: message.role,
    content: message.content,
    contentType: message.contentType || 'text/plain',
    metadata: message.metadata,
    duration: message.duration === null ? undefined : message.duration,
  };
}

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
