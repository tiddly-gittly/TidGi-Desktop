/**
 * Full replacement response dynamic modification handler
 *
 * Completely replaces target content with LLM response
 */
import { AgentHandlerContext } from '@services/agentInstance/buildInAgentHandlers/type';
import { logger } from '@services/libs/log';
import { AgentResponse, ResponseDynamicModification } from '../shared/types';
import { findResponseById } from './responseUtilities';

/**
 * Full replacement handler
 * Completely replaces target content with LLM response
 *
 * @param responses Current response array
 * @param modification Modification configuration
 * @param llmResponse Raw LLM response
 * @param context Handler context
 * @returns Modified responses
 */
export async function handleFullReplacement(
  responses: AgentResponse[],
  modification: ResponseDynamicModification,
  llmResponse: string,
  _context: AgentHandlerContext,
): Promise<AgentResponse[]> {
  // Early return if no fullReplacementParam or no responses
  if (!modification.fullReplacementParam || responses.length === 0) {
    logger.debug('Skipping full replacement', {
      hasParam: !!modification.fullReplacementParam,
      responseCount: responses.length,
      modificationId: modification.id,
    });
    return responses;
  }

  const { targetId, sourceType } = modification.fullReplacementParam;

  // Find the target response by ID
  const found = findResponseById(responses, targetId);

  if (!found) {
    logger.warn('Full replacement target not found', {
      targetId,
      modificationId: modification.id,
    });
    return responses;
  }

  // Process based on source type
  if (sourceType === 'llmResponse') {
    logger.debug('Replacing target with LLM response', {
      targetId,
      responseLength: llmResponse.length,
      modificationId: modification.id,
    });

    // Replace target content with LLM response
    found.response.text = llmResponse;
  } else {
    logger.warn('Unsupported source type for full replacement', {
      sourceType: String(sourceType),
      modificationId: modification.id,
    });
  }

  return responses;
}
