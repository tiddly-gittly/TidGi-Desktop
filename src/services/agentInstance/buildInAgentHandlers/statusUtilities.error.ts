/**
 * Extension to statusUtilities with error handling functionality
 */

import { nanoid } from 'nanoid';
import { AgentInstanceLatestStatus } from '../interface';
import { AgentHandlerContext } from './type';

/**
 * Creates a completed status with error information in message metadata
 * @param message Error message content
 * @param errorDetail Error detail object to include in metadata
 * @param context Agent handler context
 * @param messageId Optional message ID, if not provided, a new ID will be generated
 * @returns AgentInstanceLatestStatus with completed state and error metadata
 */
export function completedWithError(
  message: string,
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
      content: message,
      metadata: {
        errorDetail,
      },
    },
  };
}
