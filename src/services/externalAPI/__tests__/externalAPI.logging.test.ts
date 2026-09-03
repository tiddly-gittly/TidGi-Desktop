import { container } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { ILLMProvider, PortableLlmRequest, PortableLlmStreamPart, ProviderAccountConfig } from 'memeloop';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { desktopLlmProviderFactoryPort } from '../providerFactory';

const providerId = 'canonical-logging-test';
const route = {
  modelId: 'assistant',
  wireModelId: 'vendor/assistant-v2',
  apiMode: 'responses' as const,
};
const account: ProviderAccountConfig = {
  providerId,
  providerType: 'openai-compatible',
  baseUrl: 'https://models.example.test/v1',
  models: [route],
};

function request(signal?: AbortSignal): PortableLlmRequest {
  return {
    providerId,
    logicalModelId: route.modelId,
    wireModelId: route.wireModelId,
    apiMode: route.apiMode,
    messages: [{ role: 'user', content: 'hello' }],
    ...(signal === undefined ? {} : { signal }),
  };
}

async function* completedStream(): AsyncGenerator<PortableLlmStreamPart> {
  yield { type: 'text-delta', id: 'text-1', text: 'hello world' };
  yield { type: 'finish', finishReason: 'stop' };
}

describe('ExternalAPIService canonical provider persistence and logging', () => {
  let service: IExternalAPIService;
  let database: IDatabaseService;

  beforeEach(async () => {
    vi.restoreAllMocks();
    service = container.get<IExternalAPIService>(serviceIdentifier.ExternalAPI);
    database = container.get<IDatabaseService>(serviceIdentifier.Database);
    await database.initializeForApp();
    await container.get<IPreferenceService>(serviceIdentifier.Preference).set('externalAPIDebug', true);

    await service.deleteProviderAccount(providerId);
    await service.updateDefaultAIConfig({});
    await service.setProviderAccount(account);
    await service.setProviderApiKey(providerId, 'unit-test-provider-secret');
    await service.initialize();
  });

  it('streams the exact portable request and records a completed API log', async () => {
    const provider: ILLMProvider = {
      name: providerId,
      chat: vi.fn(async () => completedStream()),
    };
    const factory = vi.spyOn(desktopLlmProviderFactoryPort, 'createFromAccountRoute').mockResolvedValue(provider);

    const events: PortableLlmStreamPart[] = [];
    for await (
      const event of service.generatePortableLlm(request(), {
        agentInstanceId: 'agent-instance-1',
        awaitLogs: true,
      })
    ) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'text-delta', id: 'text-1', text: 'hello world' },
      { type: 'finish', finishReason: 'stop' },
    ]);
    expect(factory).toHaveBeenCalledWith({
      account: expect.objectContaining({ providerId, models: [route] }),
      route,
      apiKey: 'unit-test-provider-secret',
    });
    expect(await service.getAPILogs('agent-instance-1')).toEqual([
      expect.objectContaining({
        status: 'done',
        responseContent: 'hello world',
        requestMetadata: expect.objectContaining({
          providerId,
          logicalModelId: route.modelId,
          wireModelId: route.wireModelId,
        }),
      }),
    ]);
  });

  it('forwards the exact canonical account, route, and credential through the Desktop provider factory port', async () => {
    const provider: ILLMProvider = {
      name: providerId,
      chat: vi.fn(async () => completedStream()),
    };
    const factory = vi.spyOn(desktopLlmProviderFactoryPort, 'createFromAccountRoute').mockResolvedValue(provider);
    const expectedAccount = (await service.getProviderAccounts()).find(candidate => candidate.providerId === providerId);
    if (!expectedAccount) throw new Error('Expected the configured provider account');

    for await (const _event of service.generatePortableLlm(request())) {
      // Draining the stream exercises the provider construction and exact route.
    }

    expect(factory).toHaveBeenCalledExactlyOnceWith({
      account: expectedAccount,
      route,
      apiKey: 'unit-test-provider-secret',
    });
  });

  it('persists only encrypted credentials and publishes only an opaque secret reference', async () => {
    const serialized = JSON.stringify(database.getSetting('aiSettings'));
    expect(serialized).not.toContain('unit-test-provider-secret');
    expect(serialized).toContain('encryptedApiKey');

    const exposed = (await service.getProviderAccounts()).find(account => account.providerId === providerId);
    expect(exposed).toMatchObject({
      providerId,
      providerType: 'openai-compatible',
      baseUrl: 'https://models.example.test/v1',
      secretRef: `desktop-keychain:${providerId}`,
      models: [route],
    });
    expect(exposed).not.toHaveProperty('apiKey');
    expect(exposed).not.toHaveProperty('encryptedApiKey');
    expect(await service.getProviderApiKey(providerId)).toBe('unit-test-provider-secret');
    expect(JSON.stringify(await service.getAPILogs())).not.toContain('unit-test-provider-secret');
  });

  it.each(['TestProvider', '0provider', '提供方'])('accepts a Unicode or digit provider ID: %s', async id => {
    const extraAccount: ProviderAccountConfig = {
      providerId: id,
      providerType: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:15121/v1',
      models: [{ modelId: 'local', wireModelId: 'vendor/local', apiMode: 'chat-completions' }],
    };
    await expect(service.setProviderAccount(extraAccount)).resolves.toBeUndefined();
    expect((await service.getProviderAccounts()).some(account => account.providerId === id)).toBe(true);
    await service.deleteProviderAccount(id);
  });

  it('allows an unauthenticated loopback provider but rejects a keyless remote provider', async () => {
    await service.setProviderApiKey(providerId, '');
    await service.setProviderAccount({
      ...account,
      baseUrl: 'http://127.0.0.1:15121/v1',
    });
    await service.updateDefaultAIConfig({ free: { providerId, modelId: route.modelId } });
    expect(await service.isAIAvailable()).toBe(true);

    await service.setProviderAccount(account);
    expect(await service.isAIAvailable()).toBe(false);
  });

  it('clears assignments when a configured account is disabled', async () => {
    await service.updateDefaultAIConfig({ free: { providerId, modelId: route.modelId } });
    expect(await service.getAIConfig()).toMatchObject({
      free: { providerId, modelId: route.modelId },
    });

    await service.setProviderAccount({ ...account, enabled: false });

    expect(await service.getAIConfig()).not.toHaveProperty('free');
    expect(await service.isAIAvailable()).toBe(false);
  });

  it('aborts a portable request that exceeds its timeout and records cancellation', async () => {
    const provider: ILLMProvider = {
      name: providerId,
      chat: async portableRequest =>
        (async function*() {
          await new Promise<void>((_resolve, reject) => {
            portableRequest.signal?.addEventListener('abort', () => {
              const reason = portableRequest.signal?.reason;
              reject(reason instanceof Error ? reason : new Error(String(reason ?? 'aborted')));
            }, { once: true });
          });
          yield { type: 'finish', finishReason: 'unreachable' } as const;
        })(),
    };
    vi.spyOn(desktopLlmProviderFactoryPort, 'createFromAccountRoute').mockResolvedValue(provider);

    await expect(async () => {
      for await (
        const _event of service.generatePortableLlm(request(), {
          agentInstanceId: 'timeout-agent',
          awaitLogs: true,
          requestTimeoutMs: 10,
        })
      ) {
        // The stream must abort before producing a part.
      }
    }).rejects.toThrow();

    expect(await service.getAPILogs('timeout-agent')).toEqual([
      expect.objectContaining({ status: 'cancel' }),
    ]);
  });
});
