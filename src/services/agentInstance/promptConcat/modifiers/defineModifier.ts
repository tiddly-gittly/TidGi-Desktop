/**
 * Modifier Definition Framework
 *
 * Provides a declarative API for defining prompt modifiers with minimal boilerplate.
 * Modifiers only transform the prompt tree - they don't involve LLM tool calling.
 *
 * Unlike LLM tools, modifiers:
 * - Only work with processPrompts and postProcess hooks
 * - Don't inject tool descriptions or handle tool calls
 * - Are focused on prompt tree transformations
 */
import { logger } from '@services/libs/log';
import type { z } from 'zod/v4';
import type { AgentInstanceMessage } from '../../interface';
import type { PostProcessContext, PromptConcatHookContext, PromptConcatHooks, PromptConcatTool } from '../../tools/types';
import { findPromptById } from '../promptConcat';
import type { IPrompt } from '../promptConcatSchema';

/**
 * Modifier definition configuration
 */
export interface ModifierDefinition<TConfigSchema extends z.ZodType = z.ZodType> {
  /** Unique modifier identifier */
  modifierId: string;

  /** Display name for UI */
  displayName: string;

  /** Description of what this modifier does */
  description: string;

  /** Schema for modifier configuration parameters */
  configSchema: TConfigSchema;

  /**
   * Called during prompt processing phase.
   * Use this to modify the prompt tree.
   */
  onProcessPrompts?: (context: ModifierHandlerContext<TConfigSchema>) => Promise<void> | void;

  /**
   * Called during post-processing phase.
   * Use this to transform LLM responses.
   */
  onPostProcess?: (context: PostProcessModifierContext<TConfigSchema>) => Promise<void> | void;
}

/**
 * Context passed to prompt processing handlers
 */
export interface ModifierHandlerContext<TConfigSchema extends z.ZodType> {
  /** The parsed configuration for this modifier instance */
  config: z.infer<TConfigSchema>;

  /** Full modifier configuration object (includes extra fields like content, caption) */
  modifierConfig: PromptConcatHookContext['toolConfig'];

  /** Current prompt tree (mutable) */
  prompts: IPrompt[];

  /** Message history */
  messages: AgentInstanceMessage[];

  /** Agent framework context */
  agentFrameworkContext: PromptConcatHookContext['agentFrameworkContext'];

  /** Utility: Find a prompt by ID */
  findPrompt: (id: string) => ReturnType<typeof findPromptById>;

  /** Utility: Insert content at a position */
  insertContent: (options: InsertContentOptions) => void;

  /** Utility: Replace prompt content */
  replaceContent: (targetId: string, content: string | IPrompt[]) => boolean;
}

/**
 * Context passed to post-process handlers
 */
export interface PostProcessModifierContext<TConfigSchema extends z.ZodType> extends Omit<ModifierHandlerContext<TConfigSchema>, 'prompts'> {
  /** LLM response text */
  llmResponse: string;

  /** Processed responses array (mutable) */
  responses: PostProcessContext['responses'];
}

/**
 * Options for inserting content
 */
export interface InsertContentOptions {
  /** Target prompt ID */
  targetId: string;

  /** Position: 'before'/'after' as sibling, 'child' adds to children */
  position: 'before' | 'after' | 'child';

  /** Content to insert (string or prompt object) */
  content: string | IPrompt;

  /** Optional caption */
  caption?: string;

  /** Optional ID for the new prompt */
  id?: string;
}

/**
 * Create a modifier from a definition.
 */
