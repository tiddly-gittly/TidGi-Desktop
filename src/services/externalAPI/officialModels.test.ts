import type { ModelCatalogProvider, ProviderAccountConfig } from 'memeloop';
import { describe, expect, it, vi } from 'vitest';

import { discoverOfficialModelIds, mergeDiscoveredProviderRoutes } from './officialModels';

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  });
}

describe('official model discovery', () => {
  it.each(
    [
      {
        account: { providerId: 'openai', providerType: 'openai', models: [] },
        apiKey: 'secret',
        response: { data: [{ id: 'gpt-5' }, { id: 'gpt-4o' }] },
        expectedUrl: 'https://api.openai.com/v1/models',
        expectedHeaders: { authorization: 'Bearer secret' },
        expected: ['gpt-4o', 'gpt-5'],
      },
      {
        account: { providerId: 'anthropic', providerType: 'anthropic', models: [] },
        apiKey: 'secret',
        response: { data: [{ id: 'claude-opus-4' }] },
        expectedUrl: 'https://api.anthropic.com/v1/models?limit=1000',
        expectedHeaders: { 'x-api-key': 'secret', 'anthropic-version': '2023-06-01' },
        expected: ['claude-opus-4'],
      },
      {
        account: { providerId: 'google', providerType: 'google', models: [] },
        apiKey: 'secret',
        response: { models: [{ name: 'models/gemini-2.5-pro' }] },
        expectedUrl: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
        expectedHeaders: { 'x-goog-api-key': 'secret' },
        expected: ['gemini-2.5-pro'],
      },
      {
        account: {
          providerId: 'ollama',
          providerType: 'ollama',
          baseUrl: 'http://localhost:11434',
          models: [],
        },
        apiKey: '',
        response: { models: [{ name: 'qwen3:latest' }] },
        expectedUrl: 'http://localhost:11434/api/tags',
        expectedHeaders: {},
        expected: ['qwen3:latest'],
      },
    ] satisfies Array<{
      account: ProviderAccountConfig;
      apiKey: string;
      response: unknown;
      expectedUrl: string;
      expectedHeaders: Record<string, string>;
      expected: string[];
    }>,
  )('discovers exact $account.providerType routes', async ({ account, apiKey, expected, expectedHeaders, expectedUrl, response }) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => jsonResponse(response));

    await expect(discoverOfficialModelIds(account, apiKey, { fetch })).resolves.toEqual(expected);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe(expectedUrl);
    expect(request?.redirect).toBe('error');
    const headers = new Headers(request?.headers);
    for (const [name, value] of Object.entries(expectedHeaders)) {
      expect(headers.get(name)).toBe(value);
    }
  });

  it('rejects API credentials sent over non-loopback HTTP', async () => {
    const account: ProviderAccountConfig = {
      providerId: 'custom',
      providerType: 'openai-compatible',
      baseUrl: 'http://models.example.com/v1',
      models: [],
    };
    await expect(discoverOfficialModelIds(account, 'secret')).rejects.toThrow('HTTPS');
  });

  it('stops reading a chunked response after the aggregate size limit', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(80));
              controller.enqueue(new Uint8Array(80));
              controller.close();
            },
          }),
        ),
    );
    const account: ProviderAccountConfig = {
      providerId: 'openai',
      providerType: 'openai',
      models: [],
    };

    await expect(discoverOfficialModelIds(account, 'secret', { fetch, maxBytes: 100 })).rejects.toThrow(
      'size limit',
    );
  });

  it('follows bounded Anthropic pagination', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse({
        data: [{ id: 'claude-first' }],
        has_more: true,
        last_id: 'claude-first',
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: [{ id: 'claude-second' }],
        has_more: false,
      }));
    const account: ProviderAccountConfig = {
      providerId: 'anthropic',
      providerType: 'anthropic',
      models: [],
    };

    await expect(discoverOfficialModelIds(account, 'secret', { fetch })).resolves.toEqual([
      'claude-first',
      'claude-second',
    ]);
    expect(fetch.mock.calls[1][0]).toBe(
      'https://api.anthropic.com/v1/models?limit=1000&after_id=claude-first',
    );
  });

  it('adds logical-to-wire routes without replacing existing routes or catalog metadata', () => {
    const account: ProviderAccountConfig = {
      providerId: 'openai',
      providerType: 'openai',
      models: [{ modelId: 'assistant', wireModelId: 'gpt-5', apiMode: 'responses' }],
    };
    const catalogProvider: ModelCatalogProvider = {
      id: 'openai',
      name: 'OpenAI',
      env: ['OPENAI_API_KEY'],
      models: [{
        id: 'gpt-5',
        name: 'GPT-5',
        attachment: true,
        reasoning: true,
        toolCall: true,
        modalities: { input: ['text', 'image'], output: ['text'] },
      }],
    };

    expect(mergeDiscoveredProviderRoutes(account, ['gpt-5', 'gpt-4o'], catalogProvider)).toEqual({
      providerId: 'openai',
      providerType: 'openai',
      models: [
        { modelId: 'assistant', wireModelId: 'gpt-5', apiMode: 'responses' },
        { modelId: 'gpt-4o', wireModelId: 'gpt-4o', apiMode: 'responses' },
        { modelId: 'gpt-5', wireModelId: 'gpt-5', apiMode: 'responses' },
      ],
      catalogProvider,
    });
  });
});
