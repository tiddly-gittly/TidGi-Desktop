/* eslint-disable @typescript-eslint/no-unnecessary-type-conversion */
/**
 * Tool Definition Framework
 *
 * Provides a declarative API for defining LLM agent tools with minimal boilerplate.
 * Tools are defined using a configuration object that specifies:
 * - Schema for configuration parameters (shown in UI for users to configure)
 * - Schema for LLM-callable tool parameters (injected into prompts)
 * - Hook handlers for different lifecycle events
 *
 * This replaces the verbose tapAsync pattern with a cleaner functional approach.
 */
import { type ToolCallingMatch } from '@services/agentDefinition/interface';
import { matchToolCalling } from '@services/agentDefinition/responsePatternUtility';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { z } from 'zod/v4';
import type { AgentInstanceMessage, IAgentInstanceService } from '../interface';
import { findPromptById } from '../promptConcat/promptConcat';
import type { IPrompt } from '../promptConcat/promptConcatSchema';
import { schemaToToolContent } from '../utilities/schemaToToolContent';
import type { AIResponseContext, PostProcessContext, PromptConcatHookContext, PromptConcatHooks, PromptConcatTool } from './types';
import { registerToolParameterSchema } from './schemaRegistry';

/**
 * Tool definition configuration
 */
export interface ToolDefinition<
  TConfigSchema extends z.ZodType = z.ZodType,
  TLLMToolSchemas extends Record<string, z.ZodType> = Record<string, z.ZodType>,
> {
  /** Unique tool identifier - must match the toolId used in agent configuration */
  toolId: string;

  /** Display name for UI */
  displayName: string;

  /** Description of what this tool does */
  description: string;

  /** Schema for tool configuration parameters (user-configurable in UI) */
  configSchema: TConfigSchema;

  /**
   * Optional schemas for LLM-callable tools.
   * Each key is the tool name (e.g., 'wiki-search'), value is the parameter schema.
   * The schema's title meta will be used as the tool name in prompts.
   */
  llmToolSchemas?: TLLMToolSchemas;

  /**
   * Called during prompt processing phase.
   * Use this to inject tool descriptions, modify prompts, etc.
   */
  onProcessPrompts?: (context: ToolHandlerContext<TConfigSchema>) => Promise<void> | void;

  /**
   * Called after LLM generates a response.
   * Use this to parse tool calls, execute tools, etc.
   */
  onResponseComplete?: (context: ResponseHandlerContext<TConfigSchema, TLLMToolSchemas>) => Promise<void> | void;

  /**
   * Called during post-processing phase.
   * Use this to transform LLM responses, etc.
   */
  onPostProcess?: (context: PostProcessHandlerContext<TConfigSchema>) => Promise<void> | void;
}

/**
 * Context passed to prompt processing handlers
 */
export interface ToolHandlerContext<TConfigSchema extends z.ZodType> {
  /** The parsed configuration for this tool instance */
  config: z.infer<TConfigSchema>;

  /** Full tool configuration object */
  toolConfig: PromptConcatHookContext['toolConfig'];

  /** Current prompt tree (mutable) */
  prompts: IPrompt[];

  /** Message history */
  messages: AgentInstanceMessage[];

  /** Agent framework context */
  agentFrameworkContext: PromptConcatHookContext['agentFrameworkContext'];

  /** Utility: Find a prompt by ID */
  findPrompt: (id: string) => ReturnType<typeof findPromptById>;

  /** Utility: Inject a tool list at a target position */
  injectToolList: (options: InjectToolListOptions) => void;

  /** Utility: Inject content at a target position */
  injectContent: (options: InjectContentOptions) => void;
}

/**
 * Context passed to response handlers
 */
export interface ResponseHandlerContext<
  TConfigSchema extends z.ZodType,
  TLLMToolSchemas extends Record<string, z.ZodType>,
> extends Omit<ToolHandlerContext<TConfigSchema>, 'prompts' | 'config'> {
  /** The parsed configuration for this tool instance (may be undefined if no config provided) */
  config: z.infer<TConfigSchema> | undefined;

  /** AI response content */
  response: AIResponseContext['response'];

  /** Parsed tool call from response (if any) */
  toolCall: ToolCallingMatch | null;

  /** Full agent framework config for accessing other tool configs */
  agentFrameworkConfig: AIResponseContext['agentFrameworkConfig'];

  /** Utility: Execute a tool call and handle the result */
  executeToolCall: <TToolName extends keyof TLLMToolSchemas>(
    toolName: TToolName,
    executor: (parameters: z.infer<TLLMToolSchemas[TToolName]>) => Promise<ToolExecutionResult>,
  ) => Promise<boolean>;

  /** Utility: Add a tool result message */
  addToolResult: (options: AddToolResultOptions) => void;

  /** Utility: Signal that the agent should continue with another round */
  yieldToSelf: () => void;

  /** Raw hooks for advanced usage */
  hooks: PromptConcatHooks;

  /** Request ID for tracking */
  requestId?: string;
}

/**
 * Context passed to post-process handlers
 */
export interface PostProcessHandlerContext<TConfigSchema extends z.ZodType> extends Omit<ToolHandlerContext<TConfigSchema>, never> {
  /** LLM response text */
  llmResponse: string;

  /** Processed responses array (mutable) */
  responses: PostProcessContext['responses'];
}

/**
 * Options for injecting tool list into prompts
 */
export interface InjectToolListOptions {
  /** Target prompt ID to inject relative to */
  targetId: string;

  /** Position relative to target: 'before'/'after' inserts as sibling, 'child' adds to children */
  position: 'before' | 'after' | 'child';

  /** Tool schemas to inject (will use all llmToolSchemas if not specified) */
  toolSchemas?: z.ZodType[];

