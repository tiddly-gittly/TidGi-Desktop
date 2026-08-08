import { describe, expect, it } from 'vitest';

import { resolveModelRequestSettings, toCoreProviderConfig } from '../callProviderAPI';
import type { ModelInfo } from '../interface';

describe('OpenAI-compatible model API mode', () => {
  it.each(['chat-completions', 'responses'] as const)(
    'passes model-level %s mode and the explicit base URL to core',
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
        baseUrl: 'https://models.example.test',
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

  it('uses model generation defaults only when the request has no explicit override', () => {
    const model: ModelInfo = {
      name: 'reasoning-model',
      maxOutputTokens: 32_768,
      modelOptions: { top_p: 0.95 },
      supportsReasoningEffort: ['minimal', 'high'],
      reasoningEffortFormat: 'chat-completions',
    };

    expect(resolveModelRequestSettings(model, { reasoningEffort: 'high' })).toEqual({
      maxOutputTokens: 32_768,
      providerOptions: { openai: { reasoningEffort: 'high' } },
      temperature: 0.7,
      topP: 0.95,
    });
    expect(resolveModelRequestSettings(model, {
      maxOutputTokens: 4096,
      reasoningEffort: 'medium',
      temperature: 0.2,
      topP: 0.4,
    })).toEqual({
      maxOutputTokens: 4096,
      providerOptions: undefined,
      temperature: 0.2,
      topP: 0.4,
    });
  });
});
