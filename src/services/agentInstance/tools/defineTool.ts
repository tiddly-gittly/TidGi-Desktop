/* eslint-disable @typescript-eslint/no-unnecessary-type-conversion */
/**
 * Tool Definition Framework — Core `defineTool` function.
 *
 * Types are in ./defineToolTypes.ts, registry is in ./toolRegistry.ts.
 *
 * Provides a declarative API for defining LLM agent tools with minimal boilerplate.
 * Tools are defined using a configuration object that specifies:
 * - Schema for configuration parameters (shown in UI for users to configure)
 * - Schema for LLM-callable tool parameters (injected into prompts)
 * - Hook handlers for different lifecycle events
 */
import { type ToolCallingMatch } from '@services/agentDefinition/interface';
import { matchAllToolCallings } from '@services/agentDefinition/responsePatternUtility';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { z } from 'zod/v4';
import type { AgentInstanceMessage, IAgentInstanceService } from '../interface';
import { findPromptById } from '../promptConcat/promptConcat';
import type { IPrompt } from '../promptConcat/promptConcatSchema';
import { schemaToToolContent } from '../utilities/schemaToToolContent';
import { evaluateApproval, requestApproval } from './approval';

/**
 * Maximum characters for a single tool result before truncation.
 * ~8000 tokens at ~4 chars/token = 32000 chars.
 * Prevents a single search result from consuming the entire context window.
 */
const MAX_TOOL_RESULT_CHARS = 32_000;
import type {
  AddToolResultOptions,
  InjectContentOptions,
  InjectToolListOptions,
  PostProcessHandlerContext,
  ResponseHandlerContext,
  ToolDefinition,
  ToolExecutionResult,
  ToolHandlerContext,
} from './defineToolTypes';
import type { AIResponseContext, PromptConcatHookContext, PromptConcatTool } from './types';

// Re-export all types and the registry for backward compatibility
export type {
  AddToolResultOptions,
  DefinedTool,
  InjectContentOptions,
  InjectToolListOptions,
  PostProcessHandlerContext,
  ResponseHandlerContext,
  ToolDefinition,
  ToolExecutionResult,
  ToolHandlerContext,
} from './defineToolTypes';
export { getAllToolDefinitions, getToolDefinition, registerToolDefinition } from './toolRegistry';

/**
 * Create a tool from a definition.
 * Returns both the tool function and metadata for registration.
 */
export function defineTool<
  TConfigSchema extends z.ZodType,
  TLLMToolSchemas extends Record<string, z.ZodType> = Record<string, z.ZodType>,
