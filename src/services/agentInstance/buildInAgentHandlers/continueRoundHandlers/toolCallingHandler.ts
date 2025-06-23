import { IAgentDefinitionService } from '@services/agentDefinition/interface';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { ContinueRoundHandler, ContinueRoundResult } from './types';

/**
 * Tool calling detection handler
 * Only checks if the LLM response contains tool calling patterns and decides whether to continue
 * The actual tool execution is handled by retrievalAugmentedGenerationHandler
 */
export const toolCallingHandler: ContinueRoundHandler = async (
  _agentConfig,
  llmResponse,
  _context,
): Promise<ContinueRoundResult> => {
  try {
    const agentDefinitionService = container.get<IAgentDefinitionService>(serviceIdentifier.AgentDefinition);

    // Check for tool calling patterns in the response
    const toolMatch = await agentDefinitionService.matchToolCalling(llmResponse);

    if (toolMatch.found && toolMatch.toolId) {
      logger.info('Tool calling detected - will continue for tool execution', {
        toolId: toolMatch.toolId,
        hasParameters: !!toolMatch.parameters,
        originalText: toolMatch.originalText,
      });

      return {
        continue: true,
        reason: `Tool calling detected: "${toolMatch.toolId}", continuing for tool execution`,
      };
    }

    // No tool calling detected
    return {
      continue: false,
      reason: 'No tool calling patterns detected',
    };
  } catch (error) {
    logger.error('Error in tool calling detection', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      continue: false,
      reason: `Tool calling detection error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};
