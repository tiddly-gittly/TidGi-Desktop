import { IAgentDefinitionService } from '@services/agentDefinition/interface';
import { globalToolRegistry } from '@services/agentInstance/buildInAgentTools';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { AgentInstanceMessage } from '../../interface';
import { ContinueRoundHandler, ContinueRoundResult } from './types';

/**
 * Tool calling detection and execution handler
 * Checks if the LLM response contains tool calling patterns and executes them
 */
export const toolCallingHandler: ContinueRoundHandler = async (
  _agentConfig,
  llmResponse,
  context,
): Promise<ContinueRoundResult> => {
  try {
    const agentDefinitionService = container.get<IAgentDefinitionService>(serviceIdentifier.AgentDefinition);

    // Check for tool calling patterns in the response
    const toolMatch = await agentDefinitionService.matchToolCalling(llmResponse);

    if (toolMatch.found && toolMatch.toolId) {
      logger.info('Tool calling detected', {
        toolId: toolMatch.toolId,
        hasParameters: !!toolMatch.parameters,
        originalText: toolMatch.originalText,
      });

      // Get the tool from registry
      const tool = globalToolRegistry.getTool(toolMatch.toolId);
      if (tool) {
        // Execute the tool
        const toolResult = await tool.execute(toolMatch.parameters || {}, {
          workspaceId: context.agent.id,
          userMessages: context.agent.messages
            .filter(m => m.role === 'user')
            .map(m => m.content),
        });

        // Add tool result to conversation
        const toolResultMessage: AgentInstanceMessage = {
          id: `tool-result-${Date.now()}`,
          agentId: context.agent.id,
          role: 'assistant',
          content: toolResult.success
            ? `Tool "${toolMatch.toolId}" executed successfully. Result: ${JSON.stringify(toolResult.data)}`
            : `Tool "${toolMatch.toolId}" failed: ${toolResult.error}`,
          contentType: 'text/plain',
          modified: new Date(),
          metadata: {
            toolId: toolMatch.toolId,
            sourceType: 'toolCalling',
            toolResult,
            originalToolCall: toolMatch.originalText,
          },
        };

        // Push to messages, to be processed by next round
        context.agent.messages.push(toolResultMessage);

        logger.info('Tool result added to conversation', {
          toolId: toolMatch.toolId,
          success: toolResult.success,
          messageId: toolResultMessage.id,
        });

        return {
          continue: true,
          reason: `Tool "${toolMatch.toolId}" executed, continuing for AI to process result`,
        };
      } else {
        logger.warn('Tool not found in registry', {
          toolId: toolMatch.toolId,
        });

        return {
          continue: false,
          reason: `Tool "${toolMatch.toolId}" not found in registry`,
        };
      }
    }

    // No tool calling detected
    return {
      continue: false,
      reason: 'No tool calling patterns detected',
    };
  } catch (error) {
    logger.error('Error in tool calling detection/execution', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      continue: false,
      reason: `Tool calling handler error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};
