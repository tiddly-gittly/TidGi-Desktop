import { container } from '@services/container';
import { IExternalAPIService } from '@services/externalAPI/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { merge } from 'lodash';
import { AgentInstanceLatestStatus, AgentInstanceMessage, IAgentInstanceService } from '../interface';
import { createHooksWithPlugins } from '../plugins';
import { YieldNextRoundTarget } from '../plugins/types';
import { AgentPromptDescription, AiAPIConfig, HandlerConfig } from '../promptConcat/promptConcatSchema';
import { IPromptConcatPlugin } from '../promptConcat/promptConcatSchema/plugin';
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
  const lastUserMessage: AgentInstanceMessage | undefined = context.agent.messages[context.agent.messages.length - 1];
  // Create and register handler hooks based on handler config
  const { hooks: handlerHooks, pluginConfigs } = await createHooksWithPlugins(context.agentDef.handlerConfig || {});

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
  const isNewUserMessage = !!lastUserMessage && lastUserMessage.role === 'user' && !lastUserMessage.metadata?.processed;

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

  if (!lastUserMessage || !lastUserMessage.content || lastUserMessage.role !== 'user') {
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
    async function* processLLMCall(): AsyncGenerator<AgentInstanceLatestStatus> {
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
              // For responseUpdate, we'll skip plugin-specific config for now
              // since it's called frequently during streaming
              await handlerHooks.responseUpdate.promise({
                handlerContext: context,
                response,
                requestId: currentRequestId,
                isFinal: false,
                pluginConfig: {} as IPromptConcatPlugin, // Empty config for streaming updates
              });
            }

            if (state === 'completed') {
              logger.debug('AI generation completed', {
                method: 'processLLMCall',
                requestId: currentRequestId,
                contentLength: response.content.length || 0,
              });

              // Delegate final response processing to handler hooks
              const responseCompleteContext = {
                handlerContext: context,
                response,
                requestId: currentRequestId,
                isFinal: true,
                pluginConfig: (pluginConfigs.length > 0 ? pluginConfigs[0] : {}) as IPromptConcatPlugin, // First config for compatibility
                handlerConfig: context.agentDef.handlerConfig, // Pass complete config for plugin access
                actions: undefined as { yieldNextRoundTo?: 'self' | 'human'; newUserMessage?: string } | undefined,
              };

              await handlerHooks.responseComplete.promise(responseCompleteContext);

              // Check if responseComplete hooks set yieldNextRoundTo
              let yieldNextRoundFromHooks: YieldNextRoundTarget | undefined;
              if (responseCompleteContext.actions?.yieldNextRoundTo) {
                yieldNextRoundFromHooks = responseCompleteContext.actions.yieldNextRoundTo;
                logger.debug('Response complete hooks triggered yield next round', {
                  method: 'processLLMCall',
                  yieldNextRoundTo: yieldNextRoundFromHooks,
                });
              }

              // Delegate response processing to plugin system
              // Plugins can set yieldNextRoundTo actions to control conversation flow
              const processedResult = await responseConcat(agentPromptDescription, response.content, context, context.agent.messages);

              // Handle control flow based on plugin decisions or responseComplete hooks
              const shouldContinue = processedResult.yieldNextRoundTo === 'self' || yieldNextRoundFromHooks === 'self';
              if (shouldContinue) {
                // Control transfer: Continue with AI (yieldNextRoundTo: 'self')
                logger.debug('Response processing triggered new LLM call', {
                  method: 'processLLMCall',
                  fromResponseConcat: processedResult.yieldNextRoundTo,
                  fromResponseCompleteHooks: yieldNextRoundFromHooks,
                });

                // Continue without retry counter
                // Reset request ID for new call
                currentRequestId = undefined;
                // Yield current response as working state
                yield working(processedResult.processedResponse, context, currentRequestId);

                // Continue with new round
                // The necessary messages should already be added by plugins
                logger.debug('Continuing with next round', {
                  method: 'basicPromptConcatHandler',
                  agentId: context.agent.id,
                  messageCount: context.agent.messages.length,
                });

                yield* processLLMCall();
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
    yield* processLLMCall();
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
