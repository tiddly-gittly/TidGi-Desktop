/**
 * Tool calling response processing handler
 *
 * Processes tool function calls in responses
 */
import { AgentHandlerContext } from '@services/agentInstance/buildInAgentHandlers/type';
import { logger } from '@services/libs/log';
import { AgentResponse, ResponseDynamicModification } from '../shared/types';
import { parseRegexString } from '../shared/utilities';
import { findResponseById } from './responseUtilities';

/**
 * Tool calling handler
 * Extracts and processes function calls in responses
 *
 * @param responses Current response array
 * @param modification Modification configuration
 * @param _context Handler context (unused)
 * @returns Processing result with modified responses and processing flags
 */
export async function handleToolCalling(
  responses: AgentResponse[],
  modification: ResponseDynamicModification,
  _context: AgentHandlerContext,
): Promise<{
  responses: AgentResponse[];
  processed: boolean;
  newLLMCall?: boolean;
  newUserMessage?: string;
}> {
  try {
    // Early return if no toolCallingParam or no responses
    if (!modification.toolCallingParam || responses.length === 0) {
      logger.debug('Skipping tool calling', {
        hasParam: !!modification.toolCallingParam,
        responseCount: responses.length,
        modificationId: modification.id || 'unknown',
      });
      return { responses, processed: false };
    }

    const targetId = modification.toolCallingParam.targetId;
    const matchPattern = modification.toolCallingParam.match;

    // Find the target response by ID
    const found = findResponseById(responses, targetId);

    if (!found || !found.response.text) {
      logger.warn('Tool calling target not found or has no text', {
        targetId,
        hasText: !!found?.response.text,
        modificationId: modification.id,
      });
      return { responses, processed: false };
    }

    const targetText = found.response.text;

    // Create a RegExp from the match string
    // The match string is expected to be in the format of a regex literal with flags
    // e.g. "/<functions_result>(.+?)</functions_result>/gs"
    const matchRegex = parseRegexString(matchPattern);

    if (!matchRegex) {
      logger.error('Invalid regex pattern for tool calling', {
        match: matchPattern,
        modificationId: modification.id,
      });
      return { responses, processed: false };
    }

    // Test if the response contains any function calls
    const hasMatches = matchRegex.test(targetText);

    if (!hasMatches) {
      logger.debug('No tool calls found in response', {
        targetId,
        modificationId: modification.id,
      });
      return { responses, processed: false };
    }

    // Reset the lastIndex to start matching from the beginning
    matchRegex.lastIndex = 0;

    // Extract function calls from the response
    const matches: string[] = [];
    let matchResult;
    while ((matchResult = matchRegex.exec(targetText)) !== null) {
      if (matchResult[1]) {
        matches.push(matchResult[1]);
      }
    }

    if (matches.length === 0) {
      logger.debug('No capture groups found in tool call matches', {
        targetId,
        modificationId: modification.id,
      });
      return { responses, processed: false };
    }

    // Process the extracted function calls
    logger.info('Found tool calls in response', {
      count: matches.length,
      targetId,
      modificationId: modification.id,
    });

    // For tool calling, we typically want to remove the function call syntax from the response
    // and continue with the normal response flow without triggering a new LLM call
    const processedText = targetText.replace(matchRegex, '').trim();
    found.response.text = processedText;

    // In a real implementation, here would be the code to actually execute the tool functions
    // and potentially add their results to the response

    return {
      responses,
      processed: true,
      newLLMCall: false, // Usually tool calling doesn't trigger a new LLM call directly
    };
  } catch (error) {
    logger.error('Error in tool calling handler', {
      error: error instanceof Error ? error.message : String(error),
      modification: modification.id || 'unknown',
    });
    return { responses, processed: false };
  }
}
