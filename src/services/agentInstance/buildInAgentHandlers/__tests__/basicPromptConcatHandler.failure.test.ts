import { container } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
import { AgentDefinitionEntity, AgentInstanceEntity, AgentInstanceMessageEntity } from '@services/database/schema/agent';
import * as callProvider from '@services/externalAPI/callProviderAPI';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentInstanceMessage, IAgentInstanceService } from '../../interface';
import type { AiAPIConfig } from '../../promptConcat/promptConcatSchema';
import { basicPromptConcatHandler } from '../basicPromptConcatHandler';
import type { AgentHandlerContext } from '../type';

// Use real normalizeRole implementation — do not mock plugins or persistence in these integration tests

// Drive ExternalAPIService to emit an error event similar to siliconflow validation failure
const mockErrorDetail = {
  name: 'AIProviderError',
  code: 'INVALID_PROMPT',
  provider: 'siliconflow',
  message: 'Invalid prompt: message must be a CoreMessage or a UI message',
};

function makeContext(agentId: string, agentDefId: string, messages: AgentInstanceMessage[]): AgentHandlerContext {
  return {
    agent: {
      id: agentId,
      agentDefId,
      status: { state: 'working', modified: new Date() },
      created: new Date(),
      messages,
    },
    agentDef: {
      id: agentDefId,
      name: 'Test Agent',
      handlerConfig: {},
      aiApiConfig: { api: { provider: 'test-provider', model: 'test-model' }, modelParameters: { temperature: 0.7, systemPrompt: '', topP: 0.95 } } as AiAPIConfig,
    },
    isCancelled: () => false,
  } as unknown as AgentHandlerContext;
}

