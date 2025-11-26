/**
 * Response concatenation and processing with plugin-based architecture
 *
 * Handles response modifications and processing through tapable hooks
 */
import { ToolCallingMatch } from '@services/agentDefinition/interface';
import { logger } from '@services/libs/log';
import { cloneDeep } from 'lodash';
import { AgentFrameworkContext } from '../agentFrameworks/utilities/type';
import { AgentInstanceMessage } from '../interface';
import { builtInTools, createAgentFrameworkHooks } from '../tools';
import { AgentResponse, PostProcessContext, YieldNextRoundTarget } from '../tools/types';
import type { IPromptConcatTool } from './promptConcatSchema';
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
  context: AgentFrameworkContext,
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
  const agentFrameworkConfig = handlerConfig;
  const responses: HandlerConfig['response'] = Array.isArray(agentFrameworkConfig.response) ? agentFrameworkConfig.response : [];
  const toolConfigs = (Array.isArray(agentFrameworkConfig.plugins) ? agentFrameworkConfig.plugins : []) as IPromptConcatTool[];

  let modifiedResponses = cloneDeep(responses) as AgentResponse[];
  // Create hooks instance
  const hooks = createAgentFrameworkHooks();
  // Register all tools from configuration
  for (const tool of toolConfigs) {
    const builtInTool = builtInTools.get(tool.toolId);
    if (builtInTool) {
      builtInTool(hooks);
    } else {
      logger.warn(`No built-in tool found for response toolId: ${tool.toolId}`);
    }
  }

  // Process each tool through hooks
  let yieldNextRoundTo: YieldNextRoundTarget | undefined;
  let toolCallInfo: ToolCallingMatch | undefined;

  for (const tool of toolConfigs) {
    const responseContext: PostProcessContext = {
      agentFrameworkContext: context,
      messages,
      prompts: [], // Not used in response processing
      toolConfig: tool,
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

      // Check if tool indicated need for new LLM call via actions
      if (result.actions?.yieldNextRoundTo) {
        yieldNextRoundTo = result.actions.yieldNextRoundTo;
        if (result.actions.toolCalling) {
          toolCallInfo = result.actions.toolCalling;
        }
        logger.debug('Tool requested yield next round', {
          toolId: tool.toolId,
          toolInstanceId: tool.id,
          yieldNextRoundTo,
          hasToolCall: !!result.actions.toolCalling,
        });
      }

      logger.debug('Response tool processed successfully', {
        toolId: tool.toolId,
        toolInstanceId: tool.id,
      });
    } catch (error) {
      logger.error('Response tool processing error', {
        toolId: tool.toolId,
        toolInstanceId: tool.id,
        error,
      });
      // Continue processing other tools even if one fails
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
