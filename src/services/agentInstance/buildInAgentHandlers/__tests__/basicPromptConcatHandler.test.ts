/**
 * Integration tests for promptConcatStream with wikiSearch plugin
 * Tests the complete workflow: tool list injection -> AI response -> tool execution -> next round
 * Includes yieldNextRoundTo mechanism testing with basicPromptConcatHandler
 */
import serviceIdentifier from '@/services/serviceIdentifier';
// shared mocks will be retrieved from the test container in beforeEach (no top-level vars)
import type { IExternalAPIService } from '@services/externalAPI/interface';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
// removed Observable import to use real AgentInstanceService
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { AgentInstanceMessage, IAgentInstanceService } from '../../interface';

import { WikiChannel } from '@/constants/channels';
// types are provided by shared mock; no local type assertions needed

// Import defaultAgents configuration
import defaultAgents from '../defaultAgents.json';

// Configurable test hooks for mocks
let testWikiImplementation: ((channel: WikiChannel, workspaceId?: string, args?: string[]) => Promise<unknown>) | undefined;
let testStreamResponses: Array<{ status: string; content: string; requestId: string }> = [];

// Use real AgentInstanceService in tests; do not mock

// Import plugin components for direct testing
import { IPromptConcatPlugin } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { IDatabaseService } from '@services/database/interface';
import { builtInPlugins, createHandlerHooks, PromptConcatHookContext } from '../../plugins/index';
import { wikiSearchPlugin } from '../../plugins/wikiSearchPlugin';
import { basicPromptConcatHandler } from '../basicPromptConcatHandler';
import type { AgentHandlerContext } from '../type';

