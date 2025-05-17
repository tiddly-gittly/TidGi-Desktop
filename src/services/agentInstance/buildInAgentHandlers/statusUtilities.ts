import { nanoid } from 'nanoid';
import { AgentInstanceLatestStatus } from '../interface';
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

/**
 * Creates a completed status with error information
 * @param content Error message content
 * @param errorDetail Error detail object
 * @param context Agent handler context
 * @param messageId Optional message ID, if not provided, a new ID will be generated
 * @returns AgentInstanceLatestStatus with completed state and error metadata
 */
export function error(
  content: string,
  errorDetail: {
    name: string;
    code: string;
    provider: string;
    message?: string;
  } | undefined,
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
      metadata: {
        errorDetail,
      },
    },
  };
}
