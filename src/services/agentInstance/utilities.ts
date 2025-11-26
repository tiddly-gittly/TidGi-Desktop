/**
 * Utility functions and constants for agent instance service
 */
import { nanoid } from 'nanoid';
import { AgentInstance, AgentInstanceLatestStatus, AgentInstanceMessage } from './interface';

/**
 * Create initial data for a new agent instance
 * @param agentDefinition Agent definition
 * @returns Initial agent instance data
 */
export function createAgentInstanceData(agentDefinition: {
  id: string;
  name: string;
  avatarUrl?: string;
  aiApiConfig?: Record<string, unknown>;
  agentFrameworkConfig?: Record<string, unknown>;
  agentFrameworkID?: string;
}): {
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

  // Extract necessary fields from agent definition
  const { avatarUrl, aiApiConfig, agentFrameworkID } = agentDefinition;

  const instanceData = {
    id: instanceId,
    agentDefId: agentDefinition.id,
    name: agentDefinition.name,
    status: initialStatus,
    avatarUrl,
    aiApiConfig,
    // Don't copy agentFrameworkConfig to instance - it should fallback to definition
    agentFrameworkConfig: undefined,
    agentFrameworkID,
    messages: [],
    closed: false,
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
  id: string,
  agentId: string,
  message: Pick<AgentInstanceMessage, 'role' | 'content' | 'contentType' | 'metadata' | 'duration'>,
): AgentInstanceMessage {
  return {
    id,
    agentId,
    role: message.role,
    content: message.content,
    contentType: message.contentType || 'text/plain',
    created: new Date(),
    modified: new Date(),
    metadata: message.metadata,
    // Convert null to undefined for database compatibility
    duration: message.duration === null ? undefined : message.duration,
  };
}

/**
 * Message fields to be extracted when creating message entities
 */
export const MESSAGE_FIELDS = ['id', 'agentId', 'role', 'content', 'contentType', 'metadata', 'created', 'duration'] as const;

/**
 * Convert AgentInstanceMessage to database-compatible format
 * Handles null duration values by converting them to undefined
 */
export function toDatabaseCompatibleMessage(message: AgentInstanceMessage): Omit<AgentInstanceMessage, 'duration'> & { duration?: number } {
  const { duration, ...rest } = message;
  return {
    ...rest,
    created: rest.created ?? new Date(),
    duration: duration === null ? undefined : duration,
  };
}

/**
 * Convert AgentInstance data to database-compatible format
 * Handles null duration values in messages by converting them to undefined
 */
export function toDatabaseCompatibleInstance(
  instance: Omit<AgentInstance, 'created' | 'modified'>,
): Omit<AgentInstance, 'created' | 'modified' | 'messages'> & { messages: Array<Omit<AgentInstanceMessage, 'duration'> & { duration?: number }> } {
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
] as const;