>(definition: ToolDefinition<TConfigSchema, TLLMToolSchemas>): {
  tool: PromptConcatTool;
  toolId: string;
  configSchema: TConfigSchema;
  llmToolSchemas: TLLMToolSchemas | undefined;
  displayName: string;
  description: string;
} {
  const { toolId, configSchema, llmToolSchemas, onProcessPrompts, onResponseComplete, onPostProcess } = definition;

  // The parameter key in toolConfig (e.g., 'wikiSearchParam' for 'wikiSearch')
  const parameterKey = `${toolId}Param`;

  const tool: PromptConcatTool = (hooks) => {
    // Register processPrompts handler
    if (onProcessPrompts) {
      hooks.processPrompts.tapAsync(`${toolId}-processPrompts`, async (context, callback) => {
        try {
          const { toolConfig, prompts, messages, agentFrameworkContext } = context;

          // Skip if this tool config doesn't match our toolId
          if (toolConfig.toolId !== toolId) {
            callback();
            return;
          }

          if (toolConfig.enabled === false) {
            callback();
            return;
          }

          // Get the typed config
          const rawConfig: unknown = toolConfig[parameterKey];
          if (!rawConfig) {
            callback();
            return;
          }

          // Parse and validate config
          const config = configSchema.parse(rawConfig) as z.infer<TConfigSchema>;

          // Build handler context with utilities
          const handlerContext: ToolHandlerContext<TConfigSchema> = {
            config,
            toolConfig,
            prompts,
            messages,
            agentFrameworkContext,

            findPrompt: (id: string) => findPromptById(prompts, id),

            injectToolList: (options: InjectToolListOptions) => {
              const target = findPromptById(prompts, options.targetId);
              if (!target) {
                logger.warn(`Target prompt not found for tool list injection`, {
                  targetId: options.targetId,
                  toolId,
                });
                return;
              }

              // Generate tool content from schemas
              const schemas = options.toolSchemas ?? (llmToolSchemas ? Object.values(llmToolSchemas) : []);
              const toolContent = schemas.map((schema) => schemaToToolContent(schema)).join('\n\n');

              // Build source path pointing to the plugin configuration
              // Format: ['plugins', pluginId] so clicking navigates to plugins tab
              const pluginIndex = context.pluginIndex;
              const source = pluginIndex !== undefined ? ['plugins', toolConfig.id] : undefined;

              const toolPrompt: IPrompt = {
                id: `${toolId}-tool-list-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                text: toolContent,
                caption: options.caption ?? `${definition.displayName} Tools`,
                enabled: true,
                source,
              };

              if (options.position === 'child') {
                // Add to target's children
                if (!target.prompt.children) {
                  target.prompt.children = [];
                }
                target.prompt.children.push(toolPrompt);
              } else if (options.position === 'before') {
                target.parent.splice(target.index, 0, toolPrompt);
              } else {
                target.parent.splice(target.index + 1, 0, toolPrompt);
              }

              logger.debug(`Tool list injected`, {
                targetId: options.targetId,
                position: options.position,
                toolId,
              });
            },

            injectContent: (options: InjectContentOptions) => {
              const target = findPromptById(prompts, options.targetId);
              if (!target) {
                logger.warn(`Target prompt not found for content injection`, {
                  targetId: options.targetId,
                  toolId,
                });
                return;
              }

              // Build source path pointing to the plugin configuration
              const pluginIndex = context.pluginIndex;
              const source = pluginIndex !== undefined ? ['plugins', toolConfig.id] : undefined;

              const contentPrompt: IPrompt = {
                id: options.id ?? `${toolId}-content-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                text: options.content,
                caption: options.caption ?? 'Injected Content',
                enabled: true,
                source,
              };

              if (options.position === 'child') {
                if (!target.prompt.children) {
                  target.prompt.children = [];
                }
                target.prompt.children.push(contentPrompt);
              } else if (options.position === 'before') {
                target.parent.splice(target.index, 0, contentPrompt);
              } else {
                target.parent.splice(target.index + 1, 0, contentPrompt);
              }

              logger.debug(`Content injected`, {
                targetId: options.targetId,
                position: options.position,
                toolId,
              });
            },
          };

          await onProcessPrompts(handlerContext);
          callback();
        } catch (error) {
          logger.error(`Error in ${toolId} processPrompts handler`, { error });
          callback();
        }
      });
    }

    // Register responseComplete handler
    if (onResponseComplete) {
      hooks.responseComplete.tapAsync(`${toolId}-responseComplete`, async (context, callback) => {
        try {
          const { agentFrameworkContext, response, agentFrameworkConfig, requestId, toolConfig: directToolConfig } = context as AIResponseContext & {
            toolConfig?: PromptConcatHookContext['toolConfig'];
          };

          // Find our tool's config - first try agentFrameworkConfig.plugins, then fall back to direct toolConfig
          const configuredToolConfig = agentFrameworkConfig?.plugins?.find((p) => p.toolId === toolId);
          const ourToolConfig = configuredToolConfig ?? (directToolConfig?.toolId === toolId ? directToolConfig : undefined);

          // Skip if this tool is not configured for this agent
          if (!ourToolConfig) {
            callback();
            return;
          }

          if (ourToolConfig.enabled === false) {
            callback();
            return;
          }

          // Skip if response is not complete
          if (response.status !== 'done' || !response.content) {
            callback();
            return;
          }

          // Parse ALL tool calls from response (supports <parallel_tool_calls>)
          const { calls: allCalls, parallel: isParallel } = matchAllToolCallings(response.content);
          const toolCall = allCalls.length > 0 ? allCalls[0] : null;

          // Try to parse config (may be empty for tools that only handle LLM tool calls)
          const rawConfig: unknown = ourToolConfig[parameterKey];
          let config: z.infer<TConfigSchema> | undefined;
          if (rawConfig) {
            try {
              config = configSchema.parse(rawConfig) as z.infer<TConfigSchema>;
            } catch (parseError) {
              logger.warn(`Failed to parse config for ${toolId}`, { parseError });
            }
          }

          // Build handler context
          const handlerContext: ResponseHandlerContext<TConfigSchema, TLLMToolSchemas> = {
            config,
            toolConfig: ourToolConfig,
            messages: agentFrameworkContext.agent.messages,
            agentFrameworkContext,
            response,
            toolCall,
            allToolCalls: allCalls,
            isParallel,
            agentFrameworkConfig,
            hooks,
            requestId,

            findPrompt: () => undefined, // Not available in response phase

            injectToolList: () => {
              logger.warn('injectToolList is not available in response phase');
            },

            injectContent: () => {
              logger.warn('injectContent is not available in response phase');
            },

            executeToolCall: async <TToolName extends keyof TLLMToolSchemas>(
              toolName: TToolName,
              executor: (parameters: z.infer<TLLMToolSchemas[TToolName]>) => Promise<ToolExecutionResult>,
            ): Promise<boolean> => {
              if (!toolCall || toolCall.toolId !== toolName) {
                return false;
              }

              const toolSchema = llmToolSchemas?.[toolName];
              if (!toolSchema) {
                logger.error(`No schema found for tool: ${String(toolName)}`);
                return false;
              }

              try {
                // Validate parameters
                const validatedParameters = toolSchema.parse(toolCall.parameters);

                // Check approval before execution
                const approvalConfig = ourToolConfig.approval;
                const decision = evaluateApproval(approvalConfig, String(toolName), validatedParameters as Record<string, unknown>);
                if (decision === 'deny') {
                  handlerContext.addToolResult({
                    toolName: String(toolName),
                    parameters: validatedParameters,
                    result: 'Tool execution denied by approval policy.',
                    isError: true,
                    duration: 2,
                  });
                  handlerContext.yieldToSelf();
                  return true;
                }
                if (decision === 'pending') {
                  const approvalId = `approval-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                  const userDecision = await requestApproval({
                    approvalId,
                    agentId: agentFrameworkContext.agent.id,
                    toolName: String(toolName),
                    parameters: validatedParameters as Record<string, unknown>,
                    originalText: toolCall.originalText,
                    created: new Date(),
                  });
                  if (userDecision === 'deny') {
                    handlerContext.addToolResult({
                      toolName: String(toolName),
                      parameters: validatedParameters,
                      result: 'Tool execution denied by user.',
                      isError: true,
                      duration: 2,
                    });
                    handlerContext.yieldToSelf();
                    return true;
                  }
                }

                // Execute the tool
                const result = await executor(validatedParameters);

                // Add result message
                const toolResultDuration = (config as { toolResultDuration?: number } | undefined)?.toolResultDuration ?? 1;
                handlerContext.addToolResult({
                  toolName: toolName,
                  parameters: validatedParameters,
                  result: result.success ? (result.data ?? 'Success') : (result.error ?? 'Unknown error'),
                  isError: !result.success,
                  duration: toolResultDuration,
                });

                // Set up next round
                handlerContext.yieldToSelf();

                // Signal tool execution to other plugins
                await hooks.toolExecuted.promise({
                  agentFrameworkContext,
                  toolResult: result,
                  toolInfo: {
                    toolId: String(toolName),
                    parameters: validatedParameters as Record<string, unknown>,
                    originalText: toolCall.originalText,
                  },
                  requestId,
                });

                return true;
              } catch (error) {
                logger.error(`Tool execution failed: ${String(toolName)}`, { error });

                // Add error result
                handlerContext.addToolResult({
                  toolName: toolName,
                  parameters: toolCall.parameters,
                  result: error instanceof Error ? error.message : String(error),
                  isError: true,
                  duration: 2,
                });

                handlerContext.yieldToSelf();

                await hooks.toolExecuted.promise({
                  agentFrameworkContext,
                  toolResult: {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                  },
                  toolInfo: {
                    toolId: toolName,
                    parameters: toolCall.parameters || {},
                  },
                });

                return true;
              }
            },

            addToolResult: (options: AddToolResultOptions) => {
              const now = new Date();

              // Truncate excessively long results to prevent context window overflow
              let resultContent = options.result;
              if (resultContent.length > MAX_TOOL_RESULT_CHARS) {
                const truncated = resultContent.slice(0, MAX_TOOL_RESULT_CHARS);
                resultContent = `${truncated}\n\n[... truncated — result was ${resultContent.length} chars, showing first ${MAX_TOOL_RESULT_CHARS}]`;
                logger.debug('Tool result truncated', { toolName: options.toolName, originalLength: options.result.length, truncatedTo: MAX_TOOL_RESULT_CHARS });
              }

              const toolResultText = `<functions_result>
Tool: ${options.toolName}
Parameters: ${JSON.stringify(options.parameters)}
${options.isError ? 'Error' : 'Result'}: ${resultContent}
</functions_result>`;

              const toolResultMessage: AgentInstanceMessage = {
                id: `tool-result-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                agentId: agentFrameworkContext.agent.id,
                role: 'tool',
                content: toolResultText,
                created: now,
                modified: now,
                duration: options.duration ?? 1,
                metadata: {
                  isToolResult: true,
                  isError: options.isError ?? false,
                  toolId: options.toolName,
                  toolParameters: options.parameters,
                  isPersisted: false,
                  isComplete: true,
                },
              };

              // Mark as persisted immediately to prevent duplicate saves from messagePersistence hook
              toolResultMessage.metadata = { ...toolResultMessage.metadata, isPersisted: true };
              agentFrameworkContext.agent.messages.push(toolResultMessage);

              // Mark the assistant message that triggered this tool call as short-lived
              // so it fades out in the UI (the tool result message replaces it visually)
              const aiMessages = agentFrameworkContext.agent.messages.filter((m) => m.role === 'assistant');
              if (aiMessages.length > 0) {
                const latestAiMessage = aiMessages[aiMessages.length - 1];
                if (latestAiMessage.content === response.content && !latestAiMessage.metadata?.containsToolCall) {
                  latestAiMessage.duration = 1;
                  latestAiMessage.metadata = {
                    ...latestAiMessage.metadata,
                    containsToolCall: true,
                    toolId: options.toolName,
                    isPersisted: true,
                  };

                  void (async () => {
                    try {
                      const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
                      if (!latestAiMessage.created) latestAiMessage.created = new Date();
                      await agentInstanceService.saveUserMessage(latestAiMessage);
                      agentInstanceService.debounceUpdateMessage(latestAiMessage, agentFrameworkContext.agent.id, 0);
                    } catch (error) {
                      logger.warn('Failed to persist AI message with tool call', { error, messageId: latestAiMessage.id });
                      latestAiMessage.metadata = { ...latestAiMessage.metadata, isPersisted: false };
                    }
                  })();
                }
              }

              // Persist tool result asynchronously
              void (async () => {
                try {
                  const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
                  await agentInstanceService.saveUserMessage(toolResultMessage);
                } catch (error) {
                  logger.warn('Failed to persist tool result', { error, messageId: toolResultMessage.id });
                  toolResultMessage.metadata = { ...toolResultMessage.metadata, isPersisted: false };
                }
              })();

              logger.debug('Tool result added', {
                toolName: options.toolName,
                isError: options.isError,
                messageId: toolResultMessage.id,
              });
            },

            yieldToSelf: () => {
              if (!context.actions) {
                context.actions = {};
              }
              context.actions.yieldNextRoundTo = 'self';
              // Assistant message is now marked in addToolResult() — no duplicate logic needed here
            },

            yieldToHuman: () => {
              if (!context.actions) {
                context.actions = {};
              }
              context.actions.yieldNextRoundTo = 'human';
            },

            executeAllMatchingToolCalls: async <TToolName extends keyof TLLMToolSchemas>(
              toolName: TToolName,
              executor: (parameters: z.infer<TLLMToolSchemas[TToolName]>) => Promise<ToolExecutionResult>,
              options?: { timeoutMs?: number },
            ): Promise<number> => {
              // Find all calls matching this tool name
              const matchingCalls = allCalls.filter(call => call.toolId === toolName);
              if (matchingCalls.length === 0) return 0;

              const toolSchema = llmToolSchemas?.[toolName];
              if (!toolSchema) {
                logger.error(`No schema found for tool: ${String(toolName)}`);
                return 0;
              }

              const toolResultDuration = (config as { toolResultDuration?: number } | undefined)?.toolResultDuration ?? 1;

              // Build entries for parallel execution
              const entries: Array<
                { call: ToolCallingMatch & { found: true }; executor: (parameters: Record<string, unknown>) => Promise<ToolExecutionResult>; timeoutMs?: number }
              > = [];

              // Check approval once for the batch — use the first call's parameters as representative
              const approvalConfig = ourToolConfig.approval;
              const batchDecision = evaluateApproval(approvalConfig, String(toolName), matchingCalls[0]?.parameters ?? {});
              if (batchDecision === 'deny') {
                for (const call of matchingCalls) {
                  handlerContext.addToolResult({
                    toolName: String(toolName),
                    parameters: call.parameters,
                    result: 'Tool execution denied by approval policy.',
                    isError: true,
                    duration: toolResultDuration,
                  });
                }
                handlerContext.yieldToSelf();
                return matchingCalls.length;
              }
              if (batchDecision === 'pending') {
                const approvalId = `approval-batch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const userDecision = await requestApproval({
                  approvalId,
                  agentId: agentFrameworkContext.agent.id,
                  toolName: String(toolName),
                  parameters: { _batchSize: matchingCalls.length, _firstCallParams: matchingCalls[0]?.parameters },
                  created: new Date(),
                });
                if (userDecision === 'deny') {
                  for (const call of matchingCalls) {
                    handlerContext.addToolResult({
                      toolName: String(toolName),
                      parameters: call.parameters,
                      result: 'Tool execution denied by user.',
                      isError: true,
                      duration: toolResultDuration,
                    });
                  }
                  handlerContext.yieldToSelf();
                  return matchingCalls.length;
                }
              }

              for (const call of matchingCalls) {
                try {
                  const validatedParameters = toolSchema.parse(call.parameters);
                  entries.push({
                    call,
                    executor: async () => executor(validatedParameters),
                    timeoutMs: options?.timeoutMs,
                  });
                } catch (validationError) {
                  // Add validation error as result immediately
                  handlerContext.addToolResult({
                    toolName: String(toolName),
                    parameters: call.parameters,
                    result: `Parameter validation failed: ${validationError instanceof Error ? validationError.message : String(validationError)}`,
                    isError: true,
                    duration: toolResultDuration,
                  });
                }
              }

              if (entries.length === 0) return matchingCalls.length;

              // Execute: parallel if <parallel_tool_calls> mode, sequential otherwise
              let results: Array<{ call: ToolCallingMatch & { found: true }; status: string; result?: ToolExecutionResult; error?: string }>;
              if (isParallel) {
                // Import and use parallel execution — NOT Promise.all, collects success+failure+timeout
                const { executeToolCallsParallel } = await import('./parallelExecution');
                results = await executeToolCallsParallel(entries);
              } else {
                // Sequential execution
                const { executeToolCallsSequential } = await import('./parallelExecution');
                results = await executeToolCallsSequential(entries);
              }

              // Process all results
              for (const result of results) {
                const isError = result.status !== 'fulfilled' || (result.result !== undefined && !result.result.success);
                const resultText = result.status === 'timeout'
                  ? (result.error ?? 'Tool execution timed out')
                  : result.status === 'rejected'
                  ? (result.error ?? 'Tool execution failed')
                  : result.result?.success
                  ? (result.result.data ?? 'Success')
                  : (result.result?.error ?? 'Unknown error');

                handlerContext.addToolResult({
                  toolName: String(toolName),
                  parameters: result.call.parameters,
                  result: resultText,
                  isError,
                  duration: toolResultDuration,
                });

                // Signal tool execution to other plugins
                await hooks.toolExecuted.promise({
                  agentFrameworkContext,
                  toolResult: result.result ?? { success: false, error: resultText },
                  toolInfo: {
                    toolId: String(toolName),
                    parameters: (result.call.parameters ?? {}),
                    originalText: result.call.originalText,
                  },
                  requestId,
                });
              }

              handlerContext.yieldToSelf();
              return matchingCalls.length;
            },
          };

          await onResponseComplete(handlerContext);
          callback();
        } catch (error) {
          logger.error(`Error in ${toolId} responseComplete handler`, { error });
          callback();
        }
      });
    }

    // Register postProcess handler
    if (onPostProcess) {
      hooks.postProcess.tapAsync(`${toolId}-postProcess`, async (context, callback) => {
        try {
          const { toolConfig, prompts, messages, agentFrameworkContext, llmResponse, responses } = context;

          if (toolConfig.toolId !== toolId) {
            callback();
            return;
          }

          if (toolConfig.enabled === false) {
            callback();
            return;
          }

          const rawConfig: unknown = toolConfig[parameterKey];
          if (!rawConfig) {
            callback();
            return;
          }

          const config = configSchema.parse(rawConfig) as z.infer<TConfigSchema>;

          const handlerContext: PostProcessHandlerContext<TConfigSchema> = {
            config,
            toolConfig,
            prompts,
            messages,
            agentFrameworkContext,
            llmResponse,
            responses,

            findPrompt: (id: string) => findPromptById(prompts, id),

            injectToolList: () => {
              logger.warn('injectToolList is not recommended in postProcess phase');
            },

            injectContent: () => {
              logger.warn('injectContent is not recommended in postProcess phase');
            },
          };

          await onPostProcess(handlerContext);
          callback();
        } catch (error) {
          logger.error(`Error in ${toolId} postProcess handler`, { error });
          callback();
        }
      });
    }
  };

  return {
    tool,
    toolId,
    configSchema,
    llmToolSchemas,
    displayName: definition.displayName,
    description: definition.description,
  };
}
