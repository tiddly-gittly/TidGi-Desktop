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
});
