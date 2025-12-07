import { container } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
import { AgentDefinitionEntity, AgentInstanceEntity, AgentInstanceMessageEntity } from '@services/database/schema/agent';
import * as callProvider from '@services/externalAPI/callProviderAPI';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentInstanceService } from '..';
import { basicPromptConcatHandler } from '../agentFrameworks/taskAgent';
import type { AgentInstanceMessage, IAgentInstanceService } from '../interface';
import type { AiAPIConfig } from '../promptConcat/promptConcatSchema';

// Use real normalizeRole implementation — do not mock plugins or persistence in these integration tests

describe('AgentInstance failure path - external API logs on error', () => {
  let dataSource: Awaited<ReturnType<IDatabaseService['getDatabase']>>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const db = container.get<IDatabaseService>(serviceIdentifier.Database);
    await db.initializeForApp();
    dataSource = await db.getDatabase('agent');

    // Clean tables
    await dataSource.getRepository(AgentInstanceMessageEntity).clear();
    await dataSource.getRepository(AgentInstanceEntity).clear();
    await dataSource.getRepository(AgentDefinitionEntity).clear();

    // Add minimal def/instance
    await dataSource.getRepository(AgentDefinitionEntity).save({ id: 'def-1', name: 'Def 1' });
    await dataSource.getRepository(AgentInstanceEntity).save({
      id: 'agent-1',
      agentDefId: 'def-1',
      name: 'Agent 1',
      status: { state: 'working', modified: new Date() },
      created: new Date(),
      closed: false,
    });

    // Enable debug logs
    const pref = container.get<import('@services/preferences/interface').IPreferenceService>(serviceIdentifier.Preference);
    await pref.set('externalAPIDebug', true);

    // Configure AI settings provider/model
    const dbService = container.get<IDatabaseService>(serviceIdentifier.Database);
    const aiSettings = {
      providers: [{ provider: 'test-provider', models: [{ name: 'test-model' }] }],
      defaultConfig: { default: { provider: 'test-provider', model: 'test-model' }, modelParameters: { temperature: 0.7, systemPrompt: '', topP: 0.95 } },
    };
    vi.spyOn(dbService, 'getSetting').mockImplementation((k: string) => (k === 'aiSettings' ? aiSettings : undefined));

    // Mock provider stream to throw error (ai sdk failure)
    vi.spyOn(callProvider, 'streamFromProvider').mockImplementation((_cfg: AiAPIConfig) => {
      throw new Error('Invalid prompt: message must be a ModelMessage or a UI message');
    });

    // Initialize services
    const agentSvc = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance) as AgentInstanceService;
    await agentSvc.initialize();
    const extSvc = container.get<IExternalAPIService>(serviceIdentifier.ExternalAPI);
    await extSvc.initialize();
  });

  it('writes external_api_logs error on provider failure and persists error message', async () => {
    // Create context and run handler
    const initialMessages: AgentInstanceMessage[] = [
      { id: 'u1', agentId: 'agent-1', role: 'user', content: 'hi', modified: new Date() },
    ];
    const ctx = {
      agent: {
        id: 'agent-1',
        agentDefId: 'def-1',
        status: { state: 'working' as const, modified: new Date() },
        created: new Date(),
        messages: initialMessages,
      },
      agentDef: {
        id: 'def-1',
        name: 'Def 1',
        agentFrameworkConfig: {},
        aiApiConfig: { default: { provider: 'test-provider', model: 'test-model' }, modelParameters: { temperature: 0.7, systemPrompt: '', topP: 0.95 } },
      },
      isCancelled: () => false,
    } as Parameters<typeof basicPromptConcatHandler>[0];

    const statuses: Array<unknown> = [];
    for await (const s of basicPromptConcatHandler(ctx)) statuses.push(s);

    // Verify error message persisted
    const msgRepo = dataSource.getRepository(AgentInstanceMessageEntity);
    const all = await msgRepo.find({ where: { agentId: 'agent-1' }, order: { modified: 'ASC' } });
    const errorMsg = all.find((m) => m.role === 'error');
    expect(errorMsg).toBeTruthy();
    expect(errorMsg?.duration).toBe(1);

    // Verify external API logs contain error
    const extSvc = container.get<IExternalAPIService>(serviceIdentifier.ExternalAPI);
    let logs = await extSvc.getAPILogs();
    for (let i = 0; i < 10 && !logs.some((l) => l.status === 'error'); i++) {
      await new Promise((r) => setTimeout(r, 100));
      logs = await extSvc.getAPILogs();
    }
    expect(logs.some((l) => l.status === 'error')).toBe(true);

    // Additional verification: compare DB repo order and service.getAgent refreshed order
    const repo = dataSource.getRepository(AgentInstanceMessageEntity);
    const allRepo = await repo.find({ where: { agentId: 'agent-1' }, order: { modified: 'ASC' } });
    const agentSvc = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
    const refreshed = await agentSvc.getAgent('agent-1');
    const repoOrder = allRepo.map(m => m.id);
    const refreshedOrder = (refreshed?.messages || []).map(m => m.id);
    // removed debug logs in test
    expect(refreshedOrder).toEqual(repoOrder);
  });
});
