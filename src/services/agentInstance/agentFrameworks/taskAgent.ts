import { container } from '@services/container';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { merge } from 'lodash';
import type { AgentInstanceLatestStatus, AgentInstanceMessage, IAgentInstanceService } from '../interface';
import { AgentFrameworkConfig, AgentPromptDescription, AiAPIConfig } from '../promptConcat/promptConcatSchema';
import type { IPromptConcatTool } from '../promptConcat/promptConcatSchema/tools';
import { responseConcat } from '../promptConcat/responseConcat';
import { getFinalPromptResult } from '../promptConcat/utilities';
import { createHooksWithPlugins } from '../tools';
import { YieldNextRoundTarget } from '../tools/types';
import { canceled, completed, error, inputRequired, working } from './utilities/statusUtilities';
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
  const { hooks: agentFrameworkHooks, pluginConfigs } = await createHooksWithPlugins(context.agentDef.agentFrameworkConfig || {});

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
    // Pass wikiTiddlers from metadata if they exist (already processed in first hook call)
    const wikiTiddlersFromMetadata = lastUserMessage.metadata?.wikiTiddlers as Array<{ workspaceName: string; tiddlerTitle: string }> | undefined;
    await agentFrameworkHooks.userMessageReceived.promise({
      agentFrameworkContext: context,
      content: {
        text: lastUserMessage.content,
        file: lastUserMessage.metadata?.file as File | undefined,
        // Pass wikiTiddlers back for consistency, though they're already in metadata
        wikiTiddlers: wikiTiddlersFromMetadata?.map(t => ({ workspaceName: t.workspaceName, tiddlerTitle: t.tiddlerTitle })),
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

  // Ensure AI configuration exists — merge global → agentDef → agent-instance overrides
  // Store back onto context.agent so tool handlers (e.g. wikiSearch) can read the merged config
  const externalAPIService = container.get<IExternalAPIService>(serviceIdentifier.ExternalAPI);
  const aiApiConfig: AiAPIConfig = merge(
    {},
    await externalAPIService.getAIConfig(),
    context.agentDef.aiApiConfig,
    context.agent.aiApiConfig,
  );
  context.agent.aiApiConfig = aiApiConfig;

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

    // Safety guard: maximum number of iterative rounds (0 = unlimited)
    const maxIterations = (agentFrameworkConfig as { maxIterations?: number }).maxIterations ?? 0;
    let iterationCount = 0;

    // Iterative loop replaces recursive generator to avoid O(N) stack frames and memory leak in long tool-calling chains
    let shouldContinueLoop = true;
    while (shouldContinueLoop) {
      shouldContinueLoop = false;
      iterationCount++;

      // Guard against infinite loops when maxIterations is configured
      if (maxIterations > 0 && iterationCount > maxIterations) {
        logger.warn('Max iterations reached, stopping agent loop', { maxIterations, iterationCount });
        yield completed(`Maximum iteration limit reached (${maxIterations}). Stopping to prevent infinite loop.`, context);
        return;
      }

      try {
        // Delegate prompt concatenation to plugin system
        const concatStream = agentInstanceService.concatPrompt(agentPromptDescription, context.agent.messages);
        const { flatPrompts } = await getFinalPromptResult(concatStream);

        logger.debug('Starting AI generation', {
          method: 'processLLMCall',
          modelName: aiApiConfig.default?.model || 'unknown',
          flatPromptsCount: flatPrompts.length,
          flatPromptsSummary: flatPrompts.map(message => ({
            role: message.role,
            contentType: Array.isArray(message.content) ? 'multimodal' : 'text',
            contentLength: Array.isArray(message.content)
              ? message.content.length
              : typeof message.content === 'string'
              ? message.content.length
              : 0,
          })),
          messagesCount: context.agent.messages.length,
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

            if (response.status === 'update') {
              await agentFrameworkHooks.responseUpdate.promise({
                agentFrameworkContext: context,
                response,
                requestId: currentRequestId,
                isFinal: false,
                toolConfig: {} as IPromptConcatTool,
              });
            }

            if (state === 'completed') {
              logger.debug('AI generation completed', {
                method: 'processLLMCall',
                requestId: currentRequestId,
                contentLength: response.content.length || 0,
              });

              const responseCompleteContext = {
                agentFrameworkContext: context,
                response,
                requestId: currentRequestId,
                isFinal: true,
                toolConfig: (pluginConfigs.length > 0 ? pluginConfigs[0] : {}) as IPromptConcatTool,
                agentFrameworkConfig: context.agentDef.agentFrameworkConfig,
                actions: undefined as { yieldNextRoundTo?: 'self' | 'human'; newUserMessage?: string } | undefined,
              };

              await agentFrameworkHooks.responseComplete.promise(responseCompleteContext);

              let yieldNextRoundFromHooks: YieldNextRoundTarget | undefined;
              if (responseCompleteContext.actions?.yieldNextRoundTo) {
                yieldNextRoundFromHooks = responseCompleteContext.actions.yieldNextRoundTo;
                logger.debug('Response complete hooks triggered yield next round', {
                  method: 'processLLMCall',
                  yieldNextRoundTo: yieldNextRoundFromHooks,
                });
              }

              const processedResult = await responseConcat(agentPromptDescription, response.content, context, context.agent.messages);

              const shouldContinue = processedResult.yieldNextRoundTo === 'self' || yieldNextRoundFromHooks === 'self';
              // 'human' means agent paused for user input (e.g. ask-question tool)
              const isInputRequired = processedResult.yieldNextRoundTo === 'human' || yieldNextRoundFromHooks === 'human';
              if (shouldContinue) {
                logger.debug('Response processing triggered new LLM call', {
                  method: 'processLLMCall',
                  fromResponseConcat: processedResult.yieldNextRoundTo,
                  fromResponseCompleteHooks: yieldNextRoundFromHooks,
                });

                currentRequestId = undefined;
                yield working(processedResult.processedResponse, context, currentRequestId);

                logger.debug('Continuing with next round (iterative)', {
                  method: 'basicPromptConcatHandler',
                  agentId: context.agent.id,
                  messageCount: context.agent.messages.length,
                });

                // Continue loop instead of recursive call — previous round's locals are released
                shouldContinueLoop = true;
                break;
              }

              if (isInputRequired) {
                yield inputRequired(processedResult.processedResponse, context, currentRequestId);
              } else {
                yield completed(processedResult.processedResponse, context, currentRequestId);
              }
            } else {
              yield working(response.content, context, currentRequestId);
            }
          } else if (response.status === 'error') {
            const errorText = response.errorDetail?.message || 'Unknown error';
            const errorMessage = `Error: ${errorText}`;
            logger.error('Error in AI response', {
              errorMessage,
              errorDetail: response.errorDetail,
              requestId: currentRequestId,
            });

            // Flush pending tool result messages before persisting the error
            try {
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

            const errorMessageForHistory: AgentInstanceMessage = {
              id: `ai-error-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              agentId: context.agent.id,
              role: 'error',
              content: errorMessage,
              metadata: { errorDetail: response.errorDetail },
              created: new Date(),
              modified: new Date(),
              duration: 1,
            };
            context.agent.messages.push(errorMessageForHistory);
            try {
              await agentInstanceService.saveUserMessage(errorMessageForHistory);
            } catch (persistError) {
              logger.warn('Failed to persist error message to database', {
                error: persistError,
                messageId: errorMessageForHistory.id,
                agentId: context.agent.id,
              });
            }

            yield error(errorMessage, response.errorDetail, context, currentRequestId);
            return;
          }
        }
        // Reset request ID after stream completes (only if not continuing loop)
        if (!shouldContinueLoop) {
          logger.debug('AI generation stream completed', {
            requestId: currentRequestId,
          });
          currentRequestId = undefined;
        }
      } catch (error) {
        logger.error('Unexpected error during AI generation', { error });
        yield completed(`Unexpected error: ${(error as Error).message}`, context);
        return;
      } finally {
        if (context.isCancelled() && currentRequestId) {
          logger.debug('Cancelling AI request in finally block', {
            requestId: currentRequestId,
          });
          await externalAPIService.cancelAIRequest(currentRequestId);
        }
      }
    }
  } catch (error) {
    logger.error('Error processing prompt', {
      method: 'basicPromptConcatHandler',
      agentId: context.agent.id,
      error,
    });
    yield completed(`Error processing prompt: ${(error as Error).message}`, context);
  }
}
