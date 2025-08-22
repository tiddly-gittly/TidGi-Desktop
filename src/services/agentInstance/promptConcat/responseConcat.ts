/**
 * Response concatenation and processing with plugin-based architecture
 *
 * Handles response modifications and processing through tapable hooks
 */
import { ToolCallingMatch } from '@services/agentDefinition/interface';
import { logger } from '@services/libs/log';
import { cloneDeep } from 'lodash';
import { AgentHandlerContext } from '../buildInAgentHandlers/type';
import { AgentInstanceMessage } from '../interface';
import { builtInPlugins, createHandlerHooks } from '../plugins';
import { AgentResponse, PostProcessContext, YieldNextRoundTarget } from '../plugins/types';
import type { IPromptConcatPlugin } from './promptConcatSchema';
import { AgentPromptDescription, HandlerConfig } from './promptConcatSchema';

/**
 * Process response configuration, apply plugins, and return final response
 *
 * @param agentConfig Agent configuration
 * @param llmResponse Raw LLM response
 * @param context Handler context with history, etc.
 * @returns Processed response and flags for additional actions
 */
export async function responseConcat(
  agentConfig: AgentPromptDescription,
  llmResponse: string,
  context: AgentHandlerContext,
  messages: AgentInstanceMessage[] = [],
): Promise<{
  processedResponse: string;
  yieldNextRoundTo?: YieldNextRoundTarget;
  toolCallInfo?: ToolCallingMatch;
}> {
  logger.debug('Starting response processing', {
    method: 'responseConcat',
    agentId: context.agent.id,
    configId: agentConfig.id,
    responseLength: llmResponse.length,
  });

  const { handlerConfig } = agentConfig;
  const responses: HandlerConfig['response'] = Array.isArray(handlerConfig.response) ? handlerConfig.response : [];
  const plugins = (Array.isArray(handlerConfig.plugins) ? handlerConfig.plugins : []) as IPromptConcatPlugin[];

  let modifiedResponses = cloneDeep(responses) as AgentResponse[];
  // Create hooks instance
  const hooks = createHandlerHooks();
  // Register all plugins from configuration
  for (const plugin of plugins) {
    const builtInPlugin = builtInPlugins.get(plugin.pluginId);
    if (builtInPlugin) {
      builtInPlugin(hooks);
    } else {
      logger.warn(`No built-in plugin found for response pluginId: ${plugin.pluginId}`);
    }
  }

  // Process each plugin through hooks
  let yieldNextRoundTo: YieldNextRoundTarget | undefined;
  let toolCallInfo: ToolCallingMatch | undefined;

  for (const plugin of plugins) {
    const responseContext: PostProcessContext = {
      handlerContext: context,
      messages,
      prompts: [], // Not used in response processing
      pluginConfig: plugin,
      llmResponse,
      responses: modifiedResponses,
      metadata: {},
    };

    try {
      const result = await hooks.postProcess.promise(responseContext);

      // Update responses if they were modified in the context
      if (result.responses) {
        modifiedResponses = result.responses;
      }

      // Check if plugin indicated need for new LLM call via actions
      if (result.actions?.yieldNextRoundTo) {
        yieldNextRoundTo = result.actions.yieldNextRoundTo;
        if (result.actions.toolCalling) {
          toolCallInfo = result.actions.toolCalling;
        }
        logger.debug('Plugin requested yield next round', {
          pluginId: plugin.pluginId,
          pluginInstanceId: plugin.id,
          yieldNextRoundTo,
          hasToolCall: !!result.actions.toolCalling,
        });
      }

      logger.debug('Response plugin processed successfully', {
        pluginId: plugin.pluginId,
        pluginInstanceId: plugin.id,
      });
    } catch (error) {
      logger.error('Response plugin processing error', {
        pluginId: plugin.pluginId,
        pluginInstanceId: plugin.id,
        error,
      });
      // Continue processing other plugins even if one fails
    }
  }

  const processedResponse = flattenResponses(modifiedResponses);

  logger.debug('Response processing completed', {
    originalLength: llmResponse.length,
    processedLength: processedResponse.length,
    yieldNextRoundTo,
  });

  return {
    processedResponse,
    yieldNextRoundTo,
    toolCallInfo,
  };
}

/**
 * Converts responses to a single string
 */
function flattenResponses(responses: AgentResponse[]): string {
  if (responses.length === 0) {
    return '';
  }

  // For simplicity, we just concatenate all response texts
  return responses
    .filter(response => response.enabled !== false)
    .map(response => response.text || '')
    .join('\n\n')
    .trim();
}
