import { container } from '@services/container';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { merge } from 'lodash';
import type { AgentInstanceLatestStatus, AgentInstanceMessage, IAgentInstanceService } from '../interface';
import { AgentFrameworkConfig, AgentPromptDescription, AiAPIConfig } from '../promptConcat/promptConcatSchema';
import type { IPromptConcatTool } from '../promptConcat/promptConcatSchema/plugin';
import { responseConcat } from '../promptConcat/responseConcat';
import { getFinalPromptResult } from '../promptConcat/utilities';
import { createHooksWithTools } from '../tools';
import { YieldNextRoundTarget } from '../tools/types';
import { canceled, completed, error, working } from './utilities/statusUtilities';
import { AgentFrameworkContext } from './utilities/type';

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
export async function* basicPromptConcatHandler(context: AgentFrameworkContext) {
  // Initialize variables for request tracking
  let currentRequestId: string | undefined;
  const lastUserMessage: AgentInstanceMessage | undefined = context.agent.messages[context.agent.messages.length - 1];
  // Create and register handler hooks based on framework config
  const { hooks: agentFrameworkHooks, toolConfigs } = await createHooksWithTools(context.agentDef.agentFrameworkConfig || {});

  // Log the start of handler execution with context information
  logger.debug('Starting prompt handler execution', {
    method: 'basicPromptConcatHandler',
    agentId: context.agent.id,
    defId: context.agentDef.id,
    agentFrameworkId: context.agentDef.agentFrameworkID,
    messageCount: context.agent.messages.length,
  });
  // Check if there's a new user message to process - trigger user message received hook
  // This is determined by checking if the last message is from user and hasn't been processed yet
  const isNewUserMessage = !!lastUserMessage && lastUserMessage.role === 'user' && !lastUserMessage.metadata?.processed;

  if (isNewUserMessage) {
    // Trigger user message received hook
    await agentFrameworkHooks.userMessageReceived.promise({
      agentFrameworkContext: context,
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
    await agentFrameworkHooks.agentStatusChanged.promise({
      agentFrameworkContext: context,
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
    const agentFrameworkConfig = context.agentDef.agentFrameworkConfig as AgentFrameworkConfig;
    const agentPromptDescription: AgentPromptDescription = {
      id: context.agentDef.id,
      // Use default model selection for the agent description
      // This maintains backward compatibility while using the new schema
      api: aiApiConfig.default
        ? {
          provider: aiApiConfig.default.provider,
          model: aiApiConfig.default.model,
        }
        : { provider: '', model: '' },
      modelParameters: aiApiConfig.modelParameters,
      agentFrameworkConfig,
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

        logger.debug('Starting AI generation', {
          method: 'processLLMCall',
          modelName: aiApiConfig.default?.model || 'unknown',
          flatPrompts,
          messages: context.agent.messages,
        });

        // Delegate AI API calls to externalAPIService
        for await (const response of externalAPIService.generateFromAI(flatPrompts, aiApiConfig, { agentInstanceId: context.agent.id, awaitLogs: true })) {
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
              await agentFrameworkHooks.responseUpdate.promise({
                agentFrameworkContext: context,
                response,
                requestId: currentRequestId,
                isFinal: false,
                toolConfig: {} as IPromptConcatTool, // Empty config for streaming updates
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
                agentFrameworkContext: context,
                response,
                requestId: currentRequestId,
                isFinal: true,
                toolConfig: (toolConfigs.length > 0 ? toolConfigs[0] : {}) as IPromptConcatTool, // First config for compatibility
                agentFrameworkConfig: context.agentDef.agentFrameworkConfig, // Pass complete config for tool access
                actions: undefined as { yieldNextRoundTo?: 'self' | 'human'; newUserMessage?: string } | undefined,
              };

              await agentFrameworkHooks.responseComplete.promise(responseCompleteContext);

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
            // Create message with error details and emit as role='error'
            const errorText = response.errorDetail?.message || 'Unknown error';
            const errorMessage = `Error: ${errorText}`;
            logger.error('Error in AI response', {
              errorMessage,
              errorDetail: response.errorDetail,
              requestId: currentRequestId,
            });

            // Before persisting the error, ensure any pending tool result messages are persisted
            try {
              const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
              const pendingToolMessages = context.agent.messages.filter(m => m.metadata?.isToolResult && !m.metadata?.isPersisted);
              for (const tm of pendingToolMessages) {
                try {
                  await agentInstanceService.saveUserMessage(tm);
                  (tm).metadata = { ...(tm).metadata, isPersisted: true };
                } catch (error1) {
                  logger.warn('Failed to persist pending tool result before error', {
                    error: error1,
                    messageId: tm.id,
                  });
                }
              }
            } catch (error2) {
              logger.warn('Failed to flush pending tool messages before persisting error', { error: error2 });
            }

            // Push an explicit error message into history for UI rendering
            const errorMessageForHistory: AgentInstanceMessage = {
              id: `ai-error-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              agentId: context.agent.id,
              role: 'error',
              content: errorMessage,
              metadata: { errorDetail: response.errorDetail },
              created: new Date(),
              modified: new Date(),
              // Expire after one round in AI context
              duration: 1,
            };
            context.agent.messages.push(errorMessageForHistory);
            // Persist error message to database so it appears in history like others
            try {
              const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
              await agentInstanceService.saveUserMessage(errorMessageForHistory);
            } catch (persistError) {
              logger.warn('Failed to persist error message to database', {
                error: persistError,
                messageId: errorMessageForHistory.id,
                agentId: context.agent.id,
              });
            }

            // Also yield completed with error state for status panel
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
        logger.error('Unexpected error during AI generation', { error });
        yield completed(`Unexpected error: ${(error as Error).message}`, context);
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
    logger.error('Error processing prompt', {
      method: 'basicPromptConcatHandler',
      agentId: context.agent.id,
      error,
    });
    yield completed(`Error processing prompt: ${(error as Error).message}`, context);
  }
}
