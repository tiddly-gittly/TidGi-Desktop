/**
 * Main response handler integration
 *
 * Integrates all response handlers with the prompt concat handler
 */
import { logger } from '@services/libs/log';
import './responseHandlers/index'; // Import to register all handlers
import { AgentHandlerContext } from '@services/agentInstance/buildInAgentHandlers/type';
import { AgentPromptDescription } from '../promptConcatSchema';
import { responseConcat } from '../responseConcat';

/**
 * Process LLM response with all registered handlers
 *
 * @param agentConfig Agent configuration
 * @param llmResponse Raw LLM response
 * @param context Handler context with history, etc.
 * @returns Processed response, flags for additional actions
 */
export async function processResponse(
  agentConfig: AgentPromptDescription,
  llmResponse: string,
  context: AgentHandlerContext,
): Promise<{
  processedResponse: string;
  needsNewLLMCall: boolean;
  newUserMessage?: string;
}> {
  logger.debug('Processing response with all handlers', {
    method: 'processResponse',
    responseLength: llmResponse.length,
    agentId: context.agent.id,
  });

  try {
    // Use the central response processing function
    const result = await responseConcat(agentConfig, llmResponse, context);

    logger.debug('Response processing complete', {
      originalLength: llmResponse.length,
      processedLength: result.processedResponse.length,
      needsNewLLMCall: result.needsNewLLMCall,
      hasNewUserMessage: !!result.newUserMessage,
    });

    return result;
  } catch (error) {
    logger.error('Error in response processing', {
      error: error instanceof Error ? error.message : String(error),
      agentId: context.agent.id,
    });

    // Return original response with no additional actions
    return {
      processedResponse: llmResponse,
      needsNewLLMCall: false,
    };
  }
}
