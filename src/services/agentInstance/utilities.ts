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
  handlerConfig?: Record<string, unknown>;
  handlerID?: string;
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
  const { avatarUrl, aiApiConfig, handlerConfig, handlerID } = agentDefinition;

  const instanceData = {
    id: instanceId,
    agentDefId: agentDefinition.id,
    name: `${agentDefinition.name} - ${new Date().toLocaleString()}`,
    status: initialStatus,
    avatarUrl,
    aiApiConfig,
    handlerConfig,
    handlerID,
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
  message: Pick<AgentInstanceMessage, 'role' | 'content' | 'contentType' | 'metadata'>,
): AgentInstanceMessage {
  return {
    id,
    agentId,
    role: message.role,
    content: message.content,
    contentType: message.contentType || 'text/plain',
    modified: new Date(),
    metadata: message.metadata,
  };
}

/**
 * Message fields to be extracted when creating message entities
 */
export const MESSAGE_FIELDS = ['id', 'agentId', 'role', 'content', 'contentType', 'metadata'] as const;

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
  'handlerConfig',
  'closed',
] as const;
