/**
 * Auto reply response processing handler
 *
 * Automatically sends follow-up messages based on trigger conditions
 */
import { logger } from '@services/libs/log';
import { AgentHandlerContext } from '../../../buildInAgentHandlers/type';
import { AgentResponse, ResponseDynamicModification } from '../shared/types';
import { shouldTrigger } from '../shared/utilities';
import { findResponseById } from './responseUtilities';

// Map to track auto reply counts for each conversation
const autoReplyCountMap = new Map<string, number>();

/**
 * Auto reply handler
 * Automatically sends follow-up messages based on trigger conditions
 *
 * @param responses Current response array
 * @param modification Modification configuration
 * @param context Agent handler context
 * @returns Processing result with modified responses and processing flags
 */
export async function handleAutoReply(
  responses: AgentResponse[],
  modification: ResponseDynamicModification,
  context: AgentHandlerContext,
): Promise<{
  responses: AgentResponse[];
  processed: boolean;
  newLLMCall?: boolean;
  newUserMessage?: string;
}> {
  // Early return if no autoReplyParam or no responses
  if (!modification.autoReplyParam || responses.length === 0) {
    logger.debug('Skipping auto reply', {
      hasParam: !!modification.autoReplyParam,
      responseCount: responses.length,
      modificationId: modification.id || 'unknown',
    });
    return { responses, processed: false };
  }

  const { targetId, text, trigger, maxAutoReply } = modification.autoReplyParam;

  // Find the target response by ID
  const found = findResponseById(responses, targetId);

  if (!found || !found.response.text) {
    logger.warn('Auto reply target not found or has no text', {
      targetId,
      hasText: !!found?.response.text,
      modificationId: modification.id,
    });
    return { responses, processed: false };
  }

  const targetText = found.response.text;

  // Generate a unique key for tracking auto reply counts
  const replyKey = context.agent.id || 'unknown';

  // Get current auto reply count or initialize to 0
  const currentReplyCount = autoReplyCountMap.get(replyKey) || 0;

  // If we've reached max auto replies, log and return without reply
  if (currentReplyCount >= maxAutoReply) {
    logger.warn('Max auto reply count reached', {
      targetId,
      maxAutoReply,
      currentReplyCount,
      modificationId: modification.id,
    });
    return { responses, processed: false };
  }

  // Check if auto reply should be triggered
  const contextBase = { messages: context.agent.messages };
  const shouldAutoReply = await shouldTrigger(trigger, targetText, contextBase);

  if (shouldAutoReply) {
    logger.info('Auto reply triggered - conditions met', {
      targetId,
      currentReplyCount,
      modificationId: modification.id,
    });

    // Increment and store auto reply count
    autoReplyCountMap.set(replyKey, currentReplyCount + 1);

    // Return result indicating we need a new LLM call with the auto reply message
    return {
      responses,
      processed: true,
      newLLMCall: true,
      newUserMessage: text, // The text to send as an auto-reply
    };
  }

  // No auto reply needed
  return { responses, processed: false };
}
