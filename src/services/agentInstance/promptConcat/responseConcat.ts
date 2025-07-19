/**
 * Response concatenation and processing with plugin-based architecture
 *
 * Handles response modifications and processing through tapable hooks
 */
import { logger } from '@services/libs/log';
import { cloneDeep } from 'lodash';
import { AgentHandlerContext } from '../buildInAgentHandlers/type';
import { AgentInstanceMessage } from '../interface';
import { AgentPromptDescription } from './promptConcatSchema';
import { Plugin } from './promptConcatSchema/plugin';
import { PromptConcatHooks, PromptConcatHookContext, builtInPlugins } from './plugins';
import { ResponseHookContext, AgentResponse } from './plugins/types';

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
  needsNewLLMCall: boolean;
  newUserMessage?: string;
}> {
  logger.debug('Starting response processing', {
    method: 'responseConcat',
    agentId: context.agent.id,
    configId: agentConfig.id,
    responseLength: llmResponse.length,
  });
  
  const { promptConfig } = agentConfig;
  const responses = Array.isArray(promptConfig.response) ? promptConfig.response : [];
  const plugins = Array.isArray(promptConfig.plugins) ? promptConfig.plugins : [];
  
  logger.debug('Response configuration loaded', {
    hasResponses: responses.length > 0,
    responseCount: responses.length,
    pluginCount: plugins.length,
  });
  
  const responsesCopy = cloneDeep(responses);
  let modifiedResponses: AgentResponse[] = responsesCopy;
  
  // Create hooks instance
  const hooks = new PromptConcatHooks();
  
  // Register all plugins from configuration (no need to filter by type)
  for (const plugin of plugins) {
    const builtInPlugin = builtInPlugins.get(plugin.pluginId);
    if (builtInPlugin) {
      hooks.registerPlugin(builtInPlugin);
      logger.debug('Registered response plugin', {
        pluginId: plugin.pluginId,
        pluginInstanceId: plugin.id,
      });
    } else {
      logger.warn(`No built-in plugin found for response pluginId: ${plugin.pluginId}`);
    }
  }
  
  // Process each plugin through hooks
  let needsNewLLMCall = false;
  let newUserMessage: string | undefined;
  
  for (const plugin of plugins) {
    const responseContext: ResponseHookContext = {
      messages,
      prompts: [], // Not used in response processing
      plugin,
      llmResponse,
      responses: modifiedResponses,
      metadata: {},
    };
    
    try {
      const result = await hooks.postProcess.promise(responseContext) as ResponseHookContext;
      
      // Update responses if they were modified in the context
      modifiedResponses = result.responses;
      
      // Check if plugin indicated need for new LLM call
      if (result.metadata?.needsNewLLMCall) {
        needsNewLLMCall = true;
        if (result.metadata.newUserMessage) {
          newUserMessage = result.metadata.newUserMessage;
        }
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
    needsNewLLMCall,
    hasNewUserMessage: !!newUserMessage,
  });
  
  return {
    processedResponse,
    needsNewLLMCall,
    newUserMessage,
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
