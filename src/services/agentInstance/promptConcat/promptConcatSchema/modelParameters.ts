import { i18n } from '@services/libs/i18n';
import { z } from 'zod/v4';

/**
 * Provider and model selection schema
 */
export const ProviderModelSchema = z.object({
  provider: z.string().describe(i18n.t('Schema.ProviderModel.Provider')),
  model: z.string().describe(i18n.t('Schema.ProviderModel.Model')),
})
  .catchall(z.unknown())
  .describe(i18n.t('Schema.ProviderModel.Description'));

/**
 * Model parameters schema
 */
export const ModelParametersSchema = z.object({
  temperature: z.number().optional().describe(i18n.t('Schema.ModelParameters.Temperature')),
  maxTokens: z.number().optional().describe(i18n.t('Schema.ModelParameters.MaxTokens')),
  topP: z.number().optional().describe(i18n.t('Schema.ModelParameters.TopP')),
  systemPrompt: z.string().optional().describe(i18n.t('Schema.ModelParameters.SystemPrompt')),
})
  .catchall(z.unknown())
  .describe(i18n.t('Schema.ModelParameters.Description'));

export type ModelParameters = z.infer<typeof ModelParametersSchema>;
export type ProviderModel = z.infer<typeof ProviderModelSchema>;
