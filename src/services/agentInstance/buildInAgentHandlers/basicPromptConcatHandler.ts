import { IAgentDefinitionService } from '@services/agentDefinition/interface';
import { matchAndExecuteTool } from '@services/agentDefinition/toolExecutor';
import { container } from '@services/container';
import { IExternalAPIService } from '@services/externalAPI/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { AgentInstanceLatestStatus, AgentInstanceMessage, IAgentInstanceService } from '../interface';
import { responseConcat } from '../promptConcat/responseConcat';
import { getFinalPromptResult } from '../promptConcat/utils';
import { continueRoundHandler } from './continueRoundHandlers';
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
  const lastUserMessage: AgentInstanceMessage | undefined = context.agent.messages[context.agent.messages.length - 1];

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

  if (!lastUserMessage.content || lastUserMessage.role !== 'user') {
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

    // Generate AI response
    // Function to process a single LLM call with retry support
    async function* processLLMCall(_userMessage: string): AsyncGenerator<AgentInstanceLatestStatus> {
      try {
        // Use prompt description from outer scope instead of fetching by ID
        const agentConfig = promptDescription;

        // Re-generate prompts to trigger middleware (including retrievalAugmentedGenerationHandler)
        // Get the final result from the stream using utility function
        const concatStream = agentInstanceService.concatPrompt(promptDescription, context.agent.messages);
        const { flatPrompts: currentFlatPrompts } = await getFinalPromptResult(concatStream);

        logger.info('Starting AI generation', {
          method: 'processLLMCall',
          modelName: aiApiConfig.api.model,
          promptCount: currentFlatPrompts.length,
          messageCount: context.agent.messages.length,
        });

        for await (const response of externalAPIService.generateFromAI(currentFlatPrompts, aiApiConfig)) {
          if (!currentRequestId && response.requestId) {
            currentRequestId = response.requestId;
            logger.debug('Received request ID', {
              requestId: currentRequestId,
            });
          }

          if (context.isCancelled()) {
            logger.info('Request cancelled by user', {
              method: 'processLLMCall',
              requestId: currentRequestId,
            });

            if (currentRequestId) {
              await externalAPIService.cancelAIRequest(currentRequestId);
            }
            yield canceled();
            return;
          }

          if (response.status === 'update' || response.status === 'done') {
            const state = response.status === 'done' ? 'completed' : 'working';

            if (state === 'completed') {
              logger.info('AI generation completed', {
                method: 'processLLMCall',
                requestId: currentRequestId,
                contentLength: response.content.length || 0,
              });

              // Check for continue round logic (tool calling, etc.)
              const continueResult = await continueRoundHandler(promptDescription, response.content, context);

              if (continueResult.continue) {
                logger.info('Continue round triggered', {
                  method: 'processLLMCall',
                  reason: continueResult.reason,
                  hasNewMessage: !!continueResult.newMessage,
                  retryCount,
                });

                // If we've hit max retries, prevent infinite loops
                if (retryCount >= maxRetries) {
                  logger.warn('Maximum retry limit reached, returning final response', {
                    maxRetries,
                    retryCount,
                  });
                  yield completed(response.content, context, currentRequestId);
                  return;
                }
                retryCount++;
                // Reset request ID for new call
                currentRequestId = undefined;
                // Yield current response as working state
                yield working(response.content, context, currentRequestId);

                // Add AI's response to message history BEFORE continuing
                // This ensures retrievalAugmentedGenerationHandler can find the tool call
                context.agent.messages.push({
                  id: `ai-response-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  agentId: context.agent.id,
                  role: 'assistant',
                  content: response.content,
                });

                // Check if there's a tool call in the response and execute it immediately
                const agentDefinitionService = container.get<IAgentDefinitionService>(serviceIdentifier.AgentDefinition);
                try {
                  logger.debug('Checking for tool calls in AI response', {
                    responseLength: response.content.length,
                    responsePreview: response.content.substring(0, 100),
                  });

                  const toolResult = await matchAndExecuteTool(
                    response.content,
                    {
                      workspaceId: context.agent.id,
                      metadata: { messageId: context.agent.messages[context.agent.messages.length - 1].id },
                    },
                  );

                  if (toolResult) {
                    // Add tool result as a separate message with 'tool' role
                    const toolMessage: AgentInstanceMessage = {
                      id: `tool-result-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                      agentId: context.agent.id,
                      role: 'tool',
                      content: toolResult.success
                        ? `Tool execution result:\n\n${toolResult.data || 'Tool executed successfully but returned no data'}`
                        : `Tool execution failed: ${toolResult.error}`,
                      metadata: {
                        toolSuccess: toolResult.success,
                        toolError: toolResult.error,
                        executedAt: new Date().toISOString(),
                      },
                    };

                    context.agent.messages.push(toolMessage);

                    // Yield the tool message so it gets persisted through the normal flow
                    yield {
                      state: 'working',
                      message: toolMessage,
                      modified: new Date(),
                    };

                    // Tool message will be persisted through the normal message flow
                    logger.info('Tool execution result added to message history', {
                      toolSuccess: toolResult.success,
                      hasData: !!toolResult.data,
                      messageId: toolMessage.id,
                      willBePersisted: true,
                    });
                  }
                } catch (toolError) {
                  logger.debug('No tool call found or tool execution failed during continue round', {
                    error: toolError instanceof Error ? toolError.message : String(toolError),
                  });
                }

                // Continue with new round - use last user message
                const nextUserMessage = continueResult.newMessage || lastUserMessage?.content;
                if (nextUserMessage) {
                  yield* processLLMCall(nextUserMessage);
                } else {
                  logger.warn('No message provided for continue round', {
                    method: 'basicPromptConcatHandler',
                    agentId: context.agent.id,
                  });
                  yield completed(response.content, context, currentRequestId);
                }
                return;
              }

              // Process response with all registered plugins
              const processedResult = await responseConcat(agentConfig, response.content, context, context.agent.messages || []);
              // Check if we need to trigger another LLM call
              if (processedResult.needsNewLLMCall) {
                logger.info('Response processing triggered new LLM call', {
                  method: 'processLLMCall',
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
                const nextUserMessage = processedResult.newUserMessage || lastUserMessage?.content;

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
