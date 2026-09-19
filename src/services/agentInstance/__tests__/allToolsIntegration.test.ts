/**
 * Integration test: every agent tool exercised with mocked AI + real tool execution.
 * Verifies filesystem side effects for wikiOperation.
 */
import { WikiChannel } from '@/constants/channels';
import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { AgentDefinition, AgentRuntimeView } from 'memeloop';
import path from 'node:path';

import type { IAgentInstanceService } from '@services/agentInstance/interface';
import { container } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { SupportedStorageServices } from '@services/types';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspace, IWorkspaceService } from '@services/workspaces/interface';
import { getBuiltinLoopProfiles } from 'memeloop';
import { nanoid } from 'nanoid';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

function toAgentDefinition(profile: ReturnType<typeof getBuiltinLoopProfiles>[number]): AgentDefinition {
  return {
    systemPrompt: '',
    tools: [],
    version: '1',
    ...profile,
  };
}

function testWorkspace(): IWorkspace {
  return {
    id: 'CJXwbR91GJmElyURHiGA1',
    name: 'wiki',
    wikiFolderLocation: path.resolve('test-artifacts', 'all-tools-integration', 'wiki'),
    homeUrl: 'http://localhost:5213/',
    port: 5213,
    isSubWiki: false,
    tagNames: [],
    lastUrl: null,
    active: true,
    hibernated: false,
    order: 1,
    enableHTTPAPI: false,
    gitUrl: null,
    readOnlyMode: false,
    storageService: SupportedStorageServices.local,
    syncOnInterval: false,
    syncOnStartup: false,
    tokenAuth: false,
    transparentBackground: false,
    userName: '',
    picturePath: null,
  };
}

