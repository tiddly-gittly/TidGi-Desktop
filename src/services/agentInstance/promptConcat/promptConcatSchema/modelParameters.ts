import { identity } from 'lodash';
import { z } from 'zod/v4';

/** Placeholder to trigger VSCode i18nAlly extension to show translated text. */
const t = identity;

/**
 * Provider and model selection schema
 */
export const ProviderModelSchema = z.object({
  provider: z.string().meta({
    title: t('Schema.ProviderModel.ProviderTitle'),
    description: t('Schema.ProviderModel.Provider'),
  }),
  model: z.string().meta({
    title: t('Schema.ProviderModel.ModelTitle'),
    description: t('Schema.ProviderModel.Model'),
  }),
  embeddingModel: z.string().optional().meta({
    title: t('Schema.ProviderModel.EmbeddingModelTitle'),
    description: t('Schema.ProviderModel.EmbeddingModel'),
  }),
})
  .catchall(z.unknown())
  .meta({
    title: t('Schema.ProviderModel.Title'),
    description: t('Schema.ProviderModel.Description'),
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
export type ProviderModel = z.infer<typeof ProviderModelSchema>;
