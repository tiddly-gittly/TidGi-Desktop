import { t } from '@services/libs/i18n/placeholder';
import { z } from 'zod/v4';

/**
 * Single model selection schema with provider and model
 * Used for each model type (default, embedding, speech, etc.)
 */
export const ModelSelectionSchema = z.object({
  provider: z.string().meta({
    title: t('Schema.ModelSelection.ProviderTitle'),
    description: t('Schema.ModelSelection.Provider'),
  }),
  model: z.string().meta({
    title: t('Schema.ModelSelection.ModelTitle'),
    description: t('Schema.ModelSelection.Model'),
  }),
})
  .catchall(z.unknown())
  .meta({
    title: t('Schema.ModelSelection.Title'),
    description: t('Schema.ModelSelection.Description'),
  });

/**
 * Model parameters schema
 */
export const ModelParametersSchema = z.object({
  temperature: z.number().optional().meta({
    title: t('Schema.ModelParameters.TemperatureTitle'),
    description: t('Schema.ModelParameters.Temperature'),
  }),
  maxTokens: z.number().optional().meta({
    title: t('Schema.ModelParameters.MaxTokensTitle'),
    description: t('Schema.ModelParameters.MaxTokens'),
  }),
  topP: z.number().optional().meta({
    title: t('Schema.ModelParameters.TopPTitle'),
    description: t('Schema.ModelParameters.TopP'),
  }),
  systemPrompt: z.string().optional().meta({
    title: t('Schema.ModelParameters.SystemPromptTitle'),
    description: t('Schema.ModelParameters.SystemPrompt'),
  }),
})
  .catchall(z.unknown())
  .meta({
    title: t('Schema.ModelParameters.Title'),
    description: t('Schema.ModelParameters.Description'),
  });

export type ModelParameters = z.infer<typeof ModelParametersSchema>;
export type ModelSelection = z.infer<typeof ModelSelectionSchema>;
