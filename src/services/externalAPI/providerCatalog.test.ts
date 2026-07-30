import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveDesktopProviderCatalog } from './providerCatalog';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('provider catalog', () => {
  it('returns the embedded catalog immediately before the first refresh', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tidgi-provider-catalog-'));
    temporaryDirectories.push(directory);
    let fetched = false;

    const result = await resolveDesktopProviderCatalog({
      cachePath: path.join(directory, 'missing.json'),
      fetch: async () => {
        fetched = true;
        throw new Error('must not fetch');
      },
    });

    expect(result.status.source).toBe('embedded');
    expect(result.providers.length).toBeGreaterThan(100);
    expect(result.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: 'ollama',
        providerClass: 'ollama',
        baseURL: 'http://localhost:11434',
      }),
      expect.objectContaining({
        provider: 'comfyui',
        providerClass: 'comfyui',
        baseURL: 'http://localhost:8188',
        models: [expect.objectContaining({ name: 'flux', features: ['imageGeneration'] })],
      }),
    ]));
    expect(fetched).toBe(false);
  });

  it('maps exact capabilities and caches a valid remote catalog', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tidgi-provider-catalog-'));
    temporaryDirectories.push(directory);
    const cachePath = path.join(directory, 'catalog.json');
    const result = await resolveDesktopProviderCatalog({
      cachePath,
      refresh: true,
      fetch: async () =>
        new Response(
          JSON.stringify({
            demo: {
              id: 'demo',
              name: 'Demo',
              npm: '@ai-sdk/openai-compatible',
              api: 'https://example.com/v1',
              env: [],
              models: {
                vision: {
                  id: 'vision',
                  name: 'Vision',
                  attachment: true,
                  reasoning: true,
                  tool_call: true,
                  modalities: { input: ['text', 'image'], output: ['text'] },
                  limit: { context: 1000, output: 100 },
                },
              },
            },
          }),
          { status: 200, headers: { etag: '"demo-v1"' } },
        ),
    });
    expect(result.status.source).toBe('remote');
    expect(result.providers[0]).toMatchObject({
      provider: 'demo',
      enabled: false,
      models: [{ name: 'vision', features: ['language', 'reasoning', 'toolCalling', 'vision'] }],
    });
    expect(fs.existsSync(cachePath)).toBe(true);
  });

  it('uses the embedded last-known-good snapshot while offline', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tidgi-provider-catalog-'));
    temporaryDirectories.push(directory);
    const result = await resolveDesktopProviderCatalog({
      cachePath: path.join(directory, 'missing.json'),
      refresh: true,
      fetch: async () => {
        throw new Error('offline');
      },
    });
    expect(result.status.source).toBe('embedded');
    expect(result.status.refreshError).toContain('offline');
    expect(result.providers.length).toBeGreaterThan(100);
  });
});
