import { createDynamicPromptConcatToolSchema } from '@services/agentInstance/tools/schemaRegistry';
import { t } from '@services/libs/i18n/placeholder';
import { z } from 'zod/v4';
import { ModelParametersSchema, ProviderModelSchema } from './modelParameters';
import { PromptSchema } from './prompts';
import { ResponseSchema } from './response';
import { HANDLER_CONFIG_UI_SCHEMA } from './uiSchema';

/**
 * Base API configuration schema
 * Contains common fields shared between AIConfigSchema and AgentConfigSchema
 */
export const BaseAPIConfigSchema = z.object({
  api: ProviderModelSchema.meta({
    title: t('Schema.BaseAPIConfig.APITitle'),
    description: t('Schema.BaseAPIConfig.API'),
  }),
  modelParameters: ModelParametersSchema.meta({
    title: t('Schema.BaseAPIConfig.ModelParametersTitle'),
    description: t('Schema.BaseAPIConfig.ModelParameters'),
  }),
}).meta({
  title: t('Schema.BaseAPIConfig.Title'),
  description: t('Schema.BaseAPIConfig.Description'),
});

/**
 * AI configuration schema for session settings
 */
export const AIConfigSchema = BaseAPIConfigSchema
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

  return BaseAPIConfigSchema.extend({
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
// Backward compat alias
export type agentFrameworkConfig = AgentFrameworkConfig;

// Re-export all schemas and types
export * from './modelParameters';
export * from './plugin';
export * from './prompts';
export * from './response';

// Also export IPromptConcatTool as IPrompt for easier imports
export type { IPromptConcatTool as IPromptConcatPlugin } from './plugin';
