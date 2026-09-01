import type { ILLMProvider, ProviderAccountConfig } from 'memeloop';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { container } from '@services/container';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { createDesktopModelBindings } from '../runtime';

describe('createDesktopModelBindings', () => {
  let externalAPIService: IExternalAPIService;

  beforeEach(() => {
    externalAPIService = container.get<IExternalAPIService>(serviceIdentifier.ExternalAPI);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers exact logical/wire/API routes and forwards the canonical model config', async () => {
    const accounts: ProviderAccountConfig[] = [{
      providerId: 'cpa',
      providerType: 'openai-compatible',
      baseUrl: 'https://models.example.test',
      enabled: true,
      models: [
        { modelId: 'gpt-5.6-sol', wireModelId: 'gpt-5.6-sol', apiMode: 'responses' },
        { modelId: 'deepseek/v4', wireModelId: 'deepseek/v4', apiMode: 'chat-completions' },
      ],
    }];
    vi.spyOn(externalAPIService, 'getProviderAccounts').mockResolvedValue(accounts);
    vi.spyOn(externalAPIService, 'getAIConfig').mockResolvedValue({
      default: {
        providerId: 'cpa',
        modelId: 'gpt-5.6-sol',
        parameters: { temperature: 0.2, maxOutputTokens: 32_768, topP: 0.95, reasoningEffort: 'high' },
      },
    });

    const bindings = await createDesktopModelBindings(externalAPIService);

    expect(bindings.defaultModelConfig).toEqual({
      providerId: 'cpa',
      modelId: 'gpt-5.6-sol',
      parameters: { temperature: 0.2, maxOutputTokens: 32_768, topP: 0.95, reasoningEffort: 'high' },
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
    vi.spyOn(externalAPIService, 'getProviderAccounts').mockResolvedValue([{
      providerId: 'disabled-provider',
      providerType: 'openai-compatible',
      enabled: false,
      models: [{ modelId: 'hidden-model', wireModelId: 'hidden-model', apiMode: 'chat-completions' }],
    }]);
    vi.spyOn(externalAPIService, 'getAIConfig').mockResolvedValue({});

    const bindings = await createDesktopModelBindings(externalAPIService);

    expect(bindings.registry.list()).toEqual([]);
    expect(bindings.defaultModelConfig).toBeUndefined();
    expect(bindings.fallbackProvider.name).toBe('desktop-unconfigured');
    expect(bindings.fallbackProvider).toSatisfy((provider: ILLMProvider) => typeof provider.chat === 'function');
  });
});