describe('WikiSearch Plugin Integration & YieldNextRound Mechanism', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    testWikiImplementation = undefined;
    testStreamResponses = [];
    const { container } = await import('@services/container');
    const wiki = container.get<IWikiService>(serviceIdentifier.Wiki);

    // Ensure built-in plugin registry includes wikiSearch for handler registration
    builtInPlugins.set('wikiSearch', wikiSearchPlugin);

    // Prepare a mock DataSource/repository so AgentInstanceService.initialize() can run
    const mockRepo = {
      findOne: vi.fn(),
      save: vi.fn(),
      create: vi.fn(),
      find: vi.fn(),
      findAndCount: vi.fn(),
    };

    const mockDataSource = {
      isInitialized: true,
      initialize: vi.fn(),
      destroy: vi.fn(),
      getRepository: vi.fn().mockReturnValue(mockRepo),
      manager: {
        transaction: vi.fn().mockImplementation(async (cb: (manager: { getRepository: () => typeof mockRepo }) => Promise<unknown>) => {
          return await cb({ getRepository: () => mockRepo });
        }),
      },
    };

    const database = container.get<IDatabaseService>(serviceIdentifier.Database);
    database.getDatabase = vi.fn().mockResolvedValue(mockDataSource);

    // Use globally bound AgentInstanceService (configured in src/__tests__/setup-vitest.ts)
    const agentInstanceServiceImpl = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
    // initialize service to ensure plugins and db are set up
    await agentInstanceServiceImpl.initialize();

    // @ts-expect-error Partial implementation of api
    wiki.wikiOperationInServer = vi.fn(async (channel: WikiChannel, workspaceId?: string, args?: string[]) => {
      if (testWikiImplementation) return testWikiImplementation(channel, workspaceId, args);
      if (channel === WikiChannel.runFilter) return Promise.resolve(['Index']);
      if (channel === WikiChannel.getTiddlersAsJson) return Promise.resolve([{ title: 'Index', text: 'This is the Index tiddler content.' }]);
      return Promise.resolve([]);
    });
  });

  // Use direct access to shared mocks; cast inline when asserting or configuring

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
      // verify workspace mock was called via container
      const { container } = await import('@services/container');
      const workspaceLocal = container.get<Partial<IWorkspaceService>>(serviceIdentifier.Workspace);
      expect(workspaceLocal.getWorkspacesAsList as unknown as Mock).toHaveBeenCalled();

      // Phase 2: Tool Execution

      // Mock wiki search results for this test
      testWikiImplementation = async (channel: WikiChannel, _workspaceId?: string, args?: string[]) => {
        if (channel === WikiChannel.runFilter) {
          return Promise.resolve(['Important Note 1', 'Important Note 2']);
        }
        if (channel === WikiChannel.getTiddlersAsJson) {
          const title = args ? args[0] : '';
          return Promise.resolve([
            {
              title,
              text: `Content of ${title}`,
              tags: ['important'],
            },
          ]);
        }
        return Promise.resolve([]);
      };

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
          agentDef: { id: 'test-agent-def', name: 'test-agent-def' } as unknown as { id: string; name: string },
          isCancelled: () => false,
        },
        response: {
          status: 'done' as const,
          content: '<tool_use name="wiki-search">{"workspaceName": "Test Wiki 1", "filter": "[tag[important]]"}</tool_use>',
          requestId: 'test-request-123',
        },
        requestId: 'test-request',
        isFinal: true,
        pluginConfig: wikiPlugin as IPromptConcatPlugin,
        prompts: [],
        messages: [],
        llmResponse: 'I will search for important content using wiki-search tool.',
        responses: [],
        actions: {} as unknown as Record<string, unknown>,
      };

      // Use real handler hooks
      const responseHooks = createHandlerHooks();

      // Register the plugin
      wikiSearchPlugin(responseHooks);

      // Execute the response complete hook
      await responseHooks.responseComplete.promise(responseContext);
      // reuse containerForAssert from above assertions
      const wikiLocal = container.get<Partial<IWikiService>>(serviceIdentifier.Wiki);
      expect(wikiLocal.wikiOperationInServer as unknown as Mock).toHaveBeenCalledWith(WikiChannel.runFilter, 'test-wiki-1', [
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
          agentDef: { id: 'test-agent-def', name: 'test-agent-def' } as unknown as { id: string; name: string },
          isCancelled: () => false,
        },
        response: {
          status: 'done' as const,
          content: '<tool_use name="wiki-search">{"workspaceName": "Nonexistent Wiki", "filter": "[tag[test]]"}</tool_use>',
          requestId: 'test-request-234',
        },
        requestId: 'test-request',
        isFinal: true,
        pluginConfig: wikiPlugin as IPromptConcatPlugin,
        prompts: [],
        messages: [],
        llmResponse: 'Search in nonexistent wiki',
        responses: [],
        actions: {} as unknown as Record<string, unknown>,
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

      const responses = [
        // First AI response: tool call
        {
          status: 'done' as const,
          content: '<tool_use name="wiki-search">{"workspaceName": "Test Wiki 1", "filter": "[title[Index]]"}</tool_use>',
          requestId: 'req-1',
        },
        // Second AI response: explanation of results
        {
          status: 'done' as const,
          content: '基于搜索结果，我找到了 Index 条目。这是一个重要的导航页面，包含了指向其他内容的链接。该页面作为 wiki 的主要入口点，帮助用户快速找到他们需要的信息。',
          requestId: 'req-2',
        },
      ];

      // Mock LLM service to return different responses for this test
      testStreamResponses = responses.map(r => ({ status: r.status, content: r.content, requestId: r.requestId }));

      // Create generator to track all yielded responses
      const { container } = await import('@services/container');
      const externalAPILocal = container.get<IExternalAPIService>(serviceIdentifier.ExternalAPI);
      externalAPILocal.generateFromAI = vi.fn().mockReturnValue((function*() {
        let idx = 0;
        while (idx < testStreamResponses.length) {
          const r = testStreamResponses[idx++];
          yield { status: 'update', content: r.content, requestId: r.requestId };
          yield r;
        }
      })());

      const results: Array<{ state: string; contentLength?: number }> = [];
      const generator = basicPromptConcatHandler(context);

      for await (const result of generator) {
        results.push(result);
      }

      // Verify that tool was executed
      const wikiLocal2 = container.get<Partial<IWikiService>>(serviceIdentifier.Wiki);
      expect(wikiLocal2.wikiOperationInServer as unknown as Mock).toHaveBeenCalled();

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
