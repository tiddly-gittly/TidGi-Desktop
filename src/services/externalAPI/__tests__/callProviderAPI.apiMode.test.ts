import { describe, expect, it } from 'vitest';

import { toCoreProviderConfig } from '../callProviderAPI';

describe('OpenAI-compatible model API mode', () => {
  it.each(['chat-completions', 'responses'] as const)(
    'passes model-level %s mode and a normalized /v1 base URL to core',
    (apiMode) => {
      const coreConfig = toCoreProviderConfig(
        {
          provider: 'cpa-test',
          providerClass: 'openAICompatible',
          baseURL: 'https://models.example.test',
          apiKey: 'unit-test-secret',
          models: [
            { name: 'chat-model', apiMode: 'chat-completions' },
            { name: 'responses-model', apiMode: 'responses' },
          ],
        },
        { name: `${apiMode}-model`, apiMode },
      );

      expect(coreConfig).toEqual(expect.objectContaining({
        provider: 'openai',
        baseUrl: 'https://models.example.test/v1',
        openAIApiMode: apiMode,
      }));
    },
  );

  it('supplies an SDK-only placeholder for an unauthenticated loopback server', () => {
    const coreConfig = toCoreProviderConfig({
      provider: 'local-test',
      providerClass: 'openAICompatible',
      baseURL: 'http://127.0.0.1:15121/v1',
      models: [{ name: 'local-model', apiMode: 'chat-completions' }],
    });

    expect(coreConfig.apiKey).toBe('local-no-auth');
  });
});
