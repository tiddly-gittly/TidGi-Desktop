import { container } from '@services/container';
import { IExternalAPIService } from '@services/externalAPI/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { merge } from 'lodash';
import { AgentInstanceLatestStatus, AgentInstanceMessage, IAgentInstanceService } from '../interface';
import { createHandlerHooks, registerBuiltInHandlerPlugins } from '../plugins';
import { AgentPromptDescription, AiAPIConfig, HandlerConfig } from '../promptConcat/promptConcatSchema';
import { responseConcat } from '../promptConcat/responseConcat';
import { getFinalPromptResult } from '../promptConcat/utils';
import { canceled, completed, error, working } from './statusUtilities';
import { AgentHandlerContext } from './type';

/**
 * Main conversation orchestrator for AI agents
 *
 * Responsibilities:
 * - Control flow between human users and AI models
 * - Coordinate with plugins for prompt processing and response handling
 * - Delegate prompt concatenation to plugin system
 * - Delegate AI API calls to externalAPIService
 * - Manage message history and conversation state
 * - Handle tool execution coordination
 * - Process yieldNextRoundTo actions from response plugins
 *
 * @param context - Agent handling context containing configuration and message history
 */
export async function* basicPromptConcatHandler(context: AgentHandlerContext) {
  // Initialize variables for request tracking
  let currentRequestId: string | undefined;
  let retryCount = 0;
  const maxRetries = 3;
  const lastUserMessage: AgentInstanceMessage | undefined = context.agent.messages[context.agent.messages.length - 1];

  // Create and register handler hooks
  const handlerHooks = createHandlerHooks();
  registerBuiltInHandlerPlugins(handlerHooks);

  // Log the start of handler execution with context information
  logger.debug('Starting prompt handler execution', {
    method: 'basicPromptConcatHandler',
    agentId: context.agent.id,
    defId: context.agentDef.id,
    handlerId: context.agentDef.handlerID,
    messageCount: context.agent.messages.length,
  });

  // Check if there's a new user message to process - trigger user message received hook
  // This is determined by checking if the last message is from user and hasn't been processed yet
  const isNewUserMessage = lastUserMessage.role === 'user' && !lastUserMessage.metadata?.processed;

  if (isNewUserMessage) {
    // Trigger user message received hook
    await handlerHooks.userMessageReceived.promise({
      handlerContext: context,
      content: {
        text: lastUserMessage.content,
        file: lastUserMessage.metadata?.file as File | undefined,
      },
      messageId: lastUserMessage.id,
      timestamp: lastUserMessage.modified || new Date(),
    });

    // Mark user message as processed
    lastUserMessage.metadata = { ...lastUserMessage.metadata, processed: true };

    // Trigger agent status change to working
    await handlerHooks.agentStatusChanged.promise({
      handlerContext: context,
      status: {
        state: 'working',
        modified: new Date(),
      },
    });
  }

  if (!lastUserMessage.content || lastUserMessage.role !== 'user') {
    logger.warn('No valid user message found', { method: 'basicPromptConcatHandler' });
    yield completed('No user message found to process.', context);
    return;
  }

  // Ensure AI configuration exists
  const externalAPIService = container.get<IExternalAPIService>(serviceIdentifier.ExternalAPI);
  const aiApiConfig: AiAPIConfig = merge(
    {},
    await externalAPIService.getAIConfig(),
    context.agentDef.aiApiConfig,
    context.agent.aiApiConfig,
  );

  // Check if cancelled by user
  if (context.isCancelled()) {
    yield canceled();
    return;
  }

  // Process prompts using common handler function
  try {
    const handlerConfig: HandlerConfig = context.agentDef.handlerConfig as HandlerConfig;
    const agentPromptDescription: AgentPromptDescription = {
      id: context.agentDef.id,
      api: aiApiConfig.api,
      modelParameters: aiApiConfig.modelParameters,
      handlerConfig,
    };

    const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
    // Generate AI response
    // Function to process a single LLM call with retry support
    async function* processLLMCall(_userMessage: string): AsyncGenerator<AgentInstanceLatestStatus> {
      try {
        // Delegate prompt concatenation to plugin system
        // Re-generate prompts to trigger middleware (including retrievalAugmentedGenerationHandler)
        // Get the final result from the stream using utility function
        const concatStream = agentInstanceService.concatPrompt(agentPromptDescription, context.agent.messages);
        const { flatPrompts } = await getFinalPromptResult(concatStream);

        logger.info('Starting AI generation', {
          method: 'processLLMCall',
          modelName: aiApiConfig.api.model,
          promptCount: flatPrompts.length,
          messageCount: context.agent.messages.length,
        });

        // Delegate AI API calls to externalAPIService
        for await (const response of externalAPIService.generateFromAI(flatPrompts, aiApiConfig)) {
          if (!currentRequestId && response.requestId) {
            currentRequestId = response.requestId;
          }

          if (context.isCancelled()) {
            logger.info('Request cancelled by user', {
              method: 'processLLMCall',
              requestId: currentRequestId,
            });

            if (currentRequestId) {
              await externalAPIService.cancelAIRequest(currentRequestId);
              yield canceled();
            }
            return;
          }

          if (response.status === 'update' || response.status === 'done') {
            const state = response.status === 'done' ? 'completed' : 'working';

            // Delegate response processing to handler hooks
            if (response.status === 'update') {
              await handlerHooks.responseUpdate.promise({
                handlerContext: context,
                response,
                requestId: currentRequestId,
                isFinal: false,
              });
            }

            if (state === 'completed') {
              logger.debug('AI generation completed', {
                method: 'processLLMCall',
                requestId: currentRequestId,
                contentLength: response.content.length || 0,
              });

              // Delegate final response processing to handler hooks
              await handlerHooks.responseComplete.promise({
                handlerContext: context,
                response,
                requestId: currentRequestId,
                isFinal: true,
              });

              // Delegate response processing to plugin system
              // Plugins can set yieldNextRoundTo actions to control conversation flow
              const processedResult = await responseConcat(agentPromptDescription, response.content, context, context.agent.messages);

              // Handle control flow based on plugin decisions
              if (processedResult.needsNewLLMCall) {
                // Control transfer: Continue with AI (yieldNextRoundTo: 'self')
                logger.debug('Response processing triggered new LLM call', {
                  method: 'processLLMCall',
                  hasNewUserMessage: !!processedResult.newUserMessage,
                  retryCount,
                });

                // Prevent infinite loops with retry limit
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
                // Yield current response as working state
                yield working(processedResult.processedResponse, context, currentRequestId);


                // Continue with new round - use provided message or last user message
                const nextUserMessage = processedResult.newUserMessage || lastUserMessage?.content;
                if (nextUserMessage) {
                  yield* processLLMCall(nextUserMessage);
                } else {
                  logger.warn('No message provided for continue round', {
                    method: 'basicPromptConcatHandler',
                    agentId: context.agent.id,
                  });
                  yield completed(processedResult.processedResponse, context, currentRequestId);
                }
                return;
              }

              // Control transfer: Return to human (yieldNextRoundTo: 'human' or default)
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
    yield* processLLMCall(lastUserMessage.content);
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