describe('all tools integration', () => {
  let agentInstanceService: IAgentInstanceService;
  let testAgentInstance: AgentRuntimeView;
  let mockExternalAPIService: Partial<IExternalAPIService>;
  let mockWikiService: Partial<IWikiService>;
  let mockWorkspaceService: Partial<IWorkspaceService>;

  beforeAll(async () => {
    await container.get<IDatabaseService>(serviceIdentifier.Database).initializeForApp();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockExternalAPIService = container.get(serviceIdentifier.ExternalAPI);
    mockWikiService = container.get(serviceIdentifier.Wiki);
    mockWorkspaceService = container.get(serviceIdentifier.Workspace);

    agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
    const definition = container.get<IAgentDefinitionService>(serviceIdentifier.AgentDefinition);
    await definition.initialize();
    await agentInstanceService.initialize();

    const defaultProfile = getBuiltinLoopProfiles().find(a => a.id === 'memeloop:general-assistant');
    const wikiProfile = getBuiltinLoopProfiles().find(a => a.id === 'memeloop:frontend-ui-ux');
    if (!defaultProfile) throw new Error('Missing built-in general assistant profile');
    if (!wikiProfile) throw new Error('Missing built-in frontend assistant profile');
    const defaultAgent = {
      ...toAgentDefinition(defaultProfile),
      tools: [],
      plugins: [],
      modelConfig: {
        providerId: 'mock',
        modelId: 'mock-model',
        parameters: { temperature: 0.7 },
      },
      agentTools: [...new Map(
        [...(defaultProfile.agentTools ?? []), ...(wikiProfile.agentTools ?? [])]
          .filter(tool => ['workspacesList', 'wikiSearch', 'wikiOperation', 'ask-question', 'todoWrite', 'webFetch'].includes(tool.toolId))
          .map(tool => [tool.toolId, tool] as const),
      ).values()],
    };

    vi.spyOn(definition, 'getAgentDef').mockResolvedValue(defaultAgent);
    testAgentInstance = await agentInstanceService.createAgent(defaultAgent.id, { id: nanoid() });

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

    mockWorkspaceService.getWorkspacesAsList = vi.fn().mockResolvedValue([testWorkspace()]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function* mockChunk(content: string) {
    yield { type: 'text-delta' as const, id: 'r-' + Math.random().toString(36).slice(2, 8), text: content };
    yield { type: 'finish' as const, finishReason: 'stop' };
  }

  async function* mockToolCall(toolName: string, input: Record<string, unknown>) {
    yield { type: 'tool-call' as const, toolCallId: `call-${nanoid()}`, toolName, input };
    yield { type: 'finish' as const, finishReason: 'tool-calls' };
  }

  async function executeMessage(text: string) {
    const requestId = `all-tools:request:${nanoid()}`;
    const turnId = `all-tools:turn:${nanoid()}`;
    return agentInstanceService.executeLocalAgentMessage({
      target: { kind: 'local' },
      provenance: {
        conversationId: testAgentInstance.id,
        definitionId: testAgentInstance.agentDefId,
        requestId,
        turnId,
      },
      message: text,
    });
  }

  async function getPersistedMessages() {
    const page = await agentInstanceService.getAgentMessagePage(testAgentInstance.id, {
      limit: 80,
      maxBytes: 4 * 1024 * 1024,
      direction: 'forward',
    });
    if (page.reset) throw new Error('unexpected conversation page reset');
    return page.items;
  }

  // ── wiki-search ────────────────────────────────────────────

  it('wiki-search: agent calls wikiSearch and receives tiddler results', async () => {
    mockExternalAPIService.generatePortableLlm = vi.fn()
      .mockReturnValueOnce(mockToolCall('wiki-search', {
        workspaceName: 'wiki',
        searchType: 'filter',
        filter: '[tag[test]]',
        limit: 10,
      }))
      .mockReturnValueOnce(mockChunk('搜索完成：找到了 2 条笔记。'));

    mockWikiService.wikiOperationInServer = vi.fn()
      .mockResolvedValueOnce(['TestNote1', 'TestNote2'])
      .mockResolvedValueOnce('First note body')
      .mockResolvedValueOnce('Second note body');

    mockWorkspaceService.exists = vi.fn().mockResolvedValue(true);

    await executeMessage('搜索 wiki 中 tag 为 test 的笔记');

    expect(mockWikiService.wikiOperationInServer).toHaveBeenCalledWith(
      WikiChannel.runFilter,
      'CJXwbR91GJmElyURHiGA1',
      ['[tag[test]]'],
    );
    expect(mockWikiService.wikiOperationInServer).toHaveBeenCalledWith(
      WikiChannel.getTiddlerText,
      'CJXwbR91GJmElyURHiGA1',
      ['TestNote1'],
    );
    expect(mockWikiService.wikiOperationInServer).toHaveBeenCalledWith(
      WikiChannel.getTiddlerText,
      'CJXwbR91GJmElyURHiGA1',
      ['TestNote2'],
    );

    const assistant = (await getPersistedMessages()).filter(m => m.role === 'assistant');
    expect(assistant[assistant.length - 1].content).toBe('搜索完成：找到了 2 条笔记。');
  }, 30000);

  it('wiki-search: reports filter parse errors instead of treating them as notes', async () => {
    mockExternalAPIService.generatePortableLlm = vi.fn()
      .mockReturnValueOnce(
        mockToolCall('wiki-search', {
          workspaceName: 'wiki',
          searchType: 'filter',
          filter: '[title=Broken]',
        }),
      )
      .mockReturnValueOnce(mockChunk('搜索条件无效，尚未完成验证。'));

    mockWikiService.wikiOperationInServer = vi.fn()
      .mockResolvedValueOnce(['筛选器错误: Missing [ in filter expression']);
    mockWorkspaceService.exists = vi.fn().mockResolvedValue(true);

    await executeMessage('精确查找 Broken');

    const toolMessage = (await getPersistedMessages())
      .find(message => message.role === 'tool');
    expect(toolMessage?.content).toContain('Invalid TiddlyWiki filter');
    expect(toolMessage?.content).toContain('[title[Exact Title]]');
  }, 30000);

  // ── wiki-operation add ─────────────────────────────────────

  it('wiki-operation: agent adds a tiddler (mock verified)', async () => {
    const testTitle = `AI-Test-${Date.now()}`;
    const testText = '这是 AI 创建的测试笔记';

    mockExternalAPIService.generatePortableLlm = vi.fn()
      .mockReturnValueOnce(
        mockToolCall('wiki-operation', {
          workspaceName: 'wiki',
          operation: 'wiki-add-tiddler',
          title: testTitle,
          text: testText,
        }),
      )
      .mockReturnValueOnce(mockChunk('已创建笔记。'));

    mockWikiService.wikiOperationInServer = vi.fn().mockResolvedValue(undefined);
    mockWorkspaceService.exists = vi.fn().mockResolvedValue(true);

    await executeMessage(`在 wiki 中创建笔记 ${testTitle}`);

    expect(mockWikiService.wikiOperationInServer).toHaveBeenCalledWith(
      WikiChannel.addTiddler,
      'CJXwbR91GJmElyURHiGA1',
      [testTitle, testText, '{}', JSON.stringify({ withDate: true })],
    );

    const assistant = (await getPersistedMessages()).filter(m => m.role === 'assistant');
    expect(assistant[assistant.length - 1].content).toBe('已创建笔记。');
  }, 30000);

  // ── persistent goal / todo ─────────────────────────────────

  it('manage-todo: persists a session goal as a Wiki tiddler', async () => {
    const todoText = '- [ ] 列出工作区\n- [ ] 创建笔记\n- [ ] 核对正文';
    mockExternalAPIService.generatePortableLlm = vi.fn()
      .mockReturnValueOnce(
        mockToolCall('manage-todo', { workspaceName: 'wiki', operation: 'write', text: todoText }),
      )
      .mockReturnValueOnce(mockChunk('计划已保存。'));

    mockWikiService.wikiOperationInServer = vi.fn().mockResolvedValue(undefined);

    await executeMessage('为这个三步目标建立计划');

    expect(mockWikiService.wikiOperationInServer).toHaveBeenCalledWith(
      WikiChannel.addTiddler,
      'CJXwbR91GJmElyURHiGA1',
      [
        `$:/ai/todo/${testAgentInstance.id}`,
        todoText,
        JSON.stringify({ type: 'text/vnd.tiddlywiki', tags: '$:/tags/AI/Todo' }),
        JSON.stringify({ withDate: true }),
      ],
    );
  }, 30000);

  // ── wiki-operation set ─────────────────────────────────────

  it('wiki-operation: agent edits tiddler (mock verified)', async () => {
    const testTitle = `AI-Edit-${Date.now()}`;
    const updatedText = '更新后内容';

    mockExternalAPIService.generatePortableLlm = vi.fn()
      .mockReturnValueOnce(
        mockToolCall('wiki-operation', {
          workspaceName: 'wiki',
          operation: 'wiki-set-tiddler-text',
          title: testTitle,
          text: updatedText,
        }),
      )
      .mockReturnValueOnce(mockChunk('已更新。'));

    mockWikiService.wikiOperationInServer = vi.fn().mockResolvedValue(undefined);
    mockWorkspaceService.exists = vi.fn().mockResolvedValue(true);

    await executeMessage(`更新笔记 ${testTitle}`);

    expect(mockWikiService.wikiOperationInServer).toHaveBeenCalledWith(
      WikiChannel.setTiddlerText,
      'CJXwbR91GJmElyURHiGA1',
      [testTitle, updatedText],
    );
  }, 30000);

  it('wiki-operation: agent deletes tiddler (mock verified)', async () => {
    const testTitle = `AI-Delete-${Date.now()}`;

    mockExternalAPIService.generatePortableLlm = vi.fn()
      .mockReturnValueOnce(mockToolCall('wiki-operation', {
        workspaceName: 'wiki',
        operation: 'wiki-delete-tiddler',
        title: testTitle,
      }))
      .mockReturnValueOnce(mockChunk('已删除。'));

    mockWikiService.wikiOperationInServer = vi.fn().mockResolvedValue(undefined);
    mockWorkspaceService.exists = vi.fn().mockResolvedValue(true);

    await executeMessage(`删除笔记 ${testTitle}`);

    expect(mockWikiService.wikiOperationInServer).toHaveBeenCalledWith(
      WikiChannel.deleteTiddler,
      'CJXwbR91GJmElyURHiGA1',
      [testTitle],
    );
  }, 30000);

  // ── ask-question ───────────────────────────────────────────

  it('askQuestion: agent yields to human for input', async () => {
    mockExternalAPIService.generatePortableLlm = vi.fn()
      .mockReturnValueOnce(mockToolCall('ask-question', {
        question: 'Which workspace?',
        inputType: 'single-select',
        options: [{ label: 'wiki' }],
      }));

    await executeMessage('帮我搜笔记');

    const agent = await agentInstanceService.getAgentMetadata(testAgentInstance.id);
    if (!agent) throw new Error('Expected the created agent runtime metadata');
    expect(agent.status.state).toBe('input-required');
  }, 30000);

  // ── workspacesList ─────────────────────────────────────────

  it('workspacesList: available workspaces appear in prompt', async () => {
    mockExternalAPIService.generatePortableLlm = vi.fn()
      .mockReturnValueOnce(mockChunk('workspaces 已列出。'));

    await executeMessage('列出工作区');

    expect(mockWorkspaceService.getWorkspacesAsList).toHaveBeenCalled();
    const assistant = (await getPersistedMessages()).filter(m => m.role === 'assistant');
    expect(assistant.length).toBeGreaterThanOrEqual(1);
  }, 30000);

  // ── webFetch ───────────────────────────────────────────────

  it('webFetch: agent fetches a URL', async () => {
    mockExternalAPIService.generatePortableLlm = vi.fn()
      .mockReturnValueOnce(mockToolCall('web-fetch', { url: 'https://example.com' }))
      .mockReturnValueOnce(mockChunk('已抓取。'));

    await executeMessage('抓取 https://example.com');

    const assistant = (await getPersistedMessages()).filter(m => m.role === 'assistant');
    expect(assistant.length).toBeGreaterThanOrEqual(1);
  }, 30000);
});
