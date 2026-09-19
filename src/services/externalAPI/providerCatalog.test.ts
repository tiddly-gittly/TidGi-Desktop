import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDesktopModelCatalogManager } from './providerCatalog';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryCachePath(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tidgi-provider-catalog-'));
  temporaryDirectories.push(directory);
  return path.join(directory, 'catalog.json');
}

describe('Desktop Core model catalog adapter', () => {
  it('returns the exact embedded Core catalog while the first refresh runs', async () => {
    const manager = createDesktopModelCatalogManager({
      cachePath: temporaryCachePath(),
      fetch: async () => {
        throw new Error('offline');
      },
    });

    const result = await manager.resolve();

    expect(result.source).toBe('embedded');
    expect(result.stale).toBe(true);
    expect(result.refreshing).toBe(true);
    expect(result.catalog.providers.length).toBeGreaterThan(100);
    const firstProvider = result.catalog.providers[0];
    expect(firstProvider?.id).toEqual(expect.any(String));
    expect(firstProvider?.name).toEqual(expect.any(String));
    expect(Array.isArray(firstProvider?.models)).toBe(true);
    manager.dispose();
  });

  it('preserves exact catalog capabilities and atomically caches a valid refresh', async () => {
    const cachePath = temporaryCachePath();
    const manager = createDesktopModelCatalogManager({
      cachePath,
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

    const result = await manager.refresh();

    expect(result.source).toBe('remote');
    expect(result.stale).toBe(false);
    const provider = result.catalog.providers[0];
    expect(provider).toMatchObject({
      id: 'demo',
      name: 'Demo',
      api: 'https://example.com/v1',
    });
    expect(provider?.models[0]).toMatchObject({
      id: 'vision',
      name: 'Vision',
      attachment: true,
      reasoning: true,
      toolCall: true,
      limit: { context: 1000, output: 100 },
    });
    expect(provider?.models[0]?.modalities?.input).toEqual(['image', 'text']);
    expect(provider?.models[0]?.modalities?.output).toEqual(['text']);
    await vi.waitFor(() => {
      expect(fs.existsSync(cachePath)).toBe(true);
    });
    manager.dispose();
  });

  it('returns the embedded last-known-good snapshot when a forced refresh is offline', async () => {
    const manager = createDesktopModelCatalogManager({
      cachePath: temporaryCachePath(),
      fetch: async () => {
        throw new Error('offline');
      },
    });

    const result = await manager.refresh();

    expect(result.source).toBe('embedded');
    expect(result.stale).toBe(true);
    expect(result.refreshError).toBeDefined();
    expect(result.catalog.providers.length).toBeGreaterThan(100);
    manager.dispose();
  });
});
