/**
 * Response concatenation and processing
 *
 * Handles response modifications and processing
 */
import { logger } from '@services/libs/log';
import { cloneDeep } from 'lodash';
import { AgentHandlerContext } from '../buildInAgentHandlers/type';
import { AgentResponse } from './handlers/shared/types';
import { AgentPromptDescription, ResponseDynamicModification } from './promptConcatSchema';

/**
 * Response dynamic modification handler function type
 */
export type ResponseDynamicModificationHandler = (
  responses: AgentResponse[],
  modification: ResponseDynamicModification,
  llmResponse: string,
  context: AgentHandlerContext,
) => Promise<AgentResponse[]>;

/**
 * Response processing handler function type
 */
export type ResponseProcessingHandler = (
  responses: AgentResponse[],
  modification: ResponseDynamicModification,
  context: AgentHandlerContext,
) => Promise<{
  responses: AgentResponse[];
  processed: boolean;
  newLLMCall?: boolean;
  newUserMessage?: string;
}>;

/**
 * Response dynamic modification handler registry
 */
const responseDynamicModificationHandlers: Record<string, ResponseDynamicModificationHandler | undefined> = {};

/**
 * Response processing handler registry
 */
const responseProcessingHandlers: Record<string, ResponseProcessingHandler | undefined> = {};

/**
 * Register response dynamic modification handler
 */
export function registerResponseDynamicModificationHandler(
  type: string,
  handler: ResponseDynamicModificationHandler,
): void {
  responseDynamicModificationHandlers[type] = handler;
}

/**
 * Register response processing handler
 */
export function registerResponseProcessingHandler(
  type: string,
  handler: ResponseProcessingHandler,
): void {
  responseProcessingHandlers[type] = handler;
}

/**
 * Process response configuration, apply dynamic modifications, and return final response
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

  // Get response configuration (ensuring we handle all possible shapes)
  const { promptConfig } = agentConfig;
  // Extract responses with proper type checking
  const responses = Array.isArray(promptConfig.response) ? promptConfig.response : [];

  logger.debug('Response configuration loaded', {
    hasResponses: responses.length > 0,
    responseCount: responses.length,
  });

  // 1. Clone response configuration for modification
  const responsesCopy = cloneDeep(responses);

  // 2. Apply dynamic modifications to responses
  let modifiedResponses: AgentResponse[] = responsesCopy;
  const responseDynamicModifications = Array.isArray(promptConfig.responseDynamicModification)
    ? promptConfig.responseDynamicModification
    : [];

  logger.debug('Response dynamic modifications loaded', {
    modificationCount: responseDynamicModifications.length,
    types: responseDynamicModifications
      .filter(mod => mod.dynamicModificationType)
      .map(mod => mod.dynamicModificationType),
  });

  // Process dynamic modifications first
  for (const modification of responseDynamicModifications) {
    if (modification.dynamicModificationType) {
      const handler = responseDynamicModificationHandlers[modification.dynamicModificationType];

      logger.debug('Processing response dynamic modification', {
        modificationType: modification.dynamicModificationType,
        targetId: modification.fullReplacementParam?.targetId,
        handlerAvailable: !!handler,
      });

      if (handler) {
        modifiedResponses = await handler(modifiedResponses, modification, llmResponse, context);
      } else {
        logger.warn(`No handler found for response dynamic modification type: ${modification.dynamicModificationType}`);
      }
    }
  }

  // 3. Apply response processing
  let finalResponses = modifiedResponses;
  let needsNewLLMCall = false;
  let newUserMessage: string | undefined;

  for (const modification of responseDynamicModifications) {
    if (modification.responseProcessingType) {
      const handler = responseProcessingHandlers[modification.responseProcessingType];

      logger.debug('Processing response post-processing', {
        processingType: modification.responseProcessingType,
        handlerAvailable: !!handler,
      });

      if (handler) {
        const result = await handler(finalResponses, modification, context);
        finalResponses = result.responses;

        if (result.newLLMCall) {
          needsNewLLMCall = true;
          if (result.newUserMessage) {
            newUserMessage = result.newUserMessage;
          }

          logger.debug('Response processing triggered new LLM call', {
            processingType: modification.responseProcessingType,
            hasNewUserMessage: !!result.newUserMessage,
          });
        }
      } else {
        logger.warn(`No handler found for response processing type: ${modification.responseProcessingType}`);
      }
    }
  }

  // 4. Flatten responses to a single string
  const processedResponse = flattenResponses(finalResponses);

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
