import { WikiChannel } from '@/constants/channels';
import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { IAgentInstanceService } from '@services/agentInstance/interface';
import { container } from '@services/container';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import type { AgentDefinition, AgentInstance } from 'memeloop';
import { getBuiltinLoopProfiles } from 'memeloop';
import { nanoid } from 'nanoid';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  const defaultAgents = getBuiltinLoopProfiles().map(toAgentDefinition);
  let agentInstanceService: IAgentInstanceService;
  let testAgentInstance: AgentInstance;
  let mockAgentDefinitionService: Partial<IAgentDefinitionService>;
  let mockExternalAPIService: Partial<IExternalAPIService>;
  let mockWikiService: Partial<IWikiService>;
  let mockWorkspaceService: Partial<IWorkspaceService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAgentDefinitionService = container.get(serviceIdentifier.AgentDefinition);
    mockExternalAPIService = container.get(serviceIdentifier.ExternalAPI);
    mockWikiService = container.get(serviceIdentifier.Wiki);
    mockWorkspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);

    agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);

    // Initialize both database repositories and handlers
    await agentInstanceService.initialize();

    // The core loop relies on prompt plugins when fallbackRegistryTools is false.
    // Make sure the wikiOperation tool module is loaded and registered before the turn starts.
    await import('@services/agentInstance/tools/wikiOperation');

    // Provide predictable workspace fixtures so the wikiOperation tool can resolve workspace names.
    mockWorkspaceService.getWorkspacesAsList = vi.fn().mockResolvedValue([
      {
        id: 'default',
        name: 'default',
        wikiFolderLocation: '/path/to/default',
        homeUrl: 'http://localhost:5212/',
        port: 5212,
        isSubWiki: false,
        mainWikiToLink: null,
        tagNames: [],
        lastUrl: null,
        active: true,
        hibernated: false,
        order: 0,
        enableHTTPAPI: false,
        gitUrl: null,
        readOnlyMode: false,
        storageService: 'local',
        syncOnInterval: false,
        syncOnStartup: false,
        tokenAuth: false,
        transparentBackground: false,
        userName: '',
        picturePath: null,
      },
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
        storageService: 'local',
        syncOnInterval: false,
        syncOnStartup: false,
        tokenAuth: false,
        transparentBackground: false,
        userName: '',
        picturePath: null,
      },
    ]);

    // Setup test agent instance using data from taskAgents.json
    const exampleAgent = defaultAgents[0];
    if (!exampleAgent) throw new Error('Missing built-in agent profile');
    testAgentInstance = {
      ...exampleAgent,
      id: nanoid(),
      agentDefId: exampleAgent.id,
      name: 'Test Agent',
      status: {
        state: 'working',
        modified: new Date(),
      },
      created: new Date(),
      closed: false,
      messages: [],
    };

    // Ensure the wiki-operation tool is configured for this agent so
    // MemeLoop's taskAgent will pick it up when the LLM returns tool calls.
    const baseConfig = exampleAgent.agentFrameworkConfig ?? { prompts: [], plugins: [] };
    const agentDefWithWikiPlugin = {
      ...exampleAgent,
      agentFrameworkID: 'agent-tool-loop',
      agentFrameworkConfig: {
        ...baseConfig,
        plugins: [
          ...baseConfig.plugins,
          { toolId: 'wikiOperation' },
        ],
      },
    };

    // Mock agent definition service to return our test agent definition
    mockAgentDefinitionService.getAgentDef = vi.fn().mockResolvedValue(agentDefWithWikiPlugin);
    vi.spyOn(agentInstanceService, 'getAgent').mockResolvedValue(testAgentInstance);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should perform wiki add tiddler via tool calls (default -> error, then wiki -> success)', async () => {
    // Simulate generateFromAI returning a sequence: first assistant suggests default workspace, then after tool error assistant suggests wiki workspace, then tool returns result

    const firstAssistant = {
      role: 'assistant',
      content: '<tool_use name="wiki-operation">{"workspaceName":"default","operation":"wiki-add-tiddler","title":"testNote","text":"test"}</tool_use>',
    };

    const assistantSecond = {
      role: 'assistant',
      // Use an existing workspace name from defaultWorkspaces so plugin can find it
      content: '<tool_use name="wiki-operation">{"workspaceName":"test-wiki-1","operation":"wiki-add-tiddler","title":"test","text":"这是测试内容"}</tool_use>',
    };

    // Mock generateFromAI to yield AIStreamResponse-like objects.
    // MemeLoop's core loop calls generateFromAI once per ReAct round and drains
    // the returned AsyncGenerator. Return a fresh generator for each call.
    let callIndex = 0;
    const responses = [firstAssistant.content, assistantSecond.content];
    mockExternalAPIService.generateFromAI = vi.fn(async function*(_messages, _config, _options) {
      callIndex += 1;
      if (callIndex > responses.length) {
        // Stop generating once the expected sequence is exhausted.
        return;
      }
      yield {
        status: 'done' as const,
        content: responses[callIndex - 1],
        requestId: `r${callIndex}`,
      };
    });

    // Spy on sendMsgToAgent to call the internal flow
    const sendPromise = agentInstanceService.sendMsgToAgent(testAgentInstance.id, { text: '在 wiki 里创建一个新笔记，内容为 test' });

    await sendPromise;

    // The wikiOperation tool should have been called twice: first with the wrong workspace,
    // then with the correct workspace after the tool error triggers a self-correction round.
    expect(mockWikiService.wikiOperationInServer).toHaveBeenCalledTimes(2);
    expect(mockWikiService.wikiOperationInServer).toHaveBeenNthCalledWith(
      2,
      WikiChannel.addTiddler,
      'test-wiki-1',
      ['test', '这是测试内容', '{}', '{"withDate":true}'],
    );
  });
});