  /** Optional caption for the injected prompt */
  caption?: string;
}

/**
 * Options for injecting content into prompts
 */
export interface InjectContentOptions {
  /** Target prompt ID to inject relative to */
  targetId: string;

  /** Position relative to target */
  position: 'before' | 'after' | 'child';

  /** Content to inject */
  content: string;

  /** Caption for the injected prompt */
  caption?: string;

  /** Optional ID for the injected prompt */
  id?: string;
}

/**
 * Options for adding tool result messages
 */
export interface AddToolResultOptions {
  /** Tool name */
  toolName: string;

  /** Tool parameters */
  parameters: unknown;

  /** Result content */
  result: string;

  /** Whether this is an error result */
  isError?: boolean;

  /** How many rounds this result should be visible */
  duration?: number;
}

/**
 * Result from tool execution
 */
export interface ToolExecutionResult {
  success: boolean;
  data?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

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

          // Get the typed config
          const rawConfig = (toolConfig as Record<string, unknown>)[parameterKey];
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

              const toolPrompt: IPrompt = {
                id: `${toolId}-tool-list-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                text: toolContent,
                caption: options.caption ?? `${definition.displayName} Tools`,
                enabled: true,
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

              const contentPrompt: IPrompt = {
                id: options.id ?? `${toolId}-content-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                text: options.content,
                caption: options.caption ?? 'Injected Content',
                enabled: true,
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
          let ourToolConfig = agentFrameworkConfig?.plugins?.find(
            (p: { toolId: string }) => p.toolId === toolId,
          );

          // Fall back to direct toolConfig if provided (for backward compatibility with tests)
          if (!ourToolConfig && directToolConfig?.toolId === toolId) {
            ourToolConfig = directToolConfig;
          }

          // Skip if this tool is not configured for this agent
          if (!ourToolConfig) {
            callback();
            return;
          }

          // Skip if response is not complete
          if (response.status !== 'done' || !response.content) {
            callback();
            return;
          }

          // Parse tool call from response
          const toolMatch = matchToolCalling(response.content);
          const toolCall = toolMatch.found ? toolMatch : null;

          // Try to parse config (may be empty for tools that only handle LLM tool calls)
          const rawConfig = (ourToolConfig as Record<string, unknown>)[parameterKey];
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
            toolConfig: ourToolConfig as PromptConcatHookContext['toolConfig'],
            messages: agentFrameworkContext.agent.messages,
            agentFrameworkContext,
            response,
            toolCall,
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
              const toolResultText = `<functions_result>
Tool: ${options.toolName}
Parameters: ${JSON.stringify(options.parameters)}
${options.isError ? 'Error' : 'Result'}: ${options.result}
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

              agentFrameworkContext.agent.messages.push(toolResultMessage);

              // Persist immediately
              void (async () => {
                try {
                  const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
                  await agentInstanceService.saveUserMessage(toolResultMessage);
                  toolResultMessage.metadata = { ...toolResultMessage.metadata, isPersisted: true };
                } catch (error) {
                  logger.warn('Failed to persist tool result', { error, messageId: toolResultMessage.id });
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

              // Also set duration on the AI message containing the tool call and update UI immediately
              const aiMessages = agentFrameworkContext.agent.messages.filter((m) => m.role === 'assistant');
              if (aiMessages.length > 0) {
                const latestAiMessage = aiMessages[aiMessages.length - 1];
                // Only update if this message matches the current response (contains the tool call)
                if (latestAiMessage.content === response.content) {
                  latestAiMessage.duration = 1;
                  latestAiMessage.metadata = {
                    ...latestAiMessage.metadata,
                    containsToolCall: true,
                    toolId: toolCall?.toolId,
                  };

                  // Persist and update UI immediately (no debounce delay)
                  void (async () => {
                    try {
                      const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
                      if (!latestAiMessage.created) latestAiMessage.created = new Date();
                      await agentInstanceService.saveUserMessage(latestAiMessage);
                      latestAiMessage.metadata = { ...latestAiMessage.metadata, isPersisted: true };
                      // Update UI with no delay
                      agentInstanceService.debounceUpdateMessage(latestAiMessage, agentFrameworkContext.agent.id, 0);
                    } catch (error) {
                      logger.warn('Failed to persist AI message with tool call', { error, messageId: latestAiMessage.id });
                    }
                  })();
                }
              }
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

          const rawConfig = (toolConfig as Record<string, unknown>)[parameterKey];
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

/**
 * Registry for tools created with defineTool
 */
const toolRegistry = new Map<string, ReturnType<typeof defineTool>>();

/**
 * Register a tool definition
 */
export function registerToolDefinition<
  TConfigSchema extends z.ZodType,
  TLLMToolSchemas extends Record<string, z.ZodType>,
>(definition: ToolDefinition<TConfigSchema, TLLMToolSchemas>): ReturnType<typeof defineTool<TConfigSchema, TLLMToolSchemas>> {
  const toolDefinition = defineTool(definition);
  
  // Register tool parameter schema and metadata for dynamic schema generation
  registerToolParameterSchema(toolDefinition.toolId, toolDefinition.configSchema, {
    displayName: toolDefinition.displayName,
    description: toolDefinition.description,
  });
  
  toolRegistry.set(toolDefinition.toolId, toolDefinition as ReturnType<typeof defineTool>);
  return toolDefinition;
}

/**
 * Get all registered tool definitions
 */
export function getAllToolDefinitions(): Map<string, ReturnType<typeof defineTool>> {
  return toolRegistry;
}

/**
 * Get a tool definition by ID
 */
export function getToolDefinition(toolId: string): ReturnType<typeof defineTool> | undefined {
  return toolRegistry.get(toolId);
}
