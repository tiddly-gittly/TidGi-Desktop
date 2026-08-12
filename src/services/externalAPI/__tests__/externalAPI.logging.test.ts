import { MEME_LOOP_DATABASE_KEY } from '@/constants/database';
import { container } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
import { AgentDefinitionEntity } from '@services/database/schema/agent';
import type { AIGlobalSettings, AIStreamResponse } from '@services/externalAPI/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { getBuiltinLoopProfiles } from 'memeloop';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelMessage } from '../interface';

describe('ExternalAPIService logging', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Ensure DatabaseService is initialized with all schemas
    const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
    await databaseService.initializeForApp();

    await container.get<IPreferenceService>(serviceIdentifier.Preference).set('externalAPIDebug', true);

    // Use the real agent database
    const dataSource = await databaseService.getDatabase(MEME_LOOP_DATABASE_KEY);
    const agentDefRepo = dataSource.getRepository(AgentDefinitionEntity);

    // Clear existing data and add test data
    await agentDefRepo.clear();
    const example = (getBuiltinLoopProfiles())[0];
    await agentDefRepo.save({ id: example.id });
  });

  it('records streaming logs when provider has apiKey (API success)', async () => {
    const externalAPI = container.get<import('../interface').IExternalAPIService>(serviceIdentifier.ExternalAPI);
    const db = container.get<IDatabaseService>(serviceIdentifier.Database);

    // Set up provider config BEFORE initialization
    const aiSettings: AIGlobalSettings = {
      providers: [{ provider: 'test-provider', apiKey: 'fake', models: [{ name: 'test-model' }] }],
      defaultConfig: { default: { provider: 'test-provider', model: 'test-model' }, modelParameters: { temperature: 0.7, topP: 0.95 } },
    };
    db.setSetting('aiSettings', aiSettings);

    // spy the provider stream to avoid real network and to be deterministic
    const callProvider = await import('../callProviderAPI');
    const spy = vi.spyOn(callProvider, 'streamFromProvider').mockImplementation(async () =>
      (async function*() {
        yield 'hello ';
        yield 'world';
      })()
    );

    await externalAPI.initialize();

    const messages: ModelMessage[] = [{ role: 'user', content: 'hi' }];
    const config = await externalAPI.getAIConfig();

    const events: AIStreamResponse[] = [];
    for await (const e of externalAPI.generateFromAI(messages, config, { agentInstanceId: 'agent-instance-1', awaitLogs: true })) events.push(e);

    const statuses = events.map((e) => e.status);
    expect(statuses).toContain('start');
    expect(statuses).toContain('update');
    expect(statuses).toContain('done');

    await new Promise((r) => setTimeout(r, 20));

    // Check logs from the external API service's database
    const externalAPILogs = await externalAPI.getAPILogs('agent-instance-1');
    expect(externalAPILogs.length).toBeGreaterThan(0);

    spy.mockRestore();
  });

  it('records streaming error when apiKey missing (error path)', async () => {
    const svc = container.get<import('../interface').IExternalAPIService>(serviceIdentifier.ExternalAPI);
    const db = container.get<IDatabaseService>(serviceIdentifier.Database);

    // Set up provider config WITHOUT apiKey BEFORE initialization to trigger error
    const aiSettings: AIGlobalSettings = {
      providers: [{ provider: 'test-provider', models: [{ name: 'test-model' }] }], // No apiKey
      defaultConfig: { default: { provider: 'test-provider', model: 'test-model' }, modelParameters: { temperature: 0.7, topP: 0.95 } },
    };
    db.setSetting('aiSettings', aiSettings);

    await svc.initialize();

    const messages: ModelMessage[] = [{ role: 'user', content: 'hi' }];
    const config = await svc.getAIConfig();

    const events: AIStreamResponse[] = [];
    for await (const e of svc.generateFromAI(messages, config, { agentInstanceId: 'agent-instance-1', awaitLogs: true })) events.push(e);

    await new Promise((r) => setTimeout(r, 20));

    // Check logs from the external API service's database
    const externalAPILogs = await svc.getAPILogs('agent-instance-1');
    expect(externalAPILogs.length).toBeGreaterThan(0);
  });

  it('persists only OS-encrypted provider credentials and exposes only their presence', async () => {
    const svc = container.get<import('../interface').IExternalAPIService>(serviceIdentifier.ExternalAPI);
    const db = container.get<IDatabaseService>(serviceIdentifier.Database);
    const plaintext = 'unit-test-provider-secret';

    await svc.updateProvider('secure-provider', {
      apiKey: plaintext,
      baseURL: 'https://models.example.test/v1',
      models: [{
        name: 'secure-model',
        apiMode: 'responses',
        contextWindowSize: 1_050_000,
        maxInputTokens: 1_050_000,
        maxOutputTokens: 128_000,
        modelOptions: { top_p: 0.95 },
        supportsReasoningEffort: ['minimal', 'low', 'medium', 'high'],
        reasoningEffortFormat: 'chat-completions',
      }],
      providerClass: 'openAICompatible',
    });

    const serialized = JSON.stringify(db.getSetting('aiSettings'));
    expect(serialized).not.toContain(plaintext);
    expect(serialized).toContain('encryptedApiKey');

    const exposed = (await svc.getAIProviders()).find(provider => provider.provider === 'secure-provider');
    expect(exposed).toMatchObject({
      hasApiKey: true,
      baseURL: 'https://models.example.test/v1',
      models: [expect.objectContaining({
        contextWindowSize: 1_050_000,
        maxInputTokens: 1_050_000,
        maxOutputTokens: 128_000,
        modelOptions: { top_p: 0.95 },
        supportsReasoningEffort: ['minimal', 'low', 'medium', 'high'],
        reasoningEffortFormat: 'chat-completions',
      })],
    });
    expect(exposed).not.toHaveProperty('apiKey');
    expect(exposed).not.toHaveProperty('encryptedApiKey');
    expect(await svc.getProviderApiKey('secure-provider')).toBe(plaintext);
    await svc.initialize();
    expect(JSON.stringify(await svc.getAPILogs())).not.toContain(plaintext);
  });

  it('allows a loopback OpenAI-compatible provider without a key but rejects a remote one', async () => {
    const svc = container.get<import('../interface').IExternalAPIService>(serviceIdentifier.ExternalAPI);

    await svc.updateProvider('loopback-provider', {
      baseURL: 'http://127.0.0.1:15121/v1',
      models: [{ name: 'local-model', features: ['language'] }],
      providerClass: 'openAICompatible',
    });
    await svc.updateDefaultAIConfig({ free: { provider: 'loopback-provider', model: 'local-model' } });
    expect(await svc.isAIAvailable()).toBe(true);

    await svc.updateProvider('remote-provider', {
      baseURL: 'https://models.example.test/v1',
      models: [{ name: 'remote-model', features: ['language'] }],
      providerClass: 'openAICompatible',
    });
    await svc.updateDefaultAIConfig({ free: { provider: 'remote-provider', model: 'remote-model' } });
    expect(await svc.isAIAvailable()).toBe(false);
  });

  it('aborts and reports an Agent request that exceeds its timeout', async () => {
    const externalAPI = container.get<import('../interface').IExternalAPIService>(
      serviceIdentifier.ExternalAPI,
    );
    const callProvider = await import('../callProviderAPI');
    const spy = vi.spyOn(callProvider, 'streamFromProvider').mockImplementation(
      async (_config, _messages, signal) =>
        (async function*() {
          await new Promise<void>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                reject(
                  signal.reason instanceof Error
                    ? signal.reason
                    : new Error(String(signal.reason ?? 'aborted')),
                );
              },
              { once: true },
            );
          });
          yield 'unreachable';
        })(),
    );

    await externalAPI.initialize();
    await externalAPI.updateProvider('timeout-provider', {
      apiKey: 'fake',
      models: [{ name: 'timeout-model' }],
    });
    const events: AIStreamResponse[] = [];
    for await (
      const event of externalAPI.generateFromAI(
        [{ role: 'user', content: 'timeout' }],
        {
          default: { provider: 'timeout-provider', model: 'timeout-model' },
          modelParameters: {},
        },
        { requestTimeoutMs: 10 },
      )
    ) {
      events.push(event);
    }

    expect(events.at(-1)).toMatchObject({
      status: 'error',
      errorDetail: {
        name: 'TimeoutError',
        code: 'AI_REQUEST_TIMEOUT',
      },
    });
    spy.mockRestore();
  });
});
