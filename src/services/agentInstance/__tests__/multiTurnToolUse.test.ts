/**
 * End-to-end unit test: simulate a complete multi-turn conversation with
 * tool calls using mocked OpenAI responses. This test validates the entire
 * pipeline: agentTools → plugins → prompt → LLM → tool call → execution → result.
 */
import { getBuiltinAgentDefinitions } from 'memeloop';
import { nanoid } from 'nanoid';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IAgentDefinitionService } from '@services/agentDefinitionService';
import type { AgentDefinition } from 'memeloop';
import type { AgentInstance } from 'memeloop';

import type { IAgentInstanceService } from '@services/agentInstance/interface';
import { container } from '@services/container';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';

describe('multi-turn tool-use conversation', () => {
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
      name: 'Test Agent',
      status: { state: 'working', modified: new Date() },
      created: new Date(),
      closed: false,
      messages: [],
    };

    const definition = container.get<IAgentDefinitionService>(serviceIdentifier.AgentDefinition);
    vi.spyOn(definition, 'getAgentDef').mockResolvedValue(defaultAgent);
    vi.spyOn(agentInstanceService, 'getAgent').mockResolvedValue(testAgentInstance);

    mockExternalAPIService.getAIConfig = vi.fn().mockResolvedValue({
      default: { provider: 'siliconflow', model: 'deepseek-ai/DeepSeek-V4-Pro' },
      modelParameters: { temperature: 0.7 },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs a complete multi-turn: search wiki → add tiddler', async () => {
    // Turn 1: AI returns a wiki-search tool call
    const aiTurn1 = function*() {
      yield {
        status: 'done' as const,
        content: '<tool_use name="wiki-search">{"workspaceName":"test-wiki-1","searchType":"filter","filter":"[tag[test]]","limit":5}</tool_use>',
        requestId: 'r1',
      };
    };

    // Turn 2: AI returns a wiki-operation tool call
    const aiTurn2 = function*() {
      yield {
        status: 'done' as const,
        content: '<tool_use name="wiki-operation">{"workspaceName":"test-wiki-1","operation":"wiki-add-tiddler","title":"new-note","text":"hello world"}</tool_use>',
        requestId: 'r2',
      };
    };

    // Turn 3: AI returns final text
    const aiTurn3 = function*() {
      yield {
        status: 'done' as const,
        content: '已完成搜索和添加笔记。',
        requestId: 'r3',
      };
    };

    mockExternalAPIService.generateFromAI = vi.fn()
      .mockReturnValueOnce(aiTurn1())
      .mockReturnValueOnce(aiTurn2())
      .mockReturnValueOnce(aiTurn3());

    mockWikiService.wikiOperationInServer = vi.fn()
      .mockResolvedValueOnce([{ title: 'existing', text: 'content' }]) // search result
      .mockResolvedValueOnce(undefined); // add result

    mockWorkspaceService.getWorkspacesAsList = vi.fn().mockResolvedValue([
      { name: 'test-wiki-1', id: 'test-wiki-1', wikiFolderLocation: '/tmp/wiki', isWiki: true } as never,
    ]);

    await agentInstanceService.sendMsgToAgent(testAgentInstance.id, {
      text: '帮我搜索 test 标签的笔记，然后创建一个新笔记',
    });

    expect(mockWikiService.wikiOperationInServer).toHaveBeenCalled();
    expect(mockExternalAPIService.generateFromAI).toHaveBeenCalledTimes(3);

    const agent = await agentInstanceService.getAgent(testAgentInstance.id);
    const assistantMessages = agent!.messages.filter(m => m.role === 'assistant');
    expect(assistantMessages.length).toBeGreaterThanOrEqual(1);
    expect(assistantMessages[assistantMessages.length - 1].content).toBe('已完成搜索和添加笔记。');
  }, 30000);

  it('handles tool errors then self-corrects', async () => {
    // Turn 1: AI calls wiki-search for nonexistent workspace → error
    const aiTurn1 = function*() {
      yield {
        status: 'done' as const,
        content: '<tool_use name="wiki-search">{"workspaceName":"bad-workspace","searchType":"filter","filter":"[tag[x]]"}</tool_use>',
        requestId: 'r1',
      };
    };
    // Turn 2: AI calls wiki-search for correct workspace
    const aiTurn2 = function*() {
      yield {
        status: 'done' as const,
        content: '<tool_use name="wiki-search">{"workspaceName":"test-wiki-1","searchType":"filter","filter":"[tag[x]]"}</tool_use>',
        requestId: 'r2',
      };
    };
    // Turn 3: final answer
    const aiTurn3 = function*() {
      yield {
        status: 'done' as const,
        content: '没有找到相关笔记。',
        requestId: 'r3',
      };
    };

    mockExternalAPIService.generateFromAI = vi.fn()
      .mockReturnValueOnce(aiTurn1())
      .mockReturnValueOnce(aiTurn2())
      .mockReturnValueOnce(aiTurn3());

    mockWikiService.wikiOperationInServer = vi.fn()
      .mockResolvedValueOnce([]) // correct workspace search
      .mockResolvedValueOnce([]); // bad workspace search (will throw via workspace resolution)

    mockWorkspaceService.getWorkspacesAsList = vi.fn()
      .mockResolvedValueOnce([
        { name: 'test-wiki-1', id: 'test-wiki-1', wikiFolderLocation: '/tmp/wiki', isWiki: true } as never,
      ])
      .mockResolvedValueOnce([
        { name: 'test-wiki-1', id: 'test-wiki-1', wikiFolderLocation: '/tmp/wiki', isWiki: true } as never,
      ]);

    await agentInstanceService.sendMsgToAgent(testAgentInstance.id, { text: '找一下 tag x 的笔记' });

    const agent = await agentInstanceService.getAgent(testAgentInstance.id);
    const assistantMessages = agent!.messages.filter(m => m.role === 'assistant');
    expect(assistantMessages.length).toBeGreaterThanOrEqual(1);
    expect(assistantMessages[assistantMessages.length - 1].content).toBe('没有找到相关笔记。');
  }, 30000);
});
