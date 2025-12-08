import { createDynamicPromptConcatToolSchema } from '@services/agentInstance/tools/schemaRegistry';
import { t } from '@services/libs/i18n/placeholder';
import { z } from 'zod/v4';
import { ModelParametersSchema, ModelSelectionSchema } from './modelParameters';
import { PromptSchema } from './prompts';
import { ResponseSchema } from './response';
import { HANDLER_CONFIG_UI_SCHEMA } from './uiSchema';

/**
 * AI configuration schema with separate model selections
 * Each model type has its own provider and model fields
 */
export const AIConfigSchema = z.object({
  // Default language model
  default: ModelSelectionSchema.optional().meta({
    title: t('Schema.AIConfig.DefaultTitle'),
    description: t('Schema.AIConfig.Default'),
  }),
  // Embedding model
  embedding: ModelSelectionSchema.optional().meta({
    title: t('Schema.AIConfig.EmbeddingTitle'),
    description: t('Schema.AIConfig.Embedding'),
  }),
  // Speech synthesis model (TTS)
  speech: ModelSelectionSchema.optional().meta({
    title: t('Schema.AIConfig.SpeechTitle'),
    description: t('Schema.AIConfig.Speech'),
  }),
  // Image generation model
  imageGeneration: ModelSelectionSchema.optional().meta({
    title: t('Schema.AIConfig.ImageGenerationTitle'),
    description: t('Schema.AIConfig.ImageGeneration'),
  }),
  // Transcriptions model (STT)
  transcriptions: ModelSelectionSchema.optional().meta({
    title: t('Schema.AIConfig.TranscriptionsTitle'),
    description: t('Schema.AIConfig.Transcriptions'),
  }),
  // Free model (for cost-sensitive tasks)
  free: ModelSelectionSchema.optional().meta({
    title: t('Schema.AIConfig.FreeTitle'),
    description: t('Schema.AIConfig.Free'),
  }),
  // Model parameters shared across all models
  modelParameters: ModelParametersSchema.meta({
    title: t('Schema.BaseAPIConfig.ModelParametersTitle'),
    description: t('Schema.BaseAPIConfig.ModelParameters'),
  }),
})
  .catchall(z.unknown())
  .meta({
    title: t('Schema.AIConfig.Title'),
    description: t('Schema.AIConfig.Description'),
  });

/**
 * Framework configuration schema
 * Contains the framework-related configuration fields for prompts, responses, and tools
 * This is dynamically generated to include all registered tools
 */
export function getFrameworkConfigSchema() {
  const dynamicToolSchema = createDynamicPromptConcatToolSchema();

  return z.object({
    prompts: z.array(PromptSchema).meta({
      description: t('Schema.AgentConfig.PromptConfig.Prompts'),
      title: t('PromptConfig.Tabs.Prompts'),
    }),
    response: z.array(ResponseSchema).meta({
      description: t('Schema.AgentConfig.PromptConfig.Response'),
      title: t('PromptConfig.Tabs.Response'),
    }),
    plugins: z.array(dynamicToolSchema).meta({
      description: t('Schema.AgentConfig.PromptConfig.Plugins'),
      title: t('PromptConfig.Tabs.Plugins'),
    }),
  }).meta({
    title: t('Schema.AgentConfig.PromptConfig.Title'),
    description: t('Schema.AgentConfig.PromptConfig.Description'),
    uiSchema: HANDLER_CONFIG_UI_SCHEMA,
  });
}

/**
 * Agent configuration schema (dynamic)
 * @example
 * ```json
 * {
 *   "id": "task-agent",
 *   "api": {
 *     "provider": "siliconflow",
 *     "model": "Qwen/Qwen2.5-7B-Instruct"
 *   },
 *   "modelParameters": { ... },
 *   "agentFrameworkConfig": {
 *     "prompts": [ ... ],
 *     "response": [ ... ],
 *     "plugins": [ ... ],
 *   }
 * }
 * ```
 */
export function getAgentConfigSchema() {
  const dynamicFrameworkConfigSchema = getFrameworkConfigSchema();

  return AIConfigSchema.extend({
    id: z.string().meta({
      title: t('Schema.AgentConfig.IdTitle'),
      description: t('Schema.AgentConfig.Id'),
    }),
    agentFrameworkConfig: dynamicFrameworkConfigSchema,
  }).meta({
    title: t('Schema.AgentConfig.Title'),
    description: t('Schema.AgentConfig.Description'),
  });
}

/**
 * Default agents list schema (dynamic)
 * Contains an array of agent configurations
 */
export function getDefaultAgentsSchema() {
  const dynamicAgentConfigSchema = getAgentConfigSchema();
  return z.array(dynamicAgentConfigSchema).meta({
    title: t('Schema.DefaultAgents.Title'),
    description: t('Schema.DefaultAgents.Description'),
  });
}

export type DefaultAgents = z.infer<ReturnType<typeof getDefaultAgentsSchema>>;
export type AgentPromptDescription = z.infer<ReturnType<typeof getAgentConfigSchema>>;
export type AiAPIConfig = z.infer<typeof AIConfigSchema>;
export type AgentFrameworkConfig = z.infer<ReturnType<typeof getFrameworkConfigSchema>>;

// Re-export all schemas and types
export * from './modelParameters';
export * from './prompts';
export * from './response';
export * from './tools';
