import { describe, expect, it, vi } from 'vitest';

import type { AIProviderConfig, ModelInfo } from './interface';
import { discoverOfficialModelIds, mergeOfficialModels } from './officialModels';

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
        provider: { provider: 'openai', providerClass: 'openai', apiKey: 'secret', models: [] },
        response: { data: [{ id: 'gpt-5' }, { id: 'gpt-4o' }] },
        expectedURL: 'https://api.openai.com/v1/models',
        expectedHeaders: { authorization: 'Bearer secret' },
        expected: ['gpt-4o', 'gpt-5'],
      },
      {
        provider: { provider: 'anthropic', providerClass: 'anthropic', apiKey: 'secret', models: [] },
        response: { data: [{ id: 'claude-opus-4' }] },
        expectedURL: 'https://api.anthropic.com/v1/models?limit=1000',
        expectedHeaders: { 'x-api-key': 'secret', 'anthropic-version': '2023-06-01' },
        expected: ['claude-opus-4'],
      },
      {
        provider: { provider: 'google', providerClass: 'google', apiKey: 'secret', models: [] },
        response: { models: [{ name: 'models/gemini-2.5-pro' }] },
        expectedURL: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
        expectedHeaders: { 'x-goog-api-key': 'secret' },
        expected: ['gemini-2.5-pro'],
      },
      {
        provider: { provider: 'ollama', providerClass: 'ollama', baseURL: 'http://localhost:11434', models: [] },
        response: { models: [{ name: 'qwen3:latest' }] },
        expectedURL: 'http://localhost:11434/api/tags',
        expectedHeaders: {},
        expected: ['qwen3:latest'],
      },
    ] satisfies Array<{
      provider: AIProviderConfig;
      response: unknown;
      expectedURL: string;
      expectedHeaders: Record<string, string>;
      expected: string[];
    }>,
  )('discovers $provider.provider models', async ({ expected, expectedHeaders, expectedURL, provider, response }) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => jsonResponse(response));

    await expect(discoverOfficialModelIds(provider, { fetch })).resolves.toEqual(expected);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe(expectedURL);
    expect(request?.redirect).toBe('error');
    const headers = new Headers(request?.headers);
    for (const [name, value] of Object.entries(expectedHeaders)) {
      expect(headers.get(name)).toBe(value);
    }
  });

  it('rejects API credentials sent over non-loopback HTTP', async () => {
    const provider: AIProviderConfig = {
      provider: 'custom',
      providerClass: 'openAICompatible',
      baseURL: 'http://models.example.com/v1',
      apiKey: 'secret',
      models: [],
    };
    await expect(discoverOfficialModelIds(provider)).rejects.toThrow('HTTPS');
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
    const provider: AIProviderConfig = {
      provider: 'openai',
      providerClass: 'openai',
      apiKey: 'secret',
      models: [],
    };

    await expect(discoverOfficialModelIds(provider, { fetch, maxBytes: 100 })).rejects.toThrow(
      'size limit',
    );
  });

  it('follows bounded Anthropic model pagination', async () => {
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
    const provider: AIProviderConfig = {
      provider: 'anthropic',
      providerClass: 'anthropic',
      apiKey: 'secret',
      models: [],
    };

    await expect(discoverOfficialModelIds(provider, { fetch })).resolves.toEqual([
      'claude-first',
      'claude-second',
    ]);
    expect(fetch.mock.calls[1][0]).toBe(
      'https://api.anthropic.com/v1/models?limit=1000&after_id=claude-first',
    );
  });

  it('merges exact catalog metadata while retaining manually configured models', () => {
    const manual: ModelInfo = { name: 'my-finetune', caption: 'My fine-tune', features: ['language'] };
    const previousDiscovery: ModelInfo = {
      name: 'gone-model',
      features: ['language'],
      metadata: { officialDiscovery: true },
    };
    const catalog: ModelInfo[] = [
      { name: 'gpt-5', caption: 'GPT-5', features: ['language', 'reasoning'] },
    ];

    expect(mergeOfficialModels([manual, previousDiscovery], ['gpt-5'], catalog)).toEqual([
      manual,
      {
        name: 'gpt-5',
        caption: 'GPT-5',
        features: ['language', 'reasoning'],
        metadata: { officialDiscovery: true },
      },
    ]);
  });
});
