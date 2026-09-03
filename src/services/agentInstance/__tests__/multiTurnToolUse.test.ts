/**
 * End-to-end unit test: simulate a complete multi-turn conversation with
 * tool calls using mocked OpenAI responses. This test validates the entire
 * pipeline: agentTools → plugins → prompt → LLM → tool call → execution → result.
 */
import { getBuiltinLoopProfiles } from 'memeloop';
import { nanoid } from 'nanoid';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { AgentDefinition, AgentRuntimeView } from 'memeloop';

import type { IAgentInstanceService } from '@services/agentInstance/interface';
import { container } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { SupportedStorageServices } from '@services/types';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspace, IWorkspaceService } from '@services/workspaces/interface';

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
    id: 'test-wiki-1',
    name: 'test-wiki-1',
    wikiFolderLocation: '/tmp/wiki',
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

describe('multi-turn tool-use conversation', () => {
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

    mockExternalAPIService.getAIConfig = vi.fn().mockResolvedValue({
      default: { providerId: 'siliconflow', modelId: 'deepseek-ai/DeepSeek-V4-Pro', parameters: { temperature: 0.7 } },
    });
    mockExternalAPIService.getProviderAccounts = vi.fn().mockResolvedValue([{
      providerId: 'siliconflow',
      providerType: 'openai-compatible',
      enabled: true,
      secretRef: 'test://siliconflow/api-key',
      models: [{
        modelId: 'deepseek-ai/DeepSeek-V4-Pro',
        wireModelId: 'deepseek-ai/DeepSeek-V4-Pro',
        apiMode: 'chat-completions',
      }],
    }]);

    agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
    const definition = container.get<IAgentDefinitionService>(serviceIdentifier.AgentDefinition);
    await definition.initialize();
    await agentInstanceService.initialize();

    const defaultProfile = getBuiltinLoopProfiles().find(a => a.id === 'memeloop:general-assistant');
    const wikiProfile = getBuiltinLoopProfiles().find(a => a.id === 'memeloop:frontend-ui-ux');
    if (!defaultProfile) throw new Error('Missing built-in general assistant profile');
    if (!wikiProfile) throw new Error('Missing built-in frontend assistant profile');
    const defaultAgent: AgentDefinition = {
      ...toAgentDefinition(defaultProfile),
      tools: [],
      agentTools: (wikiProfile.agentTools ?? []).filter(tool => ['wikiSearch', 'wikiOperation'].includes(tool.toolId)),
      modelConfig: {
        providerId: 'siliconflow',
        modelId: 'deepseek-ai/DeepSeek-V4-Pro',
        parameters: { temperature: 0.7 },
      },
    };

    vi.spyOn(definition, 'getAgentDef').mockResolvedValue(defaultAgent);
    testAgentInstance = await agentInstanceService.createAgent(defaultAgent.id, { id: nanoid() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  async function* portableText(content: string, id: string) {
    yield { type: 'text-delta' as const, id, text: content };
    yield { type: 'finish' as const, finishReason: 'stop' };
  }

  async function* portableToolCall(toolName: string, input: Record<string, unknown>, id: string) {
    yield { type: 'tool-call' as const, toolCallId: id, toolName, input };
    yield { type: 'finish' as const, finishReason: 'tool-calls' };
  }

  async function executeMessage(text: string) {
    return agentInstanceService.executeLocalAgentMessage({
      target: { kind: 'local' },
      provenance: {
        conversationId: testAgentInstance.id,
        definitionId: testAgentInstance.agentDefId,
        requestId: `multi-turn:request:${nanoid()}`,
        turnId: `multi-turn:turn:${nanoid()}`,
      },
      message: text,
    });
  }

  it('runs a complete multi-turn: search wiki → add tiddler', async () => {
    // Turn 1: AI returns a wiki-search tool call
    const aiTurn1 = () => portableToolCall('wiki-search', {
      workspaceName: 'test-wiki-1',
      searchType: 'filter',
      filter: '[tag[test]]',
      limit: 5,
    }, 'call-1');

    // Turn 2: AI returns a wiki-operation tool call
    const aiTurn2 = () => portableToolCall('wiki-operation', {
      workspaceName: 'test-wiki-1',
      operation: 'wiki-add-tiddler',
      title: 'new-note',
      text: 'hello world',
    }, 'call-2');

    // Turn 3: AI returns final text
    const aiTurn3 = () => portableText('已完成搜索和添加笔记。', 'r3');

    mockExternalAPIService.generatePortableLlm = vi.fn()
      .mockReturnValueOnce(aiTurn1())
      .mockReturnValueOnce(aiTurn2())
      .mockReturnValueOnce(aiTurn3());

    mockWikiService.wikiOperationInServer = vi.fn()
      .mockResolvedValueOnce([{ title: 'existing', text: 'content' }]) // search result
      .mockResolvedValueOnce(undefined); // add result

    mockWorkspaceService.getWorkspacesAsList = vi.fn().mockResolvedValue([testWorkspace()]);

    await executeMessage('帮我搜索 test 标签的笔记，然后创建一个新笔记');

    expect(mockWikiService.wikiOperationInServer).toHaveBeenCalled();
    expect(mockExternalAPIService.generatePortableLlm).toHaveBeenCalledTimes(3);

    const assistantMessages = (await getPersistedMessages()).filter(m => m.role === 'assistant');
    expect(assistantMessages.length).toBeGreaterThanOrEqual(1);
    expect(assistantMessages[assistantMessages.length - 1].content).toBe('已完成搜索和添加笔记。');
  }, 30000);

  it('handles tool errors then self-corrects', async () => {
    // Turn 1: AI calls wiki-search for nonexistent workspace → error
    const aiTurn1 = () => portableToolCall('wiki-search', {
      workspaceName: 'bad-workspace',
      searchType: 'filter',
      filter: '[tag[x]]',
    }, 'call-error');
    // Turn 2: AI calls wiki-search for correct workspace
    const aiTurn2 = () => portableToolCall('wiki-search', {
      workspaceName: 'test-wiki-1',
      searchType: 'filter',
      filter: '[tag[x]]',
    }, 'call-corrected');
    // Turn 3: final answer
    const aiTurn3 = () => portableText('没有找到相关笔记。', 'r3');

    mockExternalAPIService.generatePortableLlm = vi.fn()
      .mockReturnValueOnce(aiTurn1())
      .mockReturnValueOnce(aiTurn2())
      .mockReturnValueOnce(aiTurn3());

    mockWikiService.wikiOperationInServer = vi.fn()
      .mockResolvedValueOnce([]) // correct workspace search
      .mockResolvedValueOnce([]); // bad workspace search (will throw via workspace resolution)

    mockWorkspaceService.getWorkspacesAsList = vi.fn()
      .mockResolvedValueOnce([testWorkspace()])
      .mockResolvedValueOnce([testWorkspace()]);

    await executeMessage('找一下 tag x 的笔记');

    const assistantMessages = (await getPersistedMessages()).filter(m => m.role === 'assistant');
    expect(assistantMessages.length).toBeGreaterThanOrEqual(1);
    expect(assistantMessages[assistantMessages.length - 1].content).toBe('没有找到相关笔记。');
  }, 30000);

  it('sends the first turn as context in the second model request', async () => {
    const firstResponse = () => portableText('Paris is the capital.', 'context-1');
    const secondResponse = () => portableText('You asked about France.', 'context-2');
    mockExternalAPIService.generatePortableLlm = vi.fn()
      .mockReturnValueOnce(firstResponse())
      .mockReturnValueOnce(secondResponse());

    await executeMessage('What is the capital of France?');
    await executeMessage('Which country did I ask about?');

    expect(mockExternalAPIService.generatePortableLlm).toHaveBeenCalledTimes(2);
    const secondRequest = vi.mocked(mockExternalAPIService.generatePortableLlm).mock.calls[1]?.[0];
    expect(secondRequest?.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: 'What is the capital of France?' }),
      expect.objectContaining({ role: 'assistant', content: 'Paris is the capital.' }),
      expect.objectContaining({ role: 'user', content: 'Which country did I ask about?' }),
    ]));

    const history = secondRequest?.messages.filter(message =>
      typeof message.content === 'string' && [
        'What is the capital of France?',
        'Paris is the capital.',
        'Which country did I ask about?',
      ].includes(message.content)
    );
    expect(history?.map(message => message.content)).toEqual([
      'What is the capital of France?',
      'Paris is the capital.',
      'Which country did I ask about?',
    ]);
  }, 30000);
});
