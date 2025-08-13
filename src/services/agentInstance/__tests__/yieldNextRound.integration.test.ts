/**
 * Test to verify yieldNextRoundTo mechanism works correctly
 * This test reproduces the issue where AI doesn't continue after tool result
 */
import { WikiChannel } from '@/constants/channels';
import serviceIdentifier from '@services/serviceIdentifier';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { basicPromptConcatHandler } from '../buildInAgentHandlers/basicPromptConcatHandler';
import defaultAgents from '../buildInAgentHandlers/defaultAgents.json';
import type { AgentHandlerContext } from '../buildInAgentHandlers/type';

// Mock dependencies
const mockWorkspaceService = {
  getWorkspacesAsList: vi.fn(),
  exists: vi.fn(),
};

const mockWikiService = {
  wikiOperationInServer: vi.fn(),
};

const mockLLMService = {
  streamGenerateText: vi.fn(),
  getAIConfig: vi.fn().mockResolvedValue({}), // Return empty config by default
};

const mockAgentInstanceService = {
  debounceUpdateMessage: vi.fn(),
};

vi.mock('@services/container', () => ({
  container: {
    get: vi.fn((identifier: symbol) => {
      if (identifier === serviceIdentifier.Wiki) {
        return mockWikiService;
      }
      if (identifier === serviceIdentifier.Workspace) {
        return mockWorkspaceService;
      }
      if (identifier === serviceIdentifier.ExternalAPI) {
        return mockLLMService;
      }
      if (identifier === serviceIdentifier.AgentInstance) {
        return mockAgentInstanceService;
      }
      return {};
    }),
  },
}));

describe('Wiki Search - yieldNextRoundTo Integration', () => {
  const exampleAgent = defaultAgents[0];
  let testAgentId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    testAgentId = `test-agent-${Date.now()}`;

    // Setup workspace mocks
    mockWorkspaceService.getWorkspacesAsList.mockResolvedValue([
      {
        id: 'test-wiki-1',
        name: 'Test Wiki 1',
        wikiFolderLocation: '/path/to/test-wiki-1',
        homeUrl: 'http://localhost:5212/',
        port: 5212,
        isSubWiki: false,
        mainWikiToLink: undefined,
        tagName: '',
        lastUrl: '',
        active: true,
        hibernated: false,
        order: 0,
        disableNotifications: false,
        badgeCount: 0,
        type: 'wiki' as const,
      },
    ]);
    mockWorkspaceService.exists.mockResolvedValue(true);

    // Setup wiki service mocks for successful search
    mockWikiService.wikiOperationInServer.mockImplementation((channel: WikiChannel, _workspaceId: string, args: string[]) => {
      if (channel === WikiChannel.runFilter) {
        return Promise.resolve(['Index', 'Home']);
      }
      if (channel === WikiChannel.getTiddlersAsJson) {
        const title = args[0];
        return Promise.resolve([
          {
            title,
            text: `Content of ${title}: Important navigation page with links to other content.`,
            tags: ['navigation'],
          },
        ]);
      }
      return Promise.resolve([]);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should trigger next round after tool execution', async () => {
    const context: AgentHandlerContext = {
      agent: {
        id: testAgentId,
        agentDefId: exampleAgent.id,
        status: { state: 'working', modified: new Date() },
        created: new Date(),
        messages: [
          {
            id: 'user-1',
            agentId: testAgentId,
            role: 'user',
            content: '搜索 wiki 中的 Index 条目并解释其内容',
            modified: new Date(),
            duration: undefined,
          },
        ],
      },
      agentDef: {
        id: exampleAgent.id,
        name: exampleAgent.name,
        handlerConfig: exampleAgent.handlerConfig,
      },
      isCancelled: () => false,
    };

    let callCount = 0;
    const responses = [
      // First AI response: tool call
      {
        status: 'done' as const,
        content: '<tool_use name="wiki-search">{"workspaceName": "Test Wiki 1", "filter": "[title[Index]]", "maxResults": 5}</tool_use>',
        requestId: 'req-1',
      },
      // Second AI response: explanation of results
      {
        status: 'done' as const,
        content: '基于搜索结果，我找到了 Index 条目。这是一个重要的导航页面，包含了指向其他内容的链接。该页面作为 wiki 的主要入口点，帮助用户快速找到他们需要的信息。',
        requestId: 'req-2',
      },
    ];

    // Mock LLM service to return different responses
    mockLLMService.streamGenerateText.mockImplementation(async function* () {
      const response = responses[callCount];
      callCount++;
      
      yield {
        status: 'update',
        content: response.content,
        requestId: response.requestId,
      };
      
      yield response;
    });

    // Create generator to track all yielded responses
    const results: any[] = [];
    const generator = basicPromptConcatHandler(context);

    // Collect all responses from the generator
    for await (const result of generator) {
      results.push(result);
      console.log('Generator yielded:', {
        state: result.state,
        contentLength: result.message?.content?.length || 0,
        messageCount: context.agent.messages.length,
        hasToolResult: context.agent.messages.some(m => m.metadata?.isToolResult),
      });
    }

    // Verify that the LLM was called twice (initial + next round)
    expect(mockLLMService.streamGenerateText).toHaveBeenCalledTimes(2);
    
    // Verify that tool was executed
    expect(mockWikiService.wikiOperationInServer).toHaveBeenCalled();
    
    // Verify that tool result message was added
    const toolResultMessage = context.agent.messages.find(m => m.metadata?.isToolResult);
    expect(toolResultMessage).toBeTruthy();
    expect(toolResultMessage?.role).toBe('assistant');
    expect(toolResultMessage?.content).toContain('<functions_result>');
    
    // Verify that there are multiple responses (initial tool call + final explanation)
    expect(results.length).toBeGreaterThan(2);
    
    // The last result should be the final explanation
    const finalResult = results[results.length - 1];
    expect(finalResult.status).toBe('completed');
    expect(finalResult.content).toContain('基于搜索结果');
    expect(finalResult.content).toContain('Index 条目');
    
    console.log('Final message count:', context.agent.messages.length);
    console.log('Messages:', context.agent.messages.map(m => ({
      role: m.role,
      content: m.content.substring(0, 50) + '...',
      isToolResult: m.metadata?.isToolResult,
    })));
  });
});
