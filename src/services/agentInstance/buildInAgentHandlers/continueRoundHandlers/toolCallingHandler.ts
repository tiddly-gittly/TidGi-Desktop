import { matchToolCalling } from '@services/agentDefinition/responsePatternUtility';
import { globalToolRegistry } from '@services/agentInstance/buildInAgentTools';
import { logger } from '@services/libs/log';
import { ContinueRoundHandler, ContinueRoundResult } from './types';

/**
 * Tool calling detection handler
 * Checks if the LLM response contains tool calling patterns and verifies the tool exists
 * Tool execution is now handled in basicPromptConcatHandler
 */
export const toolCallingHandler: ContinueRoundHandler = async (
  _agentConfig,
  llmResponse,
  _context,
): Promise<ContinueRoundResult> => {
  try {
    // Check for tool calling patterns in the response
    const toolMatch = matchToolCalling(llmResponse);

    if (toolMatch.found && toolMatch.toolId) {
      // Verify the tool exists in the registry
      const tool = globalToolRegistry.getTool(toolMatch.toolId);

      if (!tool) {
        logger.warn('Tool calling detected but tool not found in registry - will not continue', {
          toolId: toolMatch.toolId,
          originalText: toolMatch.originalText,
        });

        return {
          continue: false,
          reason: `Tool "${toolMatch.toolId}" not found in registry`,
        };
      }

      // Verify the parameters can be parsed and validated
      if (toolMatch.parameters) {
        try {
          // Try to validate parameters using the tool's schema
          const validationResult = tool.parameterSchema.safeParse(toolMatch.parameters);

          if (!validationResult.success) {
            logger.warn('Tool calling detected but parameters validation failed - will not continue', {
              toolId: toolMatch.toolId,
              parameters: toolMatch.parameters,
              validationError: validationResult.error.issues,
              originalText: toolMatch.originalText,
            });

            return {
              continue: false,
              reason: `Tool "${toolMatch.toolId}" parameters validation failed: ${validationResult.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
            };
          }
        } catch (error) {
          logger.warn('Tool calling detected but parameter validation threw error - will not continue', {
            toolId: toolMatch.toolId,
            parameters: toolMatch.parameters,
            error: error instanceof Error ? error.message : String(error),
          });

          return {
            continue: false,
            reason: `Tool "${toolMatch.toolId}" parameter validation error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      }

      logger.info('Tool calling detected, tool exists, and parameters are valid - will continue for tool execution', {
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
