import { z } from 'zod';
import { i18n } from '@services/libs/i18n';
import { ModelParametersSchema, ProviderModelSchema } from './modelParameters';
import { PromptDynamicModificationSchema } from './promptDynamicModification';
import { PromptSchema } from './prompts';
import { ResponseSchema } from './response';
import { ResponseDynamicModificationSchema } from './responseDynamicModification';

/**
 * Base API configuration schema
 * Contains common fields shared between AIConfigSchema and AgentConfigSchema
 */
export const BaseAPIConfigSchema = z.object({
  api: ProviderModelSchema.describe(i18n.t('Schema.BaseAPIConfig.API')),
  modelParameters: ModelParametersSchema.describe(i18n.t('Schema.BaseAPIConfig.ModelParameters')),
}).describe(i18n.t('Schema.BaseAPIConfig.Description'));

/**
 * AI configuration schema for session settings
 */
export const AIConfigSchema = BaseAPIConfigSchema
  .describe(i18n.t('Schema.AIConfig.Description'));

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
  id: z.string().describe(i18n.t('Schema.AgentConfig.Id')),
  promptConfig: z.object({
    prompts: z.array(PromptSchema).describe(i18n.t('Schema.AgentConfig.PromptConfig.Prompts')),
    promptDynamicModification: z.array(PromptDynamicModificationSchema).describe(i18n.t('Schema.AgentConfig.PromptConfig.PromptDynamicModification')),
    response: z.array(ResponseSchema).describe(i18n.t('Schema.AgentConfig.PromptConfig.Response')),
    responseDynamicModification: z.array(ResponseDynamicModificationSchema).describe(i18n.t('Schema.AgentConfig.PromptConfig.ResponseDynamicModification')),
  }).describe(i18n.t('Schema.AgentConfig.PromptConfig.Description')),
}).describe(i18n.t('Schema.AgentConfig.Description'));

/**
 * Default agents list schema
 * Contains an array of agent configurations
 */
export const DefaultAgentsSchema = z.array(AgentConfigSchema).describe(i18n.t('Schema.DefaultAgents.Description'));

export type DefaultAgents = z.infer<typeof DefaultAgentsSchema>;
export type AgentPromptDescription = z.infer<typeof AgentConfigSchema>;
export type AiAPIConfig = z.infer<typeof AIConfigSchema>;

// Re-export all schemas and types
export * from './modelParameters';
export * from './promptDynamicModification';
export * from './prompts';
export * from './response';
export * from './responseDynamicModification';
