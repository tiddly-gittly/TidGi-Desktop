import { identity } from 'lodash';
import { z } from 'zod/v4';
import { ModelParametersSchema, ProviderModelSchema } from './modelParameters';
import { PluginSchema } from './plugin';
import { PromptSchema } from './prompts';
import { ResponseSchema } from './response';
import { HANDLER_CONFIG_UI_SCHEMA } from './uiSchema';

/** Placeholder to trigger VSCode i18nAlly extension to show translated text. */
const t = identity;

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
 * Handler configuration schema
 * Contains the handler-related configuration fields for prompts, responses, and plugins
 */
export const HandlerConfigSchema = z.object({
  prompts: z.array(PromptSchema).meta({
    description: t('Schema.AgentConfig.PromptConfig.Prompts'),
    title: t('PromptConfig.Tabs.Prompts'),
  }),
  response: z.array(ResponseSchema).meta({
    description: t('Schema.AgentConfig.PromptConfig.Response'),
    title: t('PromptConfig.Tabs.Response'),
  }),
  plugins: z.array(PluginSchema).meta({
    description: t('Schema.AgentConfig.PromptConfig.Plugins'),
    title: t('PromptConfig.Tabs.Plugins'),
  }),
}).meta({
  title: t('Schema.AgentConfig.PromptConfig.Title'),
  description: t('Schema.AgentConfig.PromptConfig.Description'),
  uiSchema: HANDLER_CONFIG_UI_SCHEMA,
});
/**
 * Agent configuration schema
 * @example
 * ```json
 * {
 *   "id": "example-agent",
 *   "api": {
 *     "provider": "siliconflow",
 *     "model": "Qwen/Qwen2.5-7B-Instruct"
 *   },
 *   "modelParameters": { ... },
 *   "handlerConfig": {
 *     "prompts": [ ... ],
 *     "response": [ ... ],
 *     "plugins": [ ... ],
 *   }
 * }
 * ```
 */
export const AgentConfigSchema = BaseAPIConfigSchema.extend({
  id: z.string().meta({
    title: t('Schema.AgentConfig.IdTitle'),
    description: t('Schema.AgentConfig.Id'),
  }),
  handlerConfig: HandlerConfigSchema,
}).meta({
  title: t('Schema.AgentConfig.Title'),
  description: t('Schema.AgentConfig.Description'),
});

/**
 * Default agents list schema
 * Contains an array of agent configurations
 */
export const DefaultAgentsSchema = z.array(AgentConfigSchema).meta({
  title: t('Schema.DefaultAgents.Title'),
  description: t('Schema.DefaultAgents.Description'),
});

export type DefaultAgents = z.infer<typeof DefaultAgentsSchema>;
export type AgentPromptDescription = z.infer<typeof AgentConfigSchema>;
export type AiAPIConfig = z.infer<typeof AIConfigSchema>;
export type HandlerConfig = z.infer<typeof HandlerConfigSchema>;

// Re-export all schemas and types
export * from './modelParameters';
export * from './plugin';
export * from './prompts';
export * from './response';
