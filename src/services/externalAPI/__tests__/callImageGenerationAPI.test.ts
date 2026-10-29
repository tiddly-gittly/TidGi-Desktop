import type { ModelAssignments, ProviderAccountConfig } from 'memeloop';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { generateImageFromProvider } from '../callImageGenerationAPI';

const providerId = 'local-comfy';
const modelId = 'flux';
const account: ProviderAccountConfig = {
  providerId,
  providerType: 'comfyui',
  baseUrl: 'http://127.0.0.1:8188',
  models: [{ modelId, wireModelId: 'flux-dev', apiMode: 'chat-completions' }],
};
const assignments: ModelAssignments = {
  imageGeneration: { providerId, modelId },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ComfyUI image generation', () => {
  it('fails closed without issuing an unsupported OpenAI-compatible request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', fetch);

    const response = await generateImageFromProvider(
      'a watercolor landscape',
      assignments,
      new AbortController().signal,
      account,
      'unused-test-key',
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      status: 'error',
      images: [],
      logicalModelId: modelId,
      wireModelId: 'flux-dev',
      errorDetail: {
        code: 'IMAGE_GENERATION_FAILED',
        providerId,
        message: 'ComfyUI image generation requires a dedicated provider plugin',
      },
    });
  });
});
