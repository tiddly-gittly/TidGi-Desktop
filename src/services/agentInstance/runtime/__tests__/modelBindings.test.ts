import type { ILLMProvider } from 'memeloop';
import { describe, expect, it, vi } from 'vitest';

import type { IExternalAPIService } from '@services/externalAPI/interface';
import { createDesktopModelBindings } from '../runtime';

describe('createDesktopModelBindings', () => {
  it('registers exact logical/wire/API routes and converts only generation options', async () => {
    const externalAPIService = {
      getAIProviders: vi.fn(async () => [{
        provider: 'cpa',
        hasApiKey: true,
        baseURL: 'https://models.example.test',
        models: [
          { name: 'gpt-5.6-sol', apiMode: 'responses' as const, features: ['language' as const, 'toolCalling' as const] },
          { name: 'deepseek/v4', apiMode: 'chat-completions' as const, features: ['language' as const] },
        ],
      }]),
      getAIConfig: vi.fn(async () => ({
        default: { provider: 'cpa', model: 'gpt-5.6-sol' },
        modelParameters: { temperature: 0.2, maxTokens: 32_768, topP: 0.95 },
      })),
      generatePortableLlm: vi.fn(),
    } as unknown as IExternalAPIService;

    const bindings = await createDesktopModelBindings(externalAPIService);

    expect(bindings.defaultModelConfig).toEqual({
      providerId: 'cpa',
      modelId: 'gpt-5.6-sol',
      parameters: { temperature: 0.2, maxOutputTokens: 32_768, topP: 0.95 },
    });
    expect(bindings.registry.resolve('cpa', 'gpt-5.6-sol')).toMatchObject({
      providerId: 'cpa',
      modelId: 'gpt-5.6-sol',
      wireModelId: 'gpt-5.6-sol',
      apiMode: 'responses',
    });
    expect(bindings.registry.resolve('cpa', 'deepseek/v4')).toMatchObject({
      wireModelId: 'deepseek/v4',
      apiMode: 'chat-completions',
    });
    expect(bindings.fallbackProvider.name).toBe('cpa');
    expect(bindings.defaultModelConfig).not.toHaveProperty('apiKey');
    expect(bindings.defaultModelConfig).not.toHaveProperty('baseURL');
  });

  it('does not register disabled providers and leaves an unconfigured host fail-closed', async () => {
    const externalAPIService = {
      getAIProviders: vi.fn(async () => [{
        provider: 'disabled-provider',
        enabled: false,
        models: [{ name: 'hidden-model' }],
      }]),
      getAIConfig: vi.fn(async () => ({ modelParameters: {} })),
    } as unknown as IExternalAPIService;

    const bindings = await createDesktopModelBindings(externalAPIService);

    expect(bindings.registry.list()).toEqual([]);
    expect(bindings.defaultModelConfig).toBeUndefined();
    expect(bindings.fallbackProvider.name).toBe('desktop-unconfigured');
    expect(bindings.fallbackProvider).toSatisfy((provider: ILLMProvider) => typeof provider.chat === 'function');
  });
});
