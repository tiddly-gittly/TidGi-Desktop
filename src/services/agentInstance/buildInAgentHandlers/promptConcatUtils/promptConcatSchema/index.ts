import { z } from 'zod';
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
  api: ProviderModelSchema.describe('API provider and model configuration'),
  modelParameters: ModelParametersSchema.describe('Model parameters configuration'),
}).describe('Base API configuration');

/**
 * AI configuration schema for session settings
 */
export const AIConfigSchema = BaseAPIConfigSchema
  .describe('AI configuration');

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
  id: z.string().describe('Agent unique identifier'),
  promptConfig: z.object({
    prompts: z.array(PromptSchema).describe('List of prompt configurations'),
    promptDynamicModification: z.array(PromptDynamicModificationSchema).describe('List of prompt dynamic modification configurations'),
    response: z.array(ResponseSchema).describe('List of response configurations'),
    responseDynamicModification: z.array(ResponseDynamicModificationSchema).describe('List of response dynamic modification configurations'),
  }).describe('Prompt configuration'),
}).describe('Agent configuration');

/**
 * Default agents list schema
 * Contains an array of agent configurations
 */
export const DefaultAgentsSchema = z.array(AgentConfigSchema).describe('List of default agent configurations');

export type DefaultAgents = z.infer<typeof DefaultAgentsSchema>;
export type AgentPromptDescription = z.infer<typeof AgentConfigSchema>;
export type AiAPIConfig = z.infer<typeof AIConfigSchema>;

// Re-export all schemas and types
export * from './modelParameters';
export * from './promptDynamicModification';
export * from './prompts';
export * from './response';
export * from './responseDynamicModification';
