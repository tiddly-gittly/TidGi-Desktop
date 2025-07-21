/**
 * Unified tool calling plugin
 * Handles both response processing and handler hooks for tool execution
 */
import { matchToolCalling } from '@services/agentDefinition/responsePatternUtility';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { AgentInstanceMessage, IAgentInstanceService } from '../../interface';
import { HandlerPlugin, PromptConcatPlugin, ResponseHookContext, ToolExecutionContext } from './types';

/**
 * Tool calling response plugin
 * Detects and parses tool calls in AI responses
 */
export const toolCallingResponsePlugin: PromptConcatPlugin = (hooks) => {
  hooks.postProcess.tapAsync('toolCallingPlugin', (context, callback) => {
    const responseContext = context as ResponseHookContext;
    const { pluginConfig, llmResponse } = responseContext;

    if (pluginConfig.pluginId !== 'toolCalling') {
      callback();
      return;
    }

    try {
      // Use matchToolCalling to detect tool calls in the full LLM response
      const toolMatch = matchToolCalling(llmResponse);

      if (toolMatch.found && toolMatch.toolId && toolMatch.parameters) {
        logger.info('Tool call detected in LLM response', {
          toolId: toolMatch.toolId,
          parameters: toolMatch.parameters,
          pluginId: pluginConfig.id,
          originalText: toolMatch.originalText,
        });

        // Set actions to continue round and pass tool call info
        if (!responseContext.actions) {
          responseContext.actions = {};
        }
        responseContext.actions.yieldNextRoundTo = 'self'; // Continue with AI after tool execution
        responseContext.actions.toolCalling = toolMatch;

        // Update context metadata to indicate processing was successful
        if (responseContext.metadata) {
          responseContext.metadata.toolCallsProcessed = true;
          responseContext.metadata.toolId = toolMatch.toolId;
        }

        logger.debug('Tool calling plugin set yieldNextRoundTo=self with tool info', {
          toolId: toolMatch.toolId,
          pluginId: pluginConfig.id,
        });
      } else {
        logger.debug('No tool calls found in LLM response', {
          pluginId: pluginConfig.id,
        });
      }

      callback();
    } catch (error) {
      logger.error('Tool calling plugin error', {
        error: error instanceof Error ? error.message : String(error),
        pluginId: pluginConfig.id,
      });
      callback();
    }
  });
};

/**
 * Tool execution history plugin
 * Handles tool execution results and adds them to message history
 */
export const toolExecutionHistoryPlugin: HandlerPlugin = (hooks) => {
  hooks.toolExecuted.tapAsync('toolExecutionHistoryPlugin', (context: ToolExecutionContext, callback) => {
    try {
      const { handlerContext, toolResult, toolInfo } = context;

      // Create tool result message
      const toolMessage: AgentInstanceMessage = {
        id: `tool-result-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        agentId: handlerContext.agent.id,
        role: 'tool',
        content: toolResult.success
          ? `Tool execution result:\n\n${toolResult.data || 'Tool executed successfully but returned no data'}`
          : `Tool execution failed: ${toolResult.error}`,
        metadata: {
          toolSuccess: toolResult.success,
          toolError: toolResult.error,
          executedAt: new Date().toISOString(),
          toolId: toolInfo.toolId,
          toolParameters: toolInfo.parameters,
        },
        modified: new Date(),
      };

      // Add to message history
      handlerContext.agent.messages.push(toolMessage);

      // Update UI using the agent instance service
      try {
        const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
        agentInstanceService.debounceUpdateMessage(toolMessage, handlerContext.agent.id);
      } catch (serviceError) {
        logger.warn('Failed to update UI for tool message', {
          error: serviceError instanceof Error ? serviceError.message : String(serviceError),
          messageId: toolMessage.id,
        });
      }

      logger.info('Tool execution result added to message history', {
        toolSuccess: toolResult.success,
        hasData: !!toolResult.data,
        messageId: toolMessage.id,
        toolId: toolInfo.toolId,
      });

      callback();
    } catch (error) {
      logger.error('Tool execution history plugin error', {
        error: error instanceof Error ? error.message : String(error),
      });
      callback();
    }
  });
};
