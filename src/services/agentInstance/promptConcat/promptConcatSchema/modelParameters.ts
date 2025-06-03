import { identity } from 'lodash';
import { z } from 'zod/v4';

/** Placeholder to trigger VSCode i18nAlly extension to show translated text. */
const t = identity;

/**
 * Provider and model selection schema
 */
export const ProviderModelSchema = z.object({
  provider: z.string().meta({ description: t('Schema.ProviderModel.Provider') }),
  model: z.string().meta({ description: t('Schema.ProviderModel.Model') }),
})
  .catchall(z.unknown())
  .meta({ description: t('Schema.ProviderModel.Description') });

/**
 * Model parameters schema
 */
export const ModelParametersSchema = z.object({
  temperature: z.number().optional().meta({ description: t('Schema.ModelParameters.Temperature') }),
  maxTokens: z.number().optional().meta({ description: t('Schema.ModelParameters.MaxTokens') }),
  topP: z.number().optional().meta({ description: t('Schema.ModelParameters.TopP') }),
  systemPrompt: z.string().optional().meta({ description: t('Schema.ModelParameters.SystemPrompt') }),
})
  .catchall(z.unknown())
  .meta({ description: t('Schema.ModelParameters.Description') });

export type ModelParameters = z.infer<typeof ModelParametersSchema>;
export type ProviderModel = z.infer<typeof ProviderModelSchema>;
