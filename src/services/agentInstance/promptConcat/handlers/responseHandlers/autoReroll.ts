/**
 * Auto reroll response processing handler
 *
 * Automatically regenerates responses that match certain criteria
 */
import { AgentHandlerContext } from '@services/agentInstance/buildInAgentHandlers/type';
import { logger } from '@services/libs/log';
import { AgentResponse, ResponseDynamicModification } from '../shared/types';
import { findResponseById } from './responseUtilities';

// Map to track retry counts for each response target
const retryCountMap = new Map<string, number>();

/**
 * Auto reroll handler
 * Automatically regenerates responses that match unwanted patterns
 *
 * @param responses Current response array
 * @param modification Modification configuration
 * @param context Handler context
 * @returns Processing result with modified responses and processing flags
 */
export async function handleAutoReroll(
  responses: AgentResponse[],
  modification: ResponseDynamicModification,
  context: AgentHandlerContext,
): Promise<{
  responses: AgentResponse[];
  processed: boolean;
  newLLMCall?: boolean;
  newUserMessage?: string;
}> {
  // Early return if no autoRerollParam or no responses
  if (!modification.autoRerollParam || responses.length === 0) {
    logger.debug('Skipping auto reroll', {
      hasParam: !!modification.autoRerollParam,
      responseCount: responses.length,
      modificationId: modification.id,
    });
    return { responses, processed: false };
  }

  const { targetId, search, maxRetry } = modification.autoRerollParam;

  // Find the target response by ID
  const found = findResponseById(responses, targetId);

  if (!found || !found.response.text) {
    logger.warn('Auto reroll target not found or has no text', {
      targetId,
      hasText: !!found?.response.text,
      modificationId: modification.id,
    });
    return { responses, processed: false };
  }

  const targetText = found.response.text;

  // Generate a unique key for tracking retry counts
  const retryKey = `${context.agent.id}:${targetId}:${modification.id}`;

  // Get current retry count or initialize to 0
  const currentRetryCount = retryCountMap.get(retryKey) || 0;

  // If we've reached max retries, log and return without reroll
  if (currentRetryCount >= maxRetry) {
    logger.warn('Max auto reroll attempts reached', {
      targetId,
      maxRetry,
      currentRetryCount,
      modificationId: modification.id,
    });
    // Reset retry count for future conversations
    retryCountMap.delete(retryKey);
    return { responses, processed: false };
  }

  // Check if the response contains the search pattern
  if (targetText.includes(search)) {
    logger.info('Auto reroll triggered - unwanted content detected', {
      targetId,
      search,
      currentRetryCount,
      modificationId: modification.id,
    });

    // Increment and store retry count
    retryCountMap.set(retryKey, currentRetryCount + 1);

    // Return result indicating we need a new LLM call
    return {
      responses,
      processed: true,
      newLLMCall: true, // Request a new generation
      // We don't provide a new user message, so it will regenerate with the same prompt
    };
  }

  // If the response doesn't contain the unwanted content, reset retry count
  if (currentRetryCount > 0) {
    logger.debug('Auto reroll no longer needed - clearing retry count', {
      targetId,
      prevRetryCount: currentRetryCount,
      modificationId: modification.id,
    });
    retryCountMap.delete(retryKey);
  }

  // No reroll needed
  return { responses, processed: false };
}
