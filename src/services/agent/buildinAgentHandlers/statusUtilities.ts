import { AgentInstanceLatestStatus } from '@services/agent/interface';
import { nanoid } from 'nanoid';
import { AgentHandlerContext } from './type';

/**
 * Creates a working status with a message
 * @param content Message content
 * @param context Agent handler context
 * @param messageId Optional message ID, if not provided, a new ID will be generated
 * @returns AgentInstanceLatestStatus with working state
 */
export function working(
  content: string,
  context: AgentHandlerContext,
  messageId?: string,
): AgentInstanceLatestStatus {
  return {
    state: 'working',
    message: {
      id: messageId || nanoid(),
      agentId: context.agent.id,
      role: 'agent',
      content,
    },
  };
}

/**
 * Creates a completed status with a message
 * @param content Message content
 * @param context Agent handler context
 * @param messageId Optional message ID, if not provided, a new ID will be generated
 * @returns AgentInstanceLatestStatus with completed state
 */
export function completed(
  content: string,
  context: AgentHandlerContext,
  messageId?: string,
): AgentInstanceLatestStatus {
  return {
    state: 'completed',
    message: {
      id: messageId || nanoid(),
      agentId: context.agent.id,
      role: 'agent',
      content,
    },
  };
}

/**
 * Creates a canceled status
 * @returns AgentInstanceLatestStatus with canceled state
 */
export function canceled(): AgentInstanceLatestStatus {
  return { state: 'canceled' };
}
