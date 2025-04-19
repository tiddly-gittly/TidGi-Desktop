import { z } from 'zod';

/**
 * Provider and model selection schema
 */
export const ProviderModelSchema = z.object({
  provider: z.string().describe('AI provider name'),
  model: z.string().describe('AI model name'),
})
  .catchall(z.unknown())
  .describe('Provider and model configuration');

/**
 * Model parameters schema
 */
export const ModelParametersSchema = z.object({
  temperature: z.number().optional().describe('Temperature for response generation (higher = more creative)'),
  maxTokens: z.number().optional().describe('Maximum number of tokens to generate'),
  topP: z.number().optional().describe('Top P sampling parameter'),
  systemPrompt: z.string().optional().describe('System prompt for the model'),
})
  .catchall(z.unknown())
  .describe('Model parameters');

export type ModelParameters = z.infer<typeof ModelParametersSchema>;
export type ProviderModel = z.infer<typeof ProviderModelSchema>;
