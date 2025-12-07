import type { AgentDefinition } from '@services/agentDefinition/interface';
import defaultAgents from '@services/agentInstance/agentFrameworks/taskAgents.json';
import { container } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
import { AgentDefinitionEntity } from '@services/database/schema/agent';
import type { AIGlobalSettings, AIStreamResponse } from '@services/externalAPI/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { ModelMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ExternalAPIService logging', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Ensure DatabaseService is initialized with all schemas
    const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
    await databaseService.initializeForApp();

    await container.get<IPreferenceService>(serviceIdentifier.Preference).set('externalAPIDebug', true);

    // Use the real agent database
    const dataSource = await databaseService.getDatabase('agent');
    const agentDefRepo = dataSource.getRepository(AgentDefinitionEntity);

    // Clear existing data and add test data
    await agentDefRepo.clear();
    const example = (defaultAgents as unknown as AgentDefinition[])[0];
    await agentDefRepo.save({ id: example.id });
  });

  it('records streaming logs when provider has apiKey (API success)', async () => {
    const externalAPI = container.get<import('../interface').IExternalAPIService>(serviceIdentifier.ExternalAPI);

    // spy the provider stream to avoid real network and to be deterministic
    const callProvider = await import('../callProviderAPI');
    type StreamReturn = ReturnType<typeof callProvider.streamFromProvider>;
    const spy = vi.spyOn(callProvider, 'streamFromProvider').mockImplementation((): StreamReturn => ({
      textStream: (async function*() {
        yield 'hello ';
        yield 'world';
      })(),
    } as unknown as StreamReturn));

    await externalAPI.initialize();

    const db = container.get<IDatabaseService>(serviceIdentifier.Database);
    const aiSettings: AIGlobalSettings = {
      providers: [{ provider: 'test-provider', apiKey: 'fake', models: [{ name: 'test-model' }] }],
      defaultConfig: { default: { provider: 'test-provider', model: 'test-model' }, modelParameters: { temperature: 0.7, systemPrompt: '', topP: 0.95 } },
    };
    // Mock getSetting to return our test AI settings
    vi.spyOn(db, 'getSetting').mockImplementation((k: string) => (k === 'aiSettings' ? aiSettings : undefined));

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
    await svc.initialize();

    const db = container.get<IDatabaseService>(serviceIdentifier.Database);
    const aiSettings: AIGlobalSettings = {
      // Provider without apiKey should trigger an error
      providers: [{ provider: 'test-provider', models: [{ name: 'test-model' }] }], // No apiKey
      defaultConfig: { default: { provider: 'test-provider', model: 'test-model' }, modelParameters: { temperature: 0.7, systemPrompt: '', topP: 0.95 } },
    };
    // Mock getSetting to return our test AI settings
    vi.spyOn(db, 'getSetting').mockImplementation((k: string) => (k === 'aiSettings' ? aiSettings : undefined));

    const messages: ModelMessage[] = [{ role: 'user', content: 'hi' }];
    const config = await svc.getAIConfig();

    const events: AIStreamResponse[] = [];
    for await (const e of svc.generateFromAI(messages, config, { agentInstanceId: 'agent-instance-1', awaitLogs: true })) events.push(e);

    await new Promise((r) => setTimeout(r, 20));

    // Check logs from the external API service's database
    const externalAPILogs = await svc.getAPILogs('agent-instance-1');
    expect(externalAPILogs.length).toBeGreaterThan(0);
  });
});
