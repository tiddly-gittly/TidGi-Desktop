import { WikiChannel } from '@/constants/channels';
import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { AgentInstance, IAgentInstanceService } from '@services/agentInstance/interface';
import { container } from '@services/container';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import { nanoid } from 'nanoid';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import defaultAgents from '../buildInAgentHandlers/defaultAgents.json';

// Follow structure of index.streaming.test.ts
describe('AgentInstanceService Wiki Operation', () => {
  let agentInstanceService: IAgentInstanceService;
  let testAgentInstance: AgentInstance;
  let mockAgentDefinitionService: Partial<IAgentDefinitionService>;
  let mockExternalAPIService: Partial<IExternalAPIService>;
  let mockWikiService: Partial<IWikiService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAgentDefinitionService = container.get(serviceIdentifier.AgentDefinition);
    mockExternalAPIService = container.get(serviceIdentifier.ExternalAPI);
    mockWikiService = container.get(serviceIdentifier.Wiki);

    agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);

    // Initialize both database repositories and handlers
    await agentInstanceService.initializeHandlers();

    // Setup test agent instance using data from defaultAgents.json
    const exampleAgent = defaultAgents[0];
    testAgentInstance = {
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

    // Mock agent definition service to return our test agent definition
    mockAgentDefinitionService.getAgentDef = vi.fn().mockResolvedValue(exampleAgent);
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

    // Mock generateFromAI to yield AIStreamResponse-like objects (status + content)
    const mockAIResponseGenerator = function*() {
      // First round: assistant suggests default workspace (will cause plugin to post an error and request another round)
      yield {
        status: 'done' as const,
        content: firstAssistant.content,
        requestId: 'r1',
      } as unknown;

      // Second round: assistant suggests the correct workspace that exists in fixtures
      yield {
        status: 'done' as const,
        content: assistantSecond.content,
        requestId: 'r2',
      } as unknown;
    };

    mockExternalAPIService.generateFromAI = vi.fn().mockReturnValue(mockAIResponseGenerator());

    // Spy on sendMsgToAgent to call the internal flow
    const sendPromise = agentInstanceService.sendMsgToAgent(testAgentInstance.id, { text: '在 wiki 里创建一个新笔记，内容为 test' });

    await sendPromise;

    // Expect wikiOperationInServer to have been called with exact parameters
    expect(mockWikiService.wikiOperationInServer).toHaveBeenCalledWith(
      WikiChannel.addTiddler,
      'test-wiki-1',
      ['test', '这是测试内容', '{}', '{}'],
    );
  });
});
