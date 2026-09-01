import { WikiChannel } from '@/constants/channels';
import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { IAgentInstanceService } from '@services/agentInstance/interface';
import { container } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { SupportedStorageServices } from '@services/types';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import type { AgentDefinition, AgentRuntimeView } from 'memeloop';
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

// Follow structure of index.streaming.test.ts
describe('AgentInstanceService Wiki Operation', () => {
  let agentInstanceService: IAgentInstanceService;
  let testAgentInstance: AgentRuntimeView;
  let mockAgentDefinitionService: Partial<IAgentDefinitionService>;
  let mockExternalAPIService: Partial<IExternalAPIService>;
  let mockWikiService: Partial<IWikiService>;
  let mockWorkspaceService: Partial<IWorkspaceService>;

  beforeAll(async () => {
    await container.get<IDatabaseService>(serviceIdentifier.Database).initializeForApp();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAgentDefinitionService = container.get(serviceIdentifier.AgentDefinition);
    mockExternalAPIService = container.get(serviceIdentifier.ExternalAPI);
    mockWikiService = container.get(serviceIdentifier.Wiki);
    mockWorkspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);

    agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);

    await mockAgentDefinitionService.initialize?.();
    await agentInstanceService.initialize();

    // The core loop relies on prompt plugins when fallbackRegistryTools is false.
    // Make sure the wikiOperation tool module is loaded and registered before the turn starts.
    await import('@services/agentInstance/tools/wikiOperation');

    // Provide predictable workspace fixtures so the wikiOperation tool can resolve workspace names.
    mockWorkspaceService.getWorkspacesAsList = vi.fn().mockResolvedValue([
      {
        id: 'test-wiki-1',
        name: 'test-wiki-1',
        wikiFolderLocation: '/path/to/test-wiki-1',
        homeUrl: 'http://localhost:5213/',
        port: 5213,
        isSubWiki: false,
        mainWikiToLink: null,
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
      },
    ]);

    const generalProfile = getBuiltinLoopProfiles().find(profile => profile.id === 'memeloop:general-assistant');
    const wikiProfile = getBuiltinLoopProfiles().find(profile => profile.id === 'memeloop:frontend-ui-ux');
    if (!generalProfile || !wikiProfile) throw new Error('Missing built-in Agent profiles');
    const exampleAgent = toAgentDefinition(generalProfile);
    const wikiOperation = wikiProfile.agentTools?.find(tool => tool.toolId === 'wikiOperation');
    if (!wikiOperation) throw new Error('Missing built-in wikiOperation tool configuration');

    const agentDefWithWikiPlugin = {
      ...exampleAgent,
      agentFrameworkID: 'agent-tool-loop',
      tools: [],
      plugins: [],
      agentTools: [wikiOperation],
    };

    mockAgentDefinitionService.getAgentDef = vi.fn().mockResolvedValue(agentDefWithWikiPlugin);
    testAgentInstance = await agentInstanceService.createAgent(agentDefWithWikiPlugin.id, { id: nanoid() });

    mockExternalAPIService.getAIConfig = vi.fn().mockResolvedValue({
      default: { providerId: 'mock', modelId: 'mock-model', parameters: { temperature: 0.7 } },
    });
    mockExternalAPIService.getProviderAccounts = vi.fn().mockResolvedValue([{
      providerId: 'mock',
      providerType: 'openai-compatible',
      enabled: true,
      models: [{ modelId: 'mock-model', wireModelId: 'mock-model', apiMode: 'chat-completions' }],
    }]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('corrects a missing workspace and performs the wiki write only after resolution succeeds', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Simulate two portable model rounds: first a missing workspace, then the corrected workspace.

    const firstAssistant = {
      role: 'assistant',
      content: '<tool_use name="wiki-operation">{"workspaceName":"default","operation":"wiki-add-tiddler","title":"testNote","text":"test"}</tool_use>',
    };

    const assistantSecond = {
      role: 'assistant',
      // Use an existing workspace name from defaultWorkspaces so plugin can find it
      content: '<tool_use name="wiki-operation">{"workspaceName":"test-wiki-1","operation":"wiki-add-tiddler","title":"test","text":"这是测试内容"}</tool_use>',
    };

    // MemeLoop's core loop drains one structured portable stream per ReAct round.
    let callIndex = 0;
    const responses = [firstAssistant.content, assistantSecond.content, '已创建笔记。'];
    mockExternalAPIService.generatePortableLlm = vi.fn(async function*() {
      callIndex += 1;
      if (callIndex > responses.length) {
        return;
      }
      yield {
        type: 'text-delta' as const,
        id: `r${callIndex}`,
        text: responses[callIndex - 1],
      };
      yield { type: 'finish' as const, finishReason: 'stop' };
    });

    await agentInstanceService.executeLocalAgentMessage({
      target: { kind: 'local' },
      provenance: {
        conversationId: testAgentInstance.id,
        definitionId: testAgentInstance.agentDefId,
        requestId: `wiki-operation:request:${nanoid()}`,
        turnId: `wiki-operation:turn:${nanoid()}`,
      },
      message: '在 wiki 里创建一个新笔记，内容为 test',
    });

    // Workspace validation rejects the first tool call before it reaches the Wiki service.
    expect(mockWikiService.wikiOperationInServer).toHaveBeenCalledTimes(1);
    expect(mockWikiService.wikiOperationInServer).toHaveBeenCalledWith(
      WikiChannel.addTiddler,
      'test-wiki-1',
      ['test', '这是测试内容', '{}', '{"withDate":true}'],
    );
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      '[memeloop.defineTool]',
      'Tool execution failed: wiki-operation',
      'Tool.WikiOperation.Error.WorkspaceNotFound',
    );
  });
});
