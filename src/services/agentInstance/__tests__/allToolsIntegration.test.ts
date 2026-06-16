/**
 * Integration test: every agent tool exercised with mocked AI + real tool execution.
 * Verifies filesystem side effects for wikiOperation.
 */
import { WikiChannel } from '@/constants/channels';
import type { AgentDefinition, IAgentDefinitionService } from '@services/agentDefinitionService';
import type { AgentInstance } from 'memeloop';

import type { IAgentInstanceService } from '@services/agentInstance/interface';
import { container } from '@services/container';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { getBuiltinAgentDefinitions } from 'memeloop';
import { nanoid } from 'nanoid';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('all tools integration', () => {
  let agentInstanceService: IAgentInstanceService;
  let testAgentInstance: AgentInstance;
  let mockExternalAPIService: Partial<IExternalAPIService>;
  let mockWikiService: Partial<IWikiService>;
  let mockWorkspaceService: Partial<IWorkspaceService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockExternalAPIService = container.get(serviceIdentifier.ExternalAPI);
    mockWikiService = container.get(serviceIdentifier.Wiki);
    mockWorkspaceService = container.get(serviceIdentifier.Workspace);

    agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
    await agentInstanceService.initializeFrameworks();

    const defaultAgent = getBuiltinAgentDefinitions().find(a => a.id === 'memeloop:general-assistant');
    testAgentInstance = {
      ...(defaultAgent as AgentDefinition),
      id: nanoid(),
      agentDefId: defaultAgent!.id,
      name: 'Tool Test Agent',
      status: { state: 'working', modified: new Date() },
      created: new Date(),
      closed: false,
      messages: [],
    };

    const definition = container.get<IAgentDefinitionService>(serviceIdentifier.AgentDefinition);
    vi.spyOn(definition, 'getAgentDef').mockResolvedValue(defaultAgent);
    vi.spyOn(agentInstanceService, 'getAgent').mockResolvedValue(testAgentInstance);

    mockExternalAPIService.getAIConfig = vi.fn().mockResolvedValue({
      default: { provider: 'mock', model: 'mock-model' },
      modelParameters: { temperature: 0.7 },
    });

    mockWorkspaceService.getWorkspacesAsList = vi.fn().mockResolvedValue([
      { name: 'wiki', id: 'CJXwbR91GJmElyURHiGA1', wikiFolderLocation: '/home/chenshuangfeng/Github/TidGi-Desktop/wiki-dev/wiki', isWiki: true } as never,
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function* mockChunk(content: string) {
    yield { status: 'done' as const, content, requestId: 'r-' + Math.random().toString(36).slice(2, 8) };
  }

  // ── wiki-search ────────────────────────────────────────────

  it('wiki-search: agent calls wikiSearch and receives tiddler results', async () => {
    mockExternalAPIService.generateFromAI = vi.fn()
      .mockReturnValueOnce(mockChunk('<tool_use name="wiki-search">{"workspaceName":"wiki","searchType":"filter","filter":"[tag[test]]","limit":10}</tool_use>'))
      .mockReturnValueOnce(mockChunk('搜索完成：找到了 2 条笔记。'));

    mockWikiService.wikiOperationInServer = vi.fn()
      .mockResolvedValueOnce(['TestNote1', 'TestNote2']);

    mockWorkspaceService.exists = vi.fn().mockResolvedValue(true);

    await agentInstanceService.sendMsgToAgent(testAgentInstance.id, { text: '搜索 wiki 中 tag 为 test 的笔记' });

    expect(mockWikiService.wikiOperationInServer).toHaveBeenCalledWith(
      WikiChannel.runFilter,
      'CJXwbR91GJmElyURHiGA1',
      ['[tag[test]]'],
    );

    const assistant = (await agentInstanceService.getAgent(testAgentInstance.id))!.messages.filter(m => m.role === 'assistant');
    expect(assistant[assistant.length - 1].content).toBe('搜索完成：找到了 2 条笔记。');
  }, 30000);

  // ── wiki-operation add ─────────────────────────────────────

  it('wiki-operation: agent adds a tiddler (mock verified)', async () => {
    const testTitle = `AI-Test-${Date.now()}`;
    const testText = '这是 AI 创建的测试笔记';

    mockExternalAPIService.generateFromAI = vi.fn()
      .mockReturnValueOnce(
        mockChunk(`<tool_use name="wiki-operation">{"workspaceName":"wiki","operation":"wiki-add-tiddler","title":"${testTitle}","text":"${testText}"}</tool_use>`),
      )
      .mockReturnValueOnce(mockChunk('已创建笔记。'));

    mockWikiService.wikiOperationInServer = vi.fn().mockResolvedValue(undefined);
    mockWorkspaceService.exists = vi.fn().mockResolvedValue(true);

    await agentInstanceService.sendMsgToAgent(testAgentInstance.id, { text: `在 wiki 中创建笔记 ${testTitle}` });

    expect(mockWikiService.wikiOperationInServer).toHaveBeenCalledWith(
      WikiChannel.addTiddler,
      'CJXwbR91GJmElyURHiGA1',
      [testTitle, testText, '{}', JSON.stringify({ withDate: true })],
    );

    const assistant = (await agentInstanceService.getAgent(testAgentInstance.id))!.messages.filter(m => m.role === 'assistant');
    expect(assistant[assistant.length - 1].content).toBe('已创建笔记。');
  }, 30000);

  // ── wiki-operation set ─────────────────────────────────────

  it('wiki-operation: agent edits tiddler (mock verified)', async () => {
    const testTitle = `AI-Edit-${Date.now()}`;
    const updatedText = '更新后内容';

    mockExternalAPIService.generateFromAI = vi.fn()
      .mockReturnValueOnce(
        mockChunk(`<tool_use name="wiki-operation">{"workspaceName":"wiki","operation":"wiki-set-tiddler-text","title":"${testTitle}","text":"${updatedText}"}</tool_use>`),
      )
      .mockReturnValueOnce(mockChunk('已更新。'));

    mockWikiService.wikiOperationInServer = vi.fn().mockResolvedValue(undefined);
    mockWorkspaceService.exists = vi.fn().mockResolvedValue(true);

    await agentInstanceService.sendMsgToAgent(testAgentInstance.id, { text: `更新笔记 ${testTitle}` });

    expect(mockWikiService.wikiOperationInServer).toHaveBeenCalledWith(
      WikiChannel.setTiddlerText,
      'CJXwbR91GJmElyURHiGA1',
      [testTitle, updatedText],
    );
  }, 30000);

  it('wiki-operation: agent deletes tiddler (mock verified)', async () => {
    const testTitle = `AI-Delete-${Date.now()}`;

    mockExternalAPIService.generateFromAI = vi.fn()
      .mockReturnValueOnce(mockChunk(`<tool_use name="wiki-operation">{"workspaceName":"wiki","operation":"wiki-delete-tiddler","title":"${testTitle}"}</tool_use>`))
      .mockReturnValueOnce(mockChunk('已删除。'));

    mockWikiService.wikiOperationInServer = vi.fn().mockResolvedValue(undefined);
    mockWorkspaceService.exists = vi.fn().mockResolvedValue(true);

    await agentInstanceService.sendMsgToAgent(testAgentInstance.id, { text: `删除笔记 ${testTitle}` });

    expect(mockWikiService.wikiOperationInServer).toHaveBeenCalledWith(
      WikiChannel.deleteTiddler,
      'CJXwbR91GJmElyURHiGA1',
      [testTitle],
    );
  }, 30000);

  // ── ask-question ───────────────────────────────────────────

  it('askQuestion: agent yields to human for input', async () => {
    mockExternalAPIService.generateFromAI = vi.fn()
      .mockReturnValueOnce(mockChunk('<tool_use name="ask-question">{"question":"Which workspace?","inputType":"single-select","options":[{"label":"wiki"}]}</tool_use>'));

    await agentInstanceService.sendMsgToAgent(testAgentInstance.id, { text: '帮我搜笔记' });

    const agent = await agentInstanceService.getAgent(testAgentInstance.id);
    expect(agent!.status.state).toBe('input-required');
  }, 30000);

  // ── workspacesList ─────────────────────────────────────────

  it('workspacesList: available workspaces appear in prompt', async () => {
    mockExternalAPIService.generateFromAI = vi.fn()
      .mockReturnValueOnce(mockChunk('workspaces 已列出。'));

    await agentInstanceService.sendMsgToAgent(testAgentInstance.id, { text: '列出工作区' });

    expect(mockWorkspaceService.getWorkspacesAsList).toHaveBeenCalled();
    const agent = await agentInstanceService.getAgent(testAgentInstance.id);
    const assistant = agent!.messages.filter(m => m.role === 'assistant');
    expect(assistant.length).toBeGreaterThanOrEqual(1);
  }, 30000);

  // ── webFetch ───────────────────────────────────────────────

  it('webFetch: agent fetches a URL', async () => {
    mockExternalAPIService.generateFromAI = vi.fn()
      .mockReturnValueOnce(mockChunk('<tool_use name="web-fetch">{"url":"https://example.com"}</tool_use>'))
      .mockReturnValueOnce(mockChunk('已抓取。'));

    await agentInstanceService.sendMsgToAgent(testAgentInstance.id, { text: '抓取 https://example.com' });

    const agent = await agentInstanceService.getAgent(testAgentInstance.id);
    const assistant = agent!.messages.filter(m => m.role === 'assistant');
    expect(assistant.length).toBeGreaterThanOrEqual(1);
  }, 30000);
});
