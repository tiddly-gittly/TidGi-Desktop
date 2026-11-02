import { container } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { ILLMProvider, PortableLlmRequest, PortableLlmStreamPart, ProviderAccountConfig } from 'memeloop';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { desktopLlmProviderFactoryPort } from '../providerFactory';

const route = {
  modelId: 'assistant',
  wireModelId: 'vendor/assistant-v2',
  apiMode: 'responses' as const,
};
const providerId = 'request-lifecycle-test';

function activeRequests(service: IExternalAPIService): Map<string, AbortController> {
  return (service as unknown as { activeRequests: Map<string, AbortController> }).activeRequests;
}

function portableRequest(overrides: Partial<PortableLlmRequest> = {}): PortableLlmRequest {
  return {
    providerId,
    logicalModelId: route.modelId,
    wireModelId: route.wireModelId,
    apiMode: route.apiMode,
    messages: [{ role: 'user', content: 'hello' }],
    ...overrides,
  };
}

async function drain(stream: AsyncIterable<PortableLlmStreamPart>): Promise<void> {
  for await (const _part of stream) {
    // Drain the stream so the generator's finally block runs.
  }
}

describe('ExternalAPIService request lifecycle cleanup', () => {
  let service: IExternalAPIService;
  let database: IDatabaseService;

  beforeEach(async () => {
    vi.restoreAllMocks();
    service = container.get<IExternalAPIService>(serviceIdentifier.ExternalAPI);
    database = container.get<IDatabaseService>(serviceIdentifier.Database);
    await database.initializeForApp();
    await service.deleteProviderAccount(providerId);
    expect(activeRequests(service).size).toBe(0);
  });

  it.each([
    ['embedding', () => service.generateEmbeddings([], {})],
    ['speech', () => service.generateSpeech('hello', {})],
    ['transcription', () => service.generateTranscription(new Blob(['audio']), {})],
    ['image', () => service.generateImage('hello', {})],
  ])('cleans the active request after a missing %s model configuration', async (_kind, run) => {
    const response = await run();

    expect(response.status).toBe('error');
    expect(activeRequests(service).size).toBe(0);
  });

  it('cleans the active request when the portable provider account is missing', async () => {
    await expect(drain(service.generatePortableLlm(portableRequest({ providerId: 'missing-provider' })))).rejects.toThrow(
      'Provider account not found: missing-provider',
    );
    expect(activeRequests(service).size).toBe(0);
  });

  it('cleans the active request when the portable model route cannot be resolved', async () => {
    const account: ProviderAccountConfig = {
      providerId,
      providerType: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:15121/v1',
      models: [route],
    };
    await service.setProviderAccount(account);

    await expect(drain(service.generatePortableLlm(portableRequest({
      logicalModelId: 'missing-model',
      wireModelId: 'vendor/missing-model',
    })))).rejects.toThrow(`Model route not found: ${providerId}/missing-model`);
    expect(activeRequests(service).size).toBe(0);
  });

  it('aborts the provider signal and cleans the request after a completed portable stream', async () => {
    let observedSignal: AbortSignal | undefined;
    const provider: ILLMProvider = {
      name: providerId,
      chat: vi.fn(async request => {
        observedSignal = request.signal;
        return (async function*(): AsyncGenerator<PortableLlmStreamPart> {
          yield { type: 'finish', finishReason: 'stop' };
        })();
      }),
    };
    vi.spyOn(desktopLlmProviderFactoryPort, 'createFromAccountRoute').mockResolvedValue(provider);
    await service.setProviderAccount({
      providerId,
      providerType: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:15121/v1',
      models: [route],
    });

    await drain(service.generatePortableLlm(portableRequest()));

    expect(observedSignal?.aborted).toBe(true);
    expect(activeRequests(service).size).toBe(0);
  });
});
