import { identity } from 'lodash';
import { z } from 'zod/v4';

/** Placeholder to trigger VSCode i18nAlly extension to show translated text. */
const t = identity;

/**
 * Provider and model selection schema
 */
export const ProviderModelSchema = z.object({
  provider: z.string().describe(t('Schema.ProviderModel.Provider')),
  model: z.string().describe(t('Schema.ProviderModel.Model')),
})
  .catchall(z.unknown())
  .describe(t('Schema.ProviderModel.Description'));

/**
 * Model parameters schema
 */
export const ModelParametersSchema = z.object({
  temperature: z.number().optional().describe(t('Schema.ModelParameters.Temperature')),
  maxTokens: z.number().optional().describe(t('Schema.ModelParameters.MaxTokens')),
  topP: z.number().optional().describe(t('Schema.ModelParameters.TopP')),
  systemPrompt: z.string().optional().describe(t('Schema.ModelParameters.SystemPrompt')),
})
  .catchall(z.unknown())
  .describe(t('Schema.ModelParameters.Description'));

export type ModelParameters = z.infer<typeof ModelParametersSchema>;
export type ProviderModel = z.infer<typeof ProviderModelSchema>;
