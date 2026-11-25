/**
 * Agent streaming tests.
 *
 * Metadata subscriptions intentionally never carry a transcript. Streaming
 * partials cross the bounded conversation-projection channel, while completed
 * immutable messages are read through durable paging.
 */
import { TabState, TabType } from '@/pages/Agent/types/tab';
import type { IAgentBrowserService } from '@services/agentBrowser/interface';
import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { AgentInstanceService } from '@services/agentInstance';
import type { IAgentInstanceService } from '@services/agentInstance/interface';
import { container } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { AgentConversationUpdate, AgentDefinition, AgentInstanceLatestStatus, AgentRuntimeView } from 'memeloop';
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
  let testAgentInstance: AgentRuntimeView;
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
      modelConfig: {
        providerId: 'mock',
        modelId: 'mock-model',
        parameters: { temperature: 0.7 },
      },
    };
    vi.spyOn(definitionService, 'getAgentDef').mockResolvedValue(definition);
    testAgentInstance = await agentInstanceService.createAgent(definition.id, { id: nanoid() });

    mockExternalAPIService.getAIConfig = vi.fn().mockResolvedValue({
      default: { providerId: 'mock', modelId: 'mock-model', parameters: { temperature: 0.7 } },
    });
    mockExternalAPIService.getProviderAccounts = vi.fn().mockResolvedValue([{
      providerId: 'mock',
      providerType: 'openai-compatible',
      enabled: true,
      secretRef: 'test://mock/api-key',
      models: [{ modelId: 'mock-model', wireModelId: 'mock-model', apiMode: 'chat-completions' }],
    }]);
  });

  async function getPersistedMessages() {
    const page = await agentInstanceService.getAgentMessagePage(testAgentInstance.id, {
      limit: 80,
      maxBytes: 4 * 1024 * 1024,
      direction: 'forward',
    });
    if (page.reset) throw new Error('unexpected conversation page reset');
    return page.items;
  }

  async function executeMessage(text: string, signal?: AbortSignal) {
    const requestId = `streaming-test:request:${nanoid()}`;
    const turnId = `streaming-test:turn:${nanoid()}`;
    return agentInstanceService.executeLocalAgentMessage({
      target: { kind: 'local' },
      provenance: {
        conversationId: testAgentInstance.id,
        definitionId: testAgentInstance.agentDefId,
        requestId,
        turnId,
      },
      message: text,
    }, { signal });
  }

  it('names the open chat with the free model and keeps a manual rename during generation', async () => {
    const browser = container.get<IAgentBrowserService>(serviceIdentifier.AgentBrowser);
    await browser.initialize();
    const addChatTab = () =>
      browser.addTab({
        id: nanoid(),
        type: TabType.CHAT,
        title: 'Default assistant',
        agentId: testAgentInstance.id,
        state: TabState.ACTIVE,
        isPinned: false,
        createdAt: 0,
        updatedAt: 0,
      });
    const tab = await addChatTab();
    const tabSubscription = browser.tabs$.subscribe();
    const opening = '整理明天的日程';
    const title = '明天的日程安排';
    const heldTitle = Promise.withResolvers<undefined>();
    let nameRequestCount = 0;
    const generate = vi.fn(async function*(request: Parameters<IExternalAPIService['generatePortableLlm']>[0]) {
      const isTitleRequest = request.logicalModelId === 'title-model';
      if (isTitleRequest && ++nameRequestCount === 2) await heldTitle.promise;
      yield { type: 'text-delta' as const, id: 'reply', text: isTitleRequest ? title : '可以。' };
      yield { type: 'finish' as const, finishReason: 'stop' };
    });
    mockExternalAPIService.getAIConfig = vi.fn().mockResolvedValue({ free: { providerId: 'mock', modelId: 'title-model' } });
    mockExternalAPIService.getProviderAccounts = vi.fn().mockResolvedValue([{
      providerId: 'mock',
      providerType: 'openai-compatible',
      enabled: true,
      secretRef: 'test://mock/api-key',
      models: ['mock-model', 'title-model'].map(modelId => ({ modelId, wireModelId: modelId, apiMode: 'chat-completions' })),
    }]);
    mockExternalAPIService.generatePortableLlm = generate;

    try {
      await executeMessage(opening);
      await vi.waitFor(() => {
        expect(browser.tabs$.value.find(candidate => candidate.id === tab.id)?.title).toBe(title);
      });
      expect((await agentInstanceService.getConversationMeta(testAgentInstance.id))?.title).toBe(title);
      expect(generate.mock.calls.find(([request]) => request.logicalModelId === 'title-model')?.[0].messages).toEqual([
        { role: 'user', content: expect.stringContaining(opening) },
      ]);
      await executeMessage('继续');
      expect(nameRequestCount).toBe(1);

      testAgentInstance = await agentInstanceService.createAgent(testAgentInstance.agentDefId);
      const secondTab = await addChatTab();
      await executeMessage('新的聊天');
      await vi.waitFor(() => {
        expect(nameRequestCount).toBe(2);
      });
      await agentInstanceService.updateAgent(testAgentInstance.id, { name: '我的标题' });
      heldTitle.resolve(undefined);
      await vi.waitFor(() => {
        expect((agentInstanceService as AgentInstanceService)['conversationsBeingNamed'].has(testAgentInstance.id)).toBe(false);
      });
      expect(browser.tabs$.value.find(candidate => candidate.id === secondTab.id)?.title).toBe('我的标题');
      expect((await agentInstanceService.getConversationMeta(testAgentInstance.id))?.title).toBe('我的标题');

      testAgentInstance = await agentInstanceService.createAgent(testAgentInstance.agentDefId);
      const fallbackTab = await addChatTab();
      generate.mockImplementation(async function*(request) {
        if (request.logicalModelId === 'title-model') throw new Error('The free model returned HTTP 403');
        yield { type: 'text-delta' as const, id: 'reply', text: '可以。' };
        yield { type: 'finish' as const, finishReason: 'stop' };
      });
      await executeMessage('为本周排个计划');
      await vi.waitFor(() => {
        expect(browser.tabs$.value.find(candidate => candidate.id === fallbackTab.id)?.title).toBe('为本周排个计划');
      });
    } finally {
      heldTitle.resolve(undefined);
      tabSubscription.unsubscribe();
    }
  });

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
      await executeMessage(expectedUserMessage);
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

  it('publishes reasoning and answer deltas as independent bounded projections', async () => {
    const mockAIResponseGenerator = async function*() {
      yield { type: 'reasoning-delta' as const, id: 'reasoning-stream', text: '先分析问题。' };
      await new Promise(resolve => setTimeout(resolve, 60));
      yield { type: 'reasoning-delta' as const, id: 'reasoning-stream', text: '再核对答案。' };
      await new Promise(resolve => setTimeout(resolve, 60));
      yield { type: 'text-delta' as const, id: 'reasoning-stream', text: '最终' };
      await new Promise(resolve => setTimeout(resolve, 60));
      yield { type: 'text-delta' as const, id: 'reasoning-stream', text: '答案' };
      yield { type: 'finish' as const, finishReason: 'stop' };
    };
    mockExternalAPIService.generatePortableLlm = vi.fn().mockReturnValue(mockAIResponseGenerator());
    const projections: Extract<AgentConversationUpdate, { kind: 'projection' }>[] = [];
    const subscription = agentInstanceService.subscribeToConversationUpdates(testAgentInstance.id).subscribe(update => {
      if (update.kind === 'projection' && update.streaming) projections.push(update);
    });
    try {
      await executeMessage('请推理后回答');
    } finally {
      subscription.unsubscribe();
    }

    expect(projections.some(update => update.message.reasoning?.text === '先分析问题。' && update.message.content === '')).toBe(true);
    expect(projections.some(update => update.message.reasoning?.text === '先分析问题。再核对答案。' && update.message.content === '最终')).toBe(true);
    const durablePage = await agentInstanceService.getAgentMessagePage(testAgentInstance.id, {
      limit: 80,
      maxBytes: 256 * 1024,
      direction: 'forward',
    });
    if (durablePage.reset) throw new Error('unexpected conversation page reset');
    const assistant = durablePage.items.find(message => message.role === 'assistant');
    expect(assistant).toMatchObject({
      content: '最终答案',
      reasoning: { text: '', hasMore: true },
    });
    expect(assistant?.metadata?.displayTruncation).toBeUndefined();
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

    await executeMessage('测试消息级别流式更新');
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

    const metadataUpdates: AgentRuntimeView[] = [];
    const subscription = agentInstanceService.subscribeToAgentUpdates(testAgentInstance.id).subscribe(update => {
      if (update) metadataUpdates.push(update);
    });
    try {
      await executeMessage('测试 Observable 完成时机');
      await vi.waitFor(() => {
        expect(metadataUpdates.length).toBeGreaterThan(0);
      });
      expect(metadataUpdates.every(update => !Object.prototype.hasOwnProperty.call(update, 'messages'))).toBe(true);
      expect((await getPersistedMessages()).some(message => message.content === '流式回答开始...已完成！')).toBe(true);
    } finally {
      subscription.unsubscribe();
    }
  });

  it('cancels the exact durable run through the command signal without marking the agent failed', async () => {
    mockExternalAPIService.generatePortableLlm = vi.fn().mockImplementation((request: Parameters<IExternalAPIService['generatePortableLlm']>[0]) =>
      (async function*() {
        yield { type: 'text-delta' as const, id: 'test-request-cancel', text: '已开始回答' };
        const signal = request.signal;
        if (!signal) throw new Error('durable request did not receive its cancellation signal');
        await new Promise<never>((_resolve, reject) => {
          const abortError = () => signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError');
          if (signal.aborted) {
            reject(abortError());
            return;
          }
          signal.addEventListener('abort', () => {
            reject(abortError());
          }, { once: true });
        });
      })()
    );

    const projections: Extract<AgentConversationUpdate, { kind: 'projection' }>[] = [];
    const subscription = agentInstanceService.subscribeToConversationUpdates(testAgentInstance.id).subscribe(update => {
      if (update.kind === 'projection' && update.streaming) projections.push(update);
    });
    const abortController = new AbortController();
    const execution = executeMessage('取消这次回答', abortController.signal);
    const settledError = execution.then(
      () => undefined,
      (error: unknown) => error,
    );
    try {
      await vi.waitFor(() => {
        expect(projections.some(update => update.message.content === '已开始回答')).toBe(true);
      });
      abortController.abort();
      await expect(settledError).resolves.toMatchObject({ name: 'AbortError' });
      await vi.waitFor(async () => {
        expect((await agentInstanceService.getAgentMetadata(testAgentInstance.id))?.status?.state).toBe('canceled');
      });
    } finally {
      subscription.unsubscribe();
    }
  });

  it('persists a localized typed AI stream error and rejects the durable run with the same typed failure', async () => {
    const mockAIResponseGenerator = async function*() {
      yield { type: 'finish' as const, finishReason: 'stop' };
      throw new Error('Test AI error');
    };
    mockExternalAPIService.generatePortableLlm = vi.fn().mockReturnValue(mockAIResponseGenerator());

    await expect(executeMessage('这会触发一个错误')).rejects.toMatchObject({
      message: 'PROVIDER_UNAVAILABLE',
      agentRunError: expect.objectContaining({ code: 'PROVIDER_UNAVAILABLE' }),
    });

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
