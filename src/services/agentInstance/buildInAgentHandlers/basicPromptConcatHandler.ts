import { container } from '@services/container';
import { IExternalAPIService } from '@services/externalAPI/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { AgentInstanceLatestStatus, IAgentInstanceService } from '../interface';
import { processResponse } from '../promptConcat/handlers/responseHandler';
import { AgentPromptDescription, AiAPIConfig } from '../promptConcat/promptConcatSchema';
import { canceled, completed, error, working } from './statusUtilities';
import { AgentHandlerContext } from './type';

/**
 * Example agent handler
 * Generates responses based on AgentHandlerContext
 *
 * @param context - Agent handling context
 */
export async function* basicPromptConcatHandler(context: AgentHandlerContext) {
  // Initialize variables for request tracking
  let currentRequestId: string | undefined;
  let retryCount = 0;
  const maxRetries = 3;
  const lastUserMessage: string | undefined = context.agent.messages[context.agent.messages.length - 1]?.content;

  // Log the start of handler execution with context information
  logger.debug('Starting prompt handler execution', {
    method: 'basicPromptConcatHandler',
    agentId: context.agent.id,
    defId: context.agentDef.id,
    handlerId: context.agentDef.handlerID,
    messageCount: context.agent.messages.length,
  });

  // Get service instances
  const externalAPIService = container.get<IExternalAPIService>(serviceIdentifier.ExternalAPI);
  const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);

  // Get latest user message
  const messages = context.agent.messages;
  const [userMessage] = messages;
  if (messages.length === 0 || !userMessage.content || userMessage.role !== 'user') {
    logger.warn('No valid user message found', { method: 'basicPromptConcatHandler' });
    yield completed('No user message found to process.', context);
    return;
  }

  // Ensure AI configuration exists
  const aiApiConfig: AiAPIConfig = {
    ...await externalAPIService.getAIConfig(),
    ...context.agentDef.aiApiConfig,
    ...context.agent.aiApiConfig,
  };

  // Check if cancelled
  if (context.isCancelled()) {
    yield canceled();
    return;
  }

  // Process prompts using common handler function
  try {
    const handlerConfig = context.agentDef.handlerConfig || {};

    logger.debug('Creating prompt description from handler config', {
      hasHandlerConfig: Object.keys(handlerConfig).length > 0,
      handlerConfigKeys: Object.keys(handlerConfig),
    });

    const promptDescription = {
      id: context.agentDef.id,
      api: aiApiConfig.api,
      modelParameters: aiApiConfig.modelParameters,
      promptConfig: handlerConfig,
    } as AgentPromptDescription;

    const { flatPrompts } = await agentInstanceService.concatPrompt(promptDescription, context.agent.messages);

    logger.debug('Prompt concatenation result', {
      flatPromptCount: flatPrompts.length,
      roles: flatPrompts.map((p: { role?: string }) => p.role),
    });

    // Generate AI response
    // Function to process a single LLM call with retry support
    async function* processLLMCall(_userMessage: string): AsyncGenerator<AgentInstanceLatestStatus> {
      try {
        // Use prompt description from outer scope instead of fetching by ID
        const agentConfig = promptDescription;

        logger.info('Starting AI generation', {
          modelName: aiApiConfig.api.model,
          promptCount: flatPrompts.length,
          messageCount: context.agent.messages.length,
        });

        for await (const response of externalAPIService.generateFromAI(flatPrompts, aiApiConfig)) {
          if (!currentRequestId && response.requestId) {
            currentRequestId = response.requestId;
            logger.debug('Received request ID', {
              requestId: currentRequestId,
            });
          }

          if (context.isCancelled()) {
            logger.info('Request cancelled by user', {
              requestId: currentRequestId,
            });

            if (currentRequestId) {
              await externalAPIService.cancelAIRequest(currentRequestId);
            }
            yield canceled();
            return;
          }

          // Log response content for debugging
          logger.debug(`Response content from AI`, {
            status: response.status,
            contentLength: response.content.length,
            requestId: currentRequestId,
          });

          if (response.status === 'update' || response.status === 'done') {
            const state = response.status === 'done' ? 'completed' : 'working';

            logger.debug('Processing response', {
              status: response.status,
              state: state,
              contentLength: response.content.length || 0,
            });

            if (state === 'completed') {
              logger.info('AI generation completed', {
                requestId: currentRequestId,
                contentLength: response.content.length || 0,
              });

              // Process response with all registered handlers
              const processedResult = await processResponse(agentConfig, response.content, context);

              // Check if we need to trigger another LLM call
              if (processedResult.needsNewLLMCall) {
                logger.info('Response processing triggered new LLM call', {
                  hasNewUserMessage: !!processedResult.newUserMessage,
                  retryCount,
                });

                // If we've hit max retries, prevent infinite loops
                if (retryCount >= maxRetries) {
                  logger.warn('Maximum retry limit reached, returning final response', {
                    maxRetries,
                    retryCount,
                  });
                  yield completed(processedResult.processedResponse, context, currentRequestId);
                  return;
                }

                // Increment retry counter
                retryCount++;

                // Reset request ID for new call
                currentRequestId = undefined;

                // Start new generation with either provided message or last user message
                const nextUserMessage = processedResult.newUserMessage || lastUserMessage;

                // Yield the processed response first
                yield working(processedResult.processedResponse, context, currentRequestId);

                // Then trigger a new LLM call
                if (nextUserMessage) {
                  yield* processLLMCall(nextUserMessage);
                } else {
                  logger.warn('No new user message provided for retry', {
                    method: 'basicPromptConcatHandler',
                    agentId: context.agent.id,
                  });
                  yield completed(processedResult.processedResponse, context, currentRequestId);
                }
                return;
              }

              // No further processing needed, yield completed response
              yield completed(processedResult.processedResponse, context, currentRequestId);
            } else {
              yield working(response.content, context, currentRequestId);
            }
          } else if (response.status === 'error') {
            // Create message with error details in metadata
            const errorMessage = `Error: ${response.errorDetail?.message || 'Unknown error'}`;
            logger.error('Error in AI response', {
              errorMessage,
              errorDetail: response.errorDetail,
              requestId: currentRequestId,
            });
            yield error(errorMessage, response.errorDetail, context, currentRequestId);
            return;
          }
        }
        // Reset request ID after processing
        logger.debug('AI generation stream completed', {
          requestId: currentRequestId,
        });
        currentRequestId = undefined;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Unexpected error during AI generation', {
          error: errorMessage,
        });
        yield completed(`Unexpected error: ${errorMessage}`, context);
      } finally {
        if (context.isCancelled() && currentRequestId) {
          logger.debug('Cancelling AI request in finally block', {
            requestId: currentRequestId,
          });
          await externalAPIService.cancelAIRequest(currentRequestId);
        }
      }
    }

    // Start processing with the initial user message
    yield* processLLMCall(userMessage.content);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error processing prompt', {
      method: 'basicPromptConcatHandler',
      agentId: context.agent.id,
      error: errorMessage,
    });
    yield completed(`Error processing prompt: ${errorMessage}`, context);
  }
}
