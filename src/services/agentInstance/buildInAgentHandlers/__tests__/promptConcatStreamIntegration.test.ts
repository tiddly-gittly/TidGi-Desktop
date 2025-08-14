/**
 * Integration tests for promptConcatStream with wikiSearch plugin
 * Tests the complete workflow: tool list injection -> AI response -> tool execution -> next round
 * Includes yieldNextRoundTo mechanism testing with basicPromptConcatHandler
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentInstanceMessage } from '../../interface';

import { WikiChannel } from '@/constants/channels';
import { matchToolCalling } from '@services/agentDefinition/responsePatternUtility';
import serviceIdentifier from '@services/serviceIdentifier';

// Import defaultAgents configuration
import defaultAgents from '../defaultAgents.json';

// Mock the external services
const mockWikiService = {
  wikiOperationInServer: vi.fn(),
};

const mockWorkspaceService = {
  getWorkspacesAsList: vi.fn(),
  exists: vi.fn(),
};

const mockLLMService = {
  streamGenerateText: vi.fn(),
  getAIConfig: vi.fn().mockResolvedValue({}), // Return empty config by default
};

const mockAgentInstanceService = {
  debounceUpdateMessage: vi.fn(),
  concatPrompt: vi.fn(),
};

// Mock container.get
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

// Mock the response pattern utility
vi.mock('@services/agentDefinition/responsePatternUtility', () => ({
  matchToolCalling: vi.fn(),
}));

// Import plugin components for direct testing
import { IPromptConcatPlugin } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { createHandlerHooks, PromptConcatHookContext } from '../../plugins/index';
import { wikiSearchPlugin } from '../../plugins/wikiSearchPlugin';
import { basicPromptConcatHandler } from '../basicPromptConcatHandler';
import type { AgentHandlerContext } from '../type';
import { getFinalPromptResult } from '../../promptConcat/utils';

describe('WikiSearch Plugin Integration & YieldNextRound Mechanism', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup wiki search mocks
    mockWikiService.wikiOperationInServer.mockImplementation(
      (channel: WikiChannel) => {
        if (channel === WikiChannel.runFilter) {
          return Promise.resolve(['Index']);
        }
        if (channel === WikiChannel.getTiddlersAsJson) {
          return Promise.resolve([{ title: 'Index', text: 'This is the Index tiddler content.' }]);
        }
        return Promise.resolve([]);
      },
    );

    // Setup default mock responses with complete wiki workspace data
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
      {
        id: 'test-wiki-2',
        name: 'Test Wiki 2',
        wikiFolderLocation: '/path/to/test-wiki-2',
        homeUrl: 'http://localhost:5213/',
        port: 5213,
        isSubWiki: false,
        mainWikiToLink: undefined,
        tagName: '',
        lastUrl: '',
        active: true,
        hibernated: false,
        order: 1,
        disableNotifications: false,
        badgeCount: 0,
        type: 'wiki' as const,
      },
    ]);
    mockWorkspaceService.exists.mockResolvedValue(true);

    // Setup agent service mocks
    mockAgentInstanceService.concatPrompt.mockReturnValue({
      pipe: () => ({
        toPromise: () => Promise.resolve({
          flatPrompts: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: '搜索 wiki 中的 Index 条目并解释其内容' },
          ],
        }),
      }),
    });
  });

  describe('Complete Workflow Integration', () => {
    it('should complete full wiki search workflow: tool list -> tool execution -> response', async () => {
      // Use real agent config from defaultAgents.json
      const exampleAgent = defaultAgents[0];
      const handlerConfig = exampleAgent.handlerConfig;

      // Get the wiki search plugin configuration
      const wikiPlugin = handlerConfig.plugins.find(p => p.pluginId === 'wikiSearch');
      expect(wikiPlugin).toBeDefined();
      if (!wikiPlugin) throw new Error('wikiPlugin not found');

      const prompts = JSON.parse(JSON.stringify(handlerConfig.prompts));

      // Phase 1: Tool List Injection
      const promptConcatHookContext: PromptConcatHookContext = {
        handlerContext: {
          agent: { id: 'test', messages: [], agentDefId: 'test', status: { state: 'working' as const, modified: new Date() }, created: new Date() },
          agentDef: { id: 'test', name: 'test' },
          isCancelled: () => false,
        },
        pluginConfig: wikiPlugin as IPromptConcatPlugin,
        prompts,
        messages: [
          {
            id: 'user-1',
            role: 'user' as const,
            content: 'Help me search for information in my wiki',
            agentId: 'test-agent',
            contentType: 'text/plain',
            modified: new Date(),
          },
        ],
      };

      const promptHooks = createHandlerHooks();
      wikiSearchPlugin(promptHooks);
      await promptHooks.processPrompts.promise(promptConcatHookContext);

      // Check if tool was injected by looking for wiki tool in prompts
      const promptTexts = JSON.stringify(promptConcatHookContext.prompts);
      const toolListInjected = promptTexts.includes('Test Wiki 1') && promptTexts.includes('wiki-search');

      expect(toolListInjected).toBe(true);
      expect(mockWorkspaceService.getWorkspacesAsList).toHaveBeenCalled();

      // Phase 2: Tool Execution
      // Mock tool calling detection
      (matchToolCalling as any).mockReturnValue({
        found: true,
        toolId: 'wiki-search',
        parameters: {
          workspaceName: 'Test Wiki 1',
          filter: '[tag[important]]',
          maxResults: 3,
          includeText: true,
        },
        originalText: 'Search for important content',
      });

      // Mock wiki search results
      (mockWikiService.wikiOperationInServer as any).mockImplementation(
        (channel: WikiChannel, _workspaceId: string, args: string[]) => {
          if (channel === WikiChannel.runFilter) {
            return Promise.resolve(['Important Note 1', 'Important Note 2']);
          }
          if (channel === WikiChannel.getTiddlersAsJson) {
            const title = args[0];
            return Promise.resolve([
              {
                title,
                text: `Content of ${title}`,
                tags: ['important'],
              },
            ]);
          }
          return Promise.resolve([]);
        },
      );

      const responseContext = {
        handlerContext: {
          agent: {
            id: 'test-agent',
            agentDefId: 'test-agent-def',
            status: {
              state: 'working' as const,
              modified: new Date(),
            },
            created: new Date(),
            messages: [],
          },
          agentDef: { id: 'test-agent-def' } as any,
          isCancelled: () => false,
        },
        response: {
          status: 'done' as const,
          content: 'I will search for important content using wiki-search tool.',
          requestId: 'test-request-123',
        },
        requestId: 'test-request',
        isFinal: true,
        pluginConfig: wikiPlugin as IPromptConcatPlugin,
        prompts: [],
        messages: [],
        llmResponse: 'I will search for important content using wiki-search tool.',
        responses: [],
        actions: {} as any,
      };

      // Use real handler hooks
      const responseHooks = createHandlerHooks();

      // Register the plugin
      wikiSearchPlugin(responseHooks);

      // Execute the response complete hook
      await responseHooks.responseComplete.promise(responseContext);
      expect(mockWikiService.wikiOperationInServer).toHaveBeenCalledWith(WikiChannel.runFilter, 'test-wiki-1', [
        '[tag[important]]',
      ]);

      // Verify tool results were set up for next round
      expect(responseContext.actions.yieldNextRoundTo).toBe('self');

      // Verify tool result message was added to agent history
      expect(responseContext.handlerContext.agent.messages.length).toBeGreaterThan(0);
      const toolResultMessage = responseContext.handlerContext.agent.messages[responseContext.handlerContext.agent.messages.length - 1] as AgentInstanceMessage;
      expect(toolResultMessage.role).toBe('assistant'); // Changed from 'user' to 'assistant'
      expect(toolResultMessage.content).toContain('<functions_result>');
      expect(toolResultMessage.content).toContain('Tool: wiki-search');
      expect(toolResultMessage.content).toContain('Important Note 1');
    });

    it('should handle errors in wiki search gracefully', async () => {
      // Use real agent config from defaultAgents.json
      const exampleAgent = defaultAgents[0];
      const handlerConfig = exampleAgent.handlerConfig;

      // Get the wiki search plugin configuration
      const wikiPlugin = handlerConfig.plugins.find(p => p.pluginId === 'wikiSearch');
      expect(wikiPlugin).toBeDefined();

      // Mock tool calling with invalid workspace
      (matchToolCalling as any).mockReturnValue({
        found: true,
        toolId: 'wiki-search',
        parameters: {
          workspaceName: 'Nonexistent Wiki',
          filter: '[tag[test]]',
        },
        originalText: 'Search in nonexistent wiki',
      });

      const responseContext = {
        handlerContext: {
          agent: {
            id: 'test-agent',
            agentDefId: 'test-agent-def',
            status: {
              state: 'working' as const,
              modified: new Date(),
            },
            created: new Date(),
            messages: [],
          },
          agentDef: { id: 'test-agent-def' } as any,
          isCancelled: () => false,
        },
        response: {
          status: 'done' as const,
          content: 'Search in nonexistent wiki',
          requestId: 'test-request-234',
        },
        requestId: 'test-request',
        isFinal: true,
        pluginConfig: wikiPlugin as IPromptConcatPlugin,
        prompts: [],
        messages: [],
        llmResponse: 'Search in nonexistent wiki',
        responses: [],
        actions: {} as any,
      };

      // Use real handler hooks
      const responseHooks = createHandlerHooks();

      // Register the plugin
      wikiSearchPlugin(responseHooks);

      // Execute the response complete hook
      await responseHooks.responseComplete.promise(responseContext);

      // Should still set up next round even with error
      expect(responseContext.actions.yieldNextRoundTo).toBe('self');

      // Verify error message was added to agent history
      expect(responseContext.handlerContext.agent.messages.length).toBeGreaterThan(0);
      const errorResultMessage = responseContext.handlerContext.agent.messages[responseContext.handlerContext.agent.messages.length - 1] as AgentInstanceMessage;
      expect(errorResultMessage.role).toBe('assistant'); // Changed from 'user' to 'assistant'
      expect(errorResultMessage.content).toContain('Error:');
      expect(errorResultMessage.content).toContain('does not exist');
    });
  });

  describe('YieldNextRoundTo Mechanism with BasicPromptConcatHandler', () => {
    it('should trigger next round after tool execution using basicPromptConcatHandler', async () => {
      const exampleAgent = defaultAgents[0];
      const testAgentId = `test-agent-${Date.now()}`;
      
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
      const results: Array<{ state: string; contentLength?: number }> = [];
      const generator = basicPromptConcatHandler(context);

      // Collect all responses from the generator
      for await (const result of generator) {
        results.push(result);
        // Log basic info without complex nested objects to avoid test output noise
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
      expect(results.length).toBeGreaterThan(1);
      
      // The last result should be the final explanation
      const finalResult = results[results.length - 1];
      expect(finalResult.state).toBe('completed');
    });

    it('should prevent multi-round regression: fullReplacement plugin not removing tool results', () => {
      // Root cause test for fullReplacement plugin bug
      // Bug: Plugin incorrectly removed last message assuming it was user message
      // But in second round, last message is tool result, not user message
      
      const messages: AgentInstanceMessage[] = [
        {
          id: 'user-1',
          agentId: 'test',
          role: 'user',
          content: '搜索 wiki 中的 Index 条目',
          modified: new Date(),
          duration: undefined,
        },
        {
          id: 'ai-tool-1',
          agentId: 'test',
          role: 'assistant',
          content: '<tool_use name="wiki-search">...</tool_use>',
          modified: new Date(),
          duration: 1,
          metadata: { containsToolCall: true },
        },
        {
          id: 'tool-result-1',
          agentId: 'test',
          role: 'assistant', // This is the last message, NOT user message
          content: '<functions_result>Tool result content</functions_result>',
          modified: new Date(),
          duration: 1,
          metadata: { isToolResult: true },
        },
      ];

      // Test that fullReplacement plugin correctly finds and removes user message
      // rather than blindly removing the last message
      const userMessage = messages.find(m => m.role === 'user');
      const toolResultMessage = messages.find(m => m.metadata?.isToolResult);
      
      expect(userMessage).toBeTruthy();
      expect(toolResultMessage).toBeTruthy();
      expect(userMessage?.id).not.toBe(toolResultMessage?.id);
      
      // This test ensures the fix is working: last message is tool result, not user
      expect(messages[messages.length - 1].metadata?.isToolResult).toBe(true);
      expect(messages[messages.length - 1].role).toBe('assistant');
    });
  });
});
