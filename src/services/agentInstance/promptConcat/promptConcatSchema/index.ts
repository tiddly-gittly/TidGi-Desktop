import { identity } from 'lodash';
import { z } from 'zod/v4';
import { ModelParametersSchema, ProviderModelSchema } from './modelParameters';
import { PromptDynamicModificationSchema } from './promptDynamicModification';
import { PromptSchema } from './prompts';
import { ResponseSchema } from './response';
import { ResponseDynamicModificationSchema } from './responseDynamicModification';
import { HANDLER_CONFIG_UI_SCHEMA } from './uiSchema';

/** Placeholder to trigger VSCode i18nAlly extension to show translated text. */
const t = identity;

/**
 * Base API configuration schema
 * Contains common fields shared between AIConfigSchema and AgentConfigSchema
 */
export const BaseAPIConfigSchema = z.object({
  api: ProviderModelSchema.describe(t('Schema.BaseAPIConfig.API')),
  modelParameters: ModelParametersSchema.describe(t('Schema.BaseAPIConfig.ModelParameters')),
}).describe(t('Schema.BaseAPIConfig.Description'));

/**
 * AI configuration schema for session settings
 */
export const AIConfigSchema = BaseAPIConfigSchema
  .describe(t('Schema.AIConfig.Description'));

/**
 * Handler configuration schema
 * Contains the handler-related configuration fields for prompts and responses
 */
export const HandlerConfigSchema = z.object({
  prompts: z.array(PromptSchema)
    .describe(t('Schema.AgentConfig.PromptConfig.Prompts'))
    .meta({ title: t('PromptConfig.Tabs.Prompts') }),
  promptDynamicModification: z.array(PromptDynamicModificationSchema)
    .describe(t('Schema.AgentConfig.PromptConfig.PromptDynamicModification'))
    .meta({ title: t('PromptConfig.Tabs.PromptDynamicModification') }),
  response: z.array(ResponseSchema)
    .describe(t('Schema.AgentConfig.PromptConfig.Response'))
    .meta({ title: t('PromptConfig.Tabs.Response') }),
  responseDynamicModification: z.array(ResponseDynamicModificationSchema)
    .describe(t('Schema.AgentConfig.PromptConfig.ResponseDynamicModification'))
    .meta({ title: t('PromptConfig.Tabs.ResponseDynamicModification') }),
}).describe(t('Schema.AgentConfig.PromptConfig.Description')).meta({
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
 *   "promptConfig": {
 *     "prompts": [ ... ],
 *     "promptDynamicModification": [ ... ],
 *     "response": [ ... ],
 *     "responseDynamicModification": [ ... ]
 *   }
 * }
 * ```
 */
export const AgentConfigSchema = BaseAPIConfigSchema.extend({
  id: z.string().describe(t('Schema.AgentConfig.Id')),
  promptConfig: HandlerConfigSchema,
}).describe(t('Schema.AgentConfig.Description'));

/**
 * Default agents list schema
 * Contains an array of agent configurations
 */
export const DefaultAgentsSchema = z.array(AgentConfigSchema).describe(t('Schema.DefaultAgents.Description'));

export type DefaultAgents = z.infer<typeof DefaultAgentsSchema>;
export type AgentPromptDescription = z.infer<typeof AgentConfigSchema>;
export type AiAPIConfig = z.infer<typeof AIConfigSchema>;
export type HandlerConfig = z.infer<typeof HandlerConfigSchema>;

// Re-export all schemas and types
export * from './modelParameters';
export * from './promptDynamicModification';
export * from './prompts';
export * from './response';
export * from './responseDynamicModification';
