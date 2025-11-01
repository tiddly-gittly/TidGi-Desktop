import { t } from '@services/libs/i18n/placeholder';
import { z } from 'zod/v4';

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
  speechModel: z.string().optional().meta({
    title: t('Schema.ProviderModel.SpeechModelTitle'),
    description: t('Schema.ProviderModel.SpeechModel'),
  }),
  imageGenerationModel: z.string().optional().meta({
    title: t('Schema.ProviderModel.ImageGenerationModelTitle'),
    description: t('Schema.ProviderModel.ImageGenerationModel'),
  }),
  transcriptionsModel: z.string().optional().meta({
    title: t('Schema.ProviderModel.TranscriptionsModelTitle'),
    description: t('Schema.ProviderModel.TranscriptionsModel'),
  }),
  summaryModel: z.string().optional().meta({
    title: t('Schema.ProviderModel.SummaryModelTitle'),
    description: t('Schema.ProviderModel.SummaryModel'),
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