export function defineModifier<TConfigSchema extends z.ZodType>(
  definition: ModifierDefinition<TConfigSchema>,
): {
  modifier: PromptConcatTool;
  modifierId: string;
  configSchema: TConfigSchema;
  displayName: string;
  description: string;
} {
  const { modifierId, configSchema, onProcessPrompts, onPostProcess } = definition;

  // The parameter key in config (e.g., 'fullReplacementParam' for 'fullReplacement')
  const parameterKey = `${modifierId}Param`;

  const modifier: PromptConcatTool = (hooks: PromptConcatHooks) => {
    // Register processPrompts handler
    if (onProcessPrompts) {
      hooks.processPrompts.tapAsync(`${modifierId}-processPrompts`, async (context, callback) => {
        try {
          const { toolConfig, prompts, messages, agentFrameworkContext } = context;

          // Skip if this config doesn't match our modifierId
          if (toolConfig.toolId !== modifierId) {
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
          const handlerContext: ModifierHandlerContext<TConfigSchema> = {
            config,
            modifierConfig: toolConfig,
            prompts,
            messages,
            agentFrameworkContext,

            findPrompt: (id: string) => findPromptById(prompts, id),

            insertContent: (options: InsertContentOptions) => {
              const target = findPromptById(prompts, options.targetId);
              if (!target) {
                logger.warn('Target prompt not found for content insertion', {
                  targetId: options.targetId,
                  modifierId,
                });
                return;
              }

              const newPrompt: IPrompt = typeof options.content === 'string'
                ? {
                  id: options.id ?? `${modifierId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  caption: options.caption ?? 'Inserted Content',
                  text: options.content,
                }
                : options.content;

              if (options.position === 'child') {
                if (!target.prompt.children) {
                  target.prompt.children = [];
                }
                target.prompt.children.push(newPrompt);
              } else if (options.position === 'before') {
                target.parent.splice(target.index, 0, newPrompt);
              } else {
                target.parent.splice(target.index + 1, 0, newPrompt);
              }
            },

            replaceContent: (targetId: string, content: string | IPrompt[]) => {
              const target = findPromptById(prompts, targetId);
              if (!target) {
                logger.warn('Target prompt not found for replacement', { targetId, modifierId });
                return false;
              }

              if (typeof content === 'string') {
                target.prompt.text = content;
                delete target.prompt.children;
              } else {
                delete target.prompt.text;
                target.prompt.children = content;
              }
              return true;
            },
          };

          await onProcessPrompts(handlerContext);
          callback();
        } catch (error) {
          logger.error(`Error in ${modifierId} processPrompts handler`, { error });
          callback();
        }
      });
    }

    // Register postProcess handler
    if (onPostProcess) {
      hooks.postProcess.tapAsync(`${modifierId}-postProcess`, async (context, callback) => {
        try {
          const { toolConfig, messages, agentFrameworkContext, llmResponse, responses } = context;

          if (toolConfig.toolId !== modifierId) {
            callback();
            return;
          }

          const rawConfig = (toolConfig as Record<string, unknown>)[parameterKey];
          if (!rawConfig) {
            callback();
            return;
          }

          const config = configSchema.parse(rawConfig) as z.infer<TConfigSchema>;

          const handlerContext: PostProcessModifierContext<TConfigSchema> = {
            config,
            modifierConfig: toolConfig,
            messages,
            agentFrameworkContext,
            llmResponse,
            responses,

            findPrompt: () => undefined, // Not available in postProcess

            insertContent: () => {
              logger.warn('insertContent is not available in postProcess phase');
            },

            replaceContent: () => {
              logger.warn('replaceContent is not available in postProcess phase');
              return false;
            },
          };

          await onPostProcess(handlerContext);
          callback();
        } catch (error) {
          logger.error(`Error in ${modifierId} postProcess handler`, { error });
          callback();
        }
      });
    }
  };

  return {
    modifier,
    modifierId,
    configSchema,
    displayName: definition.displayName,
    description: definition.description,
  };
}

/**
 * Registry for modifiers
 */
const modifierRegistry = new Map<string, ReturnType<typeof defineModifier>>();

/**
 * Register a modifier definition
 */
export function registerModifier<TConfigSchema extends z.ZodType>(
  definition: ModifierDefinition<TConfigSchema>,
): ReturnType<typeof defineModifier<TConfigSchema>> {
  const modifierDefinition = defineModifier(definition);
  modifierRegistry.set(modifierDefinition.modifierId, modifierDefinition as ReturnType<typeof defineModifier>);
  return modifierDefinition;
}

/**
 * Get all registered modifiers
 */
export function getAllModifiers(): Map<string, ReturnType<typeof defineModifier>> {
  return modifierRegistry;
}

/**
 * Get a modifier by ID
 */
export function getModifier(modifierId: string): ReturnType<typeof defineModifier> | undefined {
  return modifierRegistry.get(modifierId);
}
