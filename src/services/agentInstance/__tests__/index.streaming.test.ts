/**
 * Agent streaming contract tests.
 *
 * Metadata subscriptions intentionally never carry a transcript. Streaming
 * partials cross the bounded conversation-projection channel, while completed
 * immutable messages are read through durable paging.
 */
import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { IAgentInstanceService } from '@services/agentInstance/interface';
import { container } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { AgentConversationUpdate, AgentDefinition, AgentInstance, AgentInstanceLatestStatus } from 'memeloop';
import { getBuiltinLoopProfiles } from 'memeloop';
import { nanoid } from 'nanoid';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

function toAgentDefinition(profile: ReturnType<typeof getBuiltinLoopProfiles>[number]): AgentDefinition {
  return {
    systemPrompt: '',
    tools: [],
    version: '1',
    ...profile,
  };
}

describe('AgentInstanceService Streaming Behavior', () => {
  let agentInstanceService: IAgentInstanceService;
  let testAgentInstance: AgentInstance;
  let mockExternalAPIService: Partial<IExternalAPIService>;

  beforeAll(async () => {
    await container.get<IDatabaseService>(serviceIdentifier.Database).initializeForApp();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const definitionService = container.get<IAgentDefinitionService>(serviceIdentifier.AgentDefinition);
    mockExternalAPIService = container.get(serviceIdentifier.ExternalAPI);
    agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);

    await definitionService.initialize();
    await agentInstanceService.initialize();

    const profile = getBuiltinLoopProfiles().find(candidate => candidate.id === 'memeloop:general-assistant');
    if (!profile) throw new Error('Missing built-in general assistant profile');
    const definition = {
      ...toAgentDefinition(profile),
      agentFrameworkID: 'agent-tool-loop',
      tools: [],
      plugins: [],
      agentTools: [],
      agentFrameworkConfig: { prompts: [], plugins: [], response: [] },
    };
    vi.spyOn(definitionService, 'getAgentDef').mockResolvedValue(definition);
    testAgentInstance = await agentInstanceService.createAgent(definition.id, { id: nanoid() });

    mockExternalAPIService.getAIConfig = vi.fn().mockResolvedValue({
      default: { provider: 'mock', model: 'mock-model' },
      modelParameters: { temperature: 0.7 },
    });
    mockExternalAPIService.getAIProviders = vi.fn().mockResolvedValue([{
      provider: 'mock',
      enabled: true,
      models: [{ name: 'mock-model' }],
    }]);
  });

  async function getPersistedMessages() {
    const page = await agentInstanceService.getAgentMessagePage(testAgentInstance.id, {
      limit: 80,
      maxBytes: 4 * 1024 * 1024,
      direction: 'forward',
      mode: 'full-content',
    });
    if (page.reset) throw new Error('unexpected conversation page reset');
    return page.items;
  }

  it('publishes bounded streaming projections and persists only the completed response', async () => {
    const expectedUserMessage = '你好，请回答一个简单的问题。';
    const expectedAIResponsePart1 = '这是一个测试回答的开始...';
    const expectedAIResponsePart2 = '这是一个测试回答的开始...正在思考中...';
    const expectedAIResponseFinal = '这是一个测试回答的开始...正在思考中...完成了！这是对用户问题的完整回答。';
    const mockAIResponseGenerator = async function*() {
      yield { type: 'text-delta' as const, id: 'test-request-1', text: expectedAIResponsePart1 };
      await new Promise(resolve => setTimeout(resolve, 60));
      yield { type: 'text-delta' as const, id: 'test-request-1', text: expectedAIResponsePart2.slice(expectedAIResponsePart1.length) };
      await new Promise(resolve => setTimeout(resolve, 60));
      yield { type: 'text-delta' as const, id: 'test-request-1', text: expectedAIResponseFinal.slice(expectedAIResponsePart2.length) };
      yield { type: 'finish' as const, finishReason: 'stop' };
    };
    mockExternalAPIService.generatePortableLlm = vi.fn().mockReturnValue(mockAIResponseGenerator());

    const updates: AgentConversationUpdate[] = [];
    const subscription = agentInstanceService.subscribeToConversationUpdates(testAgentInstance.id).subscribe(update => {
      updates.push(update);
    });
    try {
      await agentInstanceService.sendMsgToAgent(testAgentInstance.id, { text: expectedUserMessage });
    } finally {
      subscription.unsubscribe();
    }

    const streamingContents = updates
      .filter((update): update is Extract<AgentConversationUpdate, { kind: 'projection' }> => update.kind === 'projection' && update.streaming)
      .map(update => update.message.content);
    expect(streamingContents).toContain(expectedAIResponsePart1);
    expect(streamingContents).toContain(expectedAIResponsePart2);

    const messages = await getPersistedMessages();
    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: expectedUserMessage }),
      expect.objectContaining({ role: 'assistant', content: expectedAIResponseFinal }),
    ]));
    expect(messages).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'assistant', content: expectedAIResponsePart1 }),
    ]));
  });

  it('keeps message-specific status subscriptions compatible with a durably paged message', async () => {
    const expectedStreamingFinal = '流式回答第一部分...第二部分...完成！';
    const mockAIResponseGenerator = async function*() {
      yield { type: 'text-delta' as const, id: 'test-request-2', text: '流式回答第一部分' };
      yield { type: 'text-delta' as const, id: 'test-request-2', text: '...第二部分' };
      yield { type: 'text-delta' as const, id: 'test-request-2', text: '...完成！' };
      yield { type: 'finish' as const, finishReason: 'stop' };
    };
    mockExternalAPIService.generatePortableLlm = vi.fn().mockReturnValue(mockAIResponseGenerator());

    await agentInstanceService.sendMsgToAgent(testAgentInstance.id, { text: '测试消息级别流式更新' });
    const assistant = (await getPersistedMessages()).find(message => message.role === 'assistant');
    expect(assistant?.messageId).toBeDefined();

    const statuses: AgentInstanceLatestStatus[] = [];
    const subscription = agentInstanceService.subscribeToAgentUpdates(testAgentInstance.id, assistant!.messageId).subscribe(status => {
      if (status) statuses.push(status);
    });
    try {
      await vi.waitFor(() => {
        expect(statuses.at(-1)?.message?.content).toBe(expectedStreamingFinal);
      });
    } finally {
      subscription.unsubscribe();
    }
  });

  it('metadata subscriptions remain transcript-free after a completed stream', async () => {
    const mockAIResponseGenerator = async function*() {
      yield { type: 'text-delta' as const, id: 'test-request-complete', text: '流式回答开始...' };
      yield { type: 'text-delta' as const, id: 'test-request-complete', text: '已完成！' };
      yield { type: 'finish' as const, finishReason: 'stop' };
    };
    mockExternalAPIService.generatePortableLlm = vi.fn().mockReturnValue(mockAIResponseGenerator());

    const metadataUpdates: AgentInstance[] = [];
    const subscription = agentInstanceService.subscribeToAgentUpdates(testAgentInstance.id).subscribe(update => {
      if (update) metadataUpdates.push(update);
    });
    try {
      await agentInstanceService.sendMsgToAgent(testAgentInstance.id, { text: '测试 Observable 完成时机' });
      await vi.waitFor(() => {
        expect(metadataUpdates.length).toBeGreaterThan(0);
      });
      expect(metadataUpdates.every(update => update.messages.length === 0)).toBe(true);
      expect((await getPersistedMessages()).some(message => message.content === '流式回答开始...已完成！')).toBe(true);
    } finally {
      subscription.unsubscribe();
    }
  });

  it('persists a localized typed AI stream error without rejecting the host message command', async () => {
    const mockAIResponseGenerator = async function*() {
      yield { type: 'finish' as const, finishReason: 'stop' };
      throw new Error('Test AI error');
    };
    mockExternalAPIService.generatePortableLlm = vi.fn().mockReturnValue(mockAIResponseGenerator());

    await expect(agentInstanceService.sendMsgToAgent(testAgentInstance.id, { text: '这会触发一个错误' })).resolves.toBeUndefined();

    expect(mockExternalAPIService.generatePortableLlm).toHaveBeenCalled();
    expect(await getPersistedMessages()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'error',
        content: 'agent.run.error.providerUnavailable',
        metadata: expect.objectContaining({
          agentRunError: expect.objectContaining({ code: 'PROVIDER_UNAVAILABLE' }),
        }),
      }),
    ]));
  });
});