describe('basicPromptConcatHandler - failure path persists error message and logs', () => {
  let dataSource: Awaited<ReturnType<IDatabaseService['getDatabase']>>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const db = container.get<IDatabaseService>(serviceIdentifier.Database);
    await db.initializeForApp();
    dataSource = await db.getDatabase('agent');

    // Clean agent tables
    await dataSource.getRepository(AgentInstanceMessageEntity).clear();
    await dataSource.getRepository(AgentInstanceEntity).clear();
    await dataSource.getRepository(AgentDefinitionEntity).clear();

    // Insert minimal agent def / instance
    const agentDef = { id: 'def-1', name: 'Def 1' };
    await dataSource.getRepository(AgentDefinitionEntity).save(agentDef);
    await dataSource.getRepository(AgentInstanceEntity).save({
      id: 'agent-1',
      agentDefId: agentDef.id,
      name: 'Agent 1',
      status: { state: 'working', modified: new Date() },
      created: new Date(),
      closed: false,
    });

    // Ensure external API debug is on so logs are attempted
    const pref = container.get<import('@services/preferences/interface').IPreferenceService>(serviceIdentifier.Preference);
    await pref.set('externalAPIDebug', true);

    // Ensure AI provider settings present so ExternalAPI can resolve providerConfig
    const dbService = container.get<IDatabaseService>(serviceIdentifier.Database);
    const aiSettings = {
      providers: [{ provider: 'test-provider', models: [{ name: 'test-model' }] }],
      defaultConfig: { api: { provider: 'test-provider', model: 'test-model' }, modelParameters: { temperature: 0.7, systemPrompt: '', topP: 0.95 } },
    };
    vi.spyOn(dbService, 'getSetting').mockImplementation((k: string) => (k === 'aiSettings' ? aiSettings : undefined));

    // Mock streamFromProvider to throw an error that externalAPI will capture and log
    vi.spyOn(callProvider, 'streamFromProvider').mockImplementation((_cfg: AiAPIConfig) => {
      throw new Error(mockErrorDetail.message ?? 'Invalid prompt');
    });

    // Initialize AgentInstanceService repositories
    const agentSvc = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
    await agentSvc.initialize();

    // Stub AgentDefinitionService.getAgentDef to return our saved agent definition
  const agentDefSvc: any = container.get(serviceIdentifier.AgentDefinition);
    if (agentDefSvc && typeof agentDefSvc.getAgentDef === 'function') {
      vi.spyOn(agentDefSvc, 'getAgentDef').mockResolvedValue({
        id: 'def-1',
        name: 'Def 1',
        handlerID: 'basicPromptConcatHandler',
        handlerConfig: {
          plugins: [
            { pluginId: 'wikiOperation', wikiOperationParam: {} },
          ],
        },
      });
    }

    // Initialize external API service logging DB
    const extSvc = container.get<IExternalAPIService>(serviceIdentifier.ExternalAPI);
    await extSvc.initialize();
  });

  it('should push error message with duration=1, persist it, and write external_api_logs error', async () => {
    const initialMessages: AgentInstanceMessage[] = [
      { id: 'u1', agentId: 'agent-1', role: 'user', content: '触发错误', modified: new Date() },
    ];
    const ctx = makeContext('agent-1', 'def-1', initialMessages);

    const statuses: Array<ReturnType<typeof Object>> = [];
    const iter = basicPromptConcatHandler(ctx);
    for await (const s of iter) statuses.push(s);

    // 1) Verify error status returned
    const last = statuses[statuses.length - 1] as unknown as { message?: { content: string } };
    expect(last?.message?.content).toContain('Error:');

    // 2) Verify message persisted with role=error and duration=1
    const msgRepo = dataSource.getRepository(AgentInstanceMessageEntity);
    const all = await msgRepo.find({ where: { agentId: 'agent-1' }, order: { modified: 'ASC' } });
    const errorMsg = all.find((m) => m.role === 'error');
    expect(errorMsg).toBeTruthy();
    expect(errorMsg?.duration).toBe(1);

    // 3) Verify external API logs have error with errorDetail
    // Wait/retry to allow async log write to complete
    const extSvc = container.get<IExternalAPIService>(serviceIdentifier.ExternalAPI);
    let logs = await extSvc.getAPILogs();
    for (let i = 0; i < 10 && !logs.some((l) => l.status === 'error'); i++) {
      await new Promise((r) => setTimeout(r, 100));
      logs = await extSvc.getAPILogs();
    }
    expect(logs.some((l) => l.status === 'error' && (l.errorDetail?.message || '').includes('Invalid prompt'))).toBe(true);
    // If agentInstanceId is present, it should match our agent id
    const withAgent = logs.find((l) => l.status === 'error' && l.agentInstanceId);
    if (withAgent) expect(withAgent.agentInstanceId).toBe('agent-1');
  });

  it('should cover two-round flow: tool_use then Chat.ConfigError.AIProviderError and print ordering', async () => {
    // Mock provider: Round 1 DONE with wiki-operation tool_use; Round 2 ERROR with Chat.ConfigError
    const extSvc = container.get<IExternalAPIService>(serviceIdentifier.ExternalAPI);
    let callIndex = 0;
    vi.spyOn(extSvc, 'generateFromAI').mockImplementation(async function*(_msgs: Array<unknown>, _cfg: AiAPIConfig) {
      callIndex += 1;
      if (callIndex === 1) {
        yield { requestId: 'req-1', status: 'start' as const, content: '' };
        yield {
          requestId: 'req-1',
          status: 'done' as const,
          content: '<tool_use name="wiki-operation">{"workspaceName":"__no_such_ws__","operation":"wiki-add-tiddler","title":"T"}</tool_use>',
        };
        return;
      }
      // Second round returns provider error
      yield {
        requestId: 'req-2',
        status: 'error' as const,
        content: '',
        errorDetail: { name: 'AIProviderError', code: 'Chat.ConfigError.AIProviderError', provider: 'siliconflow', message: 'Config error from provider' },
      };
    });

    // Use the public AgentInstanceService path (simulates front-end send flow)
    const agentSvc = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);

    // Spy repository.save to record the exact order DB rows are saved (do NOT mock/replace behaviour)
    const repo = dataSource.getRepository(AgentInstanceMessageEntity);
  vi.spyOn(repo, 'save');

    // Send message via service which will run the handler and plugins across two rounds
    await agentSvc.sendMsgToAgent('agent-1', { text: '触发工具并继续' });

    // Immediately read DB and refreshed order (simulate immediate UI refresh)
    const all = await repo.find({ where: { agentId: 'agent-1' }, order: { modified: 'ASC' } });

    const assistant = all.find(m => m.role === 'assistant' && m.content.includes('<tool_use'));
    const errorMsg = all.find(m => m.role === 'error');

    expect(assistant).toBeTruthy();
    expect(errorMsg).toBeTruthy();

    // Additional debug: compare repository.save call order, DB rows and service.getAgent ordering
    const agentSvc2 = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
    await agentSvc2.getAgent('agent-1');

    // Debug removed: repoSave call order, repoOrder, refreshedOrder, timestamps
    /* console.log('repoSave call order:', savedIds);
    console.log('repoOrder (DB):', repoOrder);
    console.log('refreshedOrder (getAgent):', refreshedOrder); */
    // removed debug: assistant vs error (created/modified)

    // No strict assertion here; we print the sequences so you can inspect exact order in CI/local run.

    // Now wait beyond debounce window and re-check ordering based on created (not modified) since that's what the service uses
    await new Promise((r) => setTimeout(r, 400));
    const allAfter = await repo.find({ where: { agentId: 'agent-1' }, order: { created: 'ASC' } });
    const assistantAfter = allAfter.find(m => m.role === 'assistant' && m.content.includes('<tool_use'))!;
    const errorAfter = allAfter.find(m => m.role === 'error')!;
    // Test the actual ordering logic used by the service: created timestamp, not modified
    expect(assistantAfter.created?.getTime()).toBeLessThanOrEqual(errorAfter.created?.getTime() ?? 0);
  });
});
