import type { ModelCatalogModel, ProviderAccountConfig } from 'memeloop';
import { describe, expect, it } from 'vitest';

import { resolveModelRequestSettings, resolveProviderCatalogModel, resolveProviderModelRoute } from '../callProviderAPI';

const catalogModel: ModelCatalogModel = {
  id: 'reasoning',
  name: 'Reasoning model',
  attachment: true,
  reasoning: true,
  toolCall: true,
  limit: { context: 1_050_000, output: 32_768 },
  modalities: { input: ['text', 'image'], output: ['text'] },
};

const account: ProviderAccountConfig = {
  providerId: 'cpa-test',
  providerType: 'openai-compatible',
  baseUrl: 'https://models.example.test/v1',
  models: [
    { modelId: 'fast', wireModelId: 'vendor/fast-v3', apiMode: 'chat-completions' },
    { modelId: 'reasoning', wireModelId: 'vendor/reasoning-v7', apiMode: 'responses' },
  ],
  catalogProvider: {
    id: 'cpa-test',
    name: 'CPA test',
    env: [],
    models: [catalogModel],
  },
};

describe('canonical provider route request settings', () => {
  it('keeps logical and wire model IDs separate and preserves route API mode', () => {
    expect(resolveProviderModelRoute(account, 'reasoning')).toEqual({
      modelId: 'reasoning',
      wireModelId: 'vendor/reasoning-v7',
      apiMode: 'responses',
    });
    expect(() => resolveProviderModelRoute(account, 'vendor/reasoning-v7')).toThrow(
      'Model route not found',
    );
  });

  it('resolves exact Core catalog metadata for a route', () => {
    const route = resolveProviderModelRoute(account, 'reasoning');
    expect(resolveProviderCatalogModel(account, route)).toBe(catalogModel);
  });

  it('uses catalog output limit and explicit canonical agent parameters', () => {
    expect(resolveModelRequestSettings(account, catalogModel, {
      reasoningEffort: 'high',
      topP: 0.95,
    })).toEqual({
      maxOutputTokens: 32_768,
      providerOptions: { openai: { reasoningEffort: 'high' } },
      temperature: 0.7,
      topP: 0.95,
    });
    expect(resolveModelRequestSettings(account, catalogModel, {
      maxOutputTokens: 4096,
      reasoningEffort: 'medium',
      temperature: 0.2,
      topP: 0.4,
    })).toEqual({
      maxOutputTokens: 4096,
      providerOptions: { openai: { reasoningEffort: 'medium' } },
      temperature: 0.2,
      topP: 0.4,
    });
  });

  it('does not emit OpenAI reasoning options for a non-OpenAI provider', () => {
    expect(
      resolveModelRequestSettings(
        { ...account, providerType: 'anthropic' },
        catalogModel,
        { reasoningEffort: 'high' },
      ).providerOptions,
    ).toBeUndefined();
  });
});
