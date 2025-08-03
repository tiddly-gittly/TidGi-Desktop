/**
 * Tests for Wiki Search plugin
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WikiChannel } from '@/constants/channels';
import serviceIdentifier from '@services/serviceIdentifier';

import { AgentPromptDescription } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { cloneDeep } from 'lodash';
import defaultAgents from '../../buildInAgentHandlers/defaultAgents.json';
import { createHandlerHooks, PromptConcatHookContext } from '../index';
import { AIResponseContext } from '../types';
import { wikiSearchPlugin } from '../wikiSearchPlugin';

// Use the real agent config
const exampleAgent = defaultAgents[0];
const handlerConfig = exampleAgent.handlerConfig as AgentPromptDescription['handlerConfig'];

const mockWikiService = {
  wikiOperationInServer: vi.fn(),
};

const mockWorkspaceService = {
  getWorkspacesAsList: vi.fn(),
  exists: vi.fn(),
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
      return {};
    }),
  },
}));

describe('Wiki Search Plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock responses
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
  });

  describe('wikiSearchPlugin - Tool List Injection', () => {
    it('should inject wiki tools into prompts when configured', async () => {
      // Find the wiki search plugin config, make sure our default config
      const wikiPlugin = handlerConfig.plugins.find(p => p.pluginId === 'wikiSearch');
      expect(wikiPlugin).toBeDefined();
      if (!wikiPlugin) {
        // throw error to keep ts believe the plugin exists
        throw new Error('Wiki plugin not found');
      }

      // Verify the plugin has the correct parameter structure
      expect(wikiPlugin.wikiSearchParam).toBeDefined();
      expect(wikiPlugin.wikiSearchParam?.toolListPosition).toBeDefined();

      // Create a copy of prompts to test modification
      const prompts = cloneDeep(handlerConfig.prompts);
      const messages = [
        {
          id: 'user-1',
          role: 'user' as const,
          content: '帮我在我的wiki中搜索信息',
          agentId: 'test-agent',
          contentType: 'text/plain',
          modified: new Date(),
        },
      ];

      const context: PromptConcatHookContext = {
        handlerContext: {
          agent: { id: 'test', messages: [], agentDefId: 'test', status: { state: 'working', modified: new Date() }, created: new Date() },
          agentDef: { id: 'test', name: 'test' },
          isCancelled: () => false,
        },
        pluginConfig: wikiPlugin,
        prompts,
        messages,
      };

      // Use real hooks from the plugin system
      const promptHooks = createHandlerHooks();
      wikiSearchPlugin(promptHooks);

      // Execute the processPrompts hook
      await promptHooks.processPrompts.promise(context);

      // Debug: Print the results
      console.log('Final prompts:', JSON.stringify(prompts, null, 2));

      // Verify that tool information was injected into the prompts
      const promptTexts = JSON.stringify(prompts);
      expect(promptTexts).toContain('Test Wiki 1');
      expect(promptTexts).toContain('Test Wiki 2');
      expect(promptTexts).toContain('wiki-search');
      expect(promptTexts).toContain('workspaceName');
      expect(promptTexts).toContain('filter');
    });

    it('should skip injection when trigger condition is not met', async () => {
      // Create a plugin config with trigger that won't match
      const wikiPlugin = {
        id: 'test-wiki-plugin',
        pluginId: 'wikiSearch' as const,
        forbidOverrides: false,
        retrievalAugmentedGenerationParam: {
          sourceType: 'wiki' as const,
          trigger: {
            search: 'specific-search-term-not-in-message',
          },
          toolListPosition: {
            position: 'after' as const,
            targetId: 'default-before-tool',
          },
        },
      };

      const prompts = cloneDeep(defaultAgents[0].handlerConfig.prompts);
      const originalPromptsText = JSON.stringify(prompts);

      const context: PromptConcatHookContext = {
        pluginConfig: wikiPlugin,
        prompts,
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: 'Hello, how are you?',
            agentId: 'test-agent',
            contentType: 'text/plain',
            modified: new Date(),
          },
        ],
      };

      const hooks = {
        processPrompts: {
          tapAsync: (name: string, callback: (ctx: PromptConcatHookContext, cb: () => void) => Promise<void>) => {
            if (name === 'wikiSearchPlugin-toolList') {
              return callback(context, () => {});
            }
            return Promise.resolve();
          },
        },
        responseComplete: {
          tapAsync: () => Promise.resolve(),
        },
      };

      wikiSearchPlugin(hooks as unknown as Parameters<typeof wikiSearchPlugin>[0]);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Prompts should not be modified since trigger condition wasn't met
      const modifiedPromptsText = JSON.stringify(prompts);
      expect(modifiedPromptsText).toBe(originalPromptsText);
    });
  });

  describe('wikiSearchHandlerPlugin - Tool Execution', () => {
    it('should execute wiki search and set up next round when tool call is detected', async () => {
      // Mock wiki search results
      mockWikiService.wikiOperationInServer.mockImplementation(
        (channel: WikiChannel, _workspaceId: string, args: string[]) => {
          if (channel === WikiChannel.runFilter) {
            return Promise.resolve(['Index']);
          }
          if (channel === WikiChannel.getTiddlersAsJson) {
            const title = args[0];
            return Promise.resolve([
              {
                title,
                text: `这是 ${title} 条目的内容。这是一个TiddlyWiki的索引条目，点击右上角的笔形图标可以开始编辑这个条目。`,
                tags: ['$:/tags/Index'],
              },
            ]);
          }
          return Promise.resolve([]);
        },
      );

      const handlerContext: AIResponseContext['handlerContext'] = {
        agent: {
          id: 'test-agent',
          agentDefId: 'test-agent-def',
          status: {
            state: 'working',
            modified: new Date(),
          },
          created: new Date(),
          messages: [],
        },
        agentDef: { id: 'test-agent-def', name: 'Test Agent' },
        isCancelled: () => false,
      };

      // Create a response that contains a valid tool call
      const response: AIResponseContext['response'] = {
        status: 'done',
        content: '<tool_use name="wiki-search">{"workspaceName": "Test Wiki 1", "filter": "[title[Index]]"}</tool_use>',
        requestId: 'test-request-123',
      };

      const context: AIResponseContext = {
        handlerContext,
        response,
        requestId: 'test-request',
        isFinal: true,
        actions: {},
      };

      // Use real handler hooks
      const hooks = createHandlerHooks();

      // Register the plugin
      wikiSearchPlugin(hooks);

      // Execute the response complete hook
      await hooks.responseComplete.promise(context);

      // Verify that the search was executed and results were set up for next round
      expect(context.actions?.yieldNextRoundTo).toBe('self');

      // Verify tool result message was added to agent history
      expect(context.handlerContext.agent.messages.length).toBeGreaterThan(0);
      const toolResultMessage = context.handlerContext.agent.messages[context.handlerContext.agent.messages.length - 1];
      expect(toolResultMessage.role).toBe('user');
      expect(toolResultMessage.content).toContain('<functions_result>');
      expect(toolResultMessage.content).toContain('Tool: wiki-search');
      expect(toolResultMessage.content).toContain('Index');
      expect(toolResultMessage.metadata?.isToolResult).toBe(true);
    });

    it('should handle wiki search errors gracefully', async () => {
      const handlerContext2: AIResponseContext['handlerContext'] = {
        agent: {
          id: 'test-agent',
          agentDefId: 'test-agent-def',
          status: {
            state: 'working',
            modified: new Date(),
          },
          created: new Date(),
          messages: [],
        },
        agentDef: { id: 'test-agent-def', name: 'Test Agent' },
        isCancelled: () => false,
      };

      // Tool call with nonexistent workspace
      const response2: AIResponseContext['response'] = {
        status: 'done',
        content: '<tool_use name="wiki-search">{"workspaceName": "不存在的Wiki", "filter": "[tag[test]]"}</tool_use>',
        requestId: 'test-request-234',
      };

      const context2: AIResponseContext = {
        handlerContext: handlerContext2,
        response: response2,
        requestId: 'test-request',
        isFinal: true,
        actions: {},
      };

      const hooks = createHandlerHooks();
      wikiSearchPlugin(hooks);

      await hooks.responseComplete.promise(context2);

      // Should still set up next round with error message
      expect(context2.actions?.yieldNextRoundTo).toBe('self');

      // Verify error message was added to agent history
      expect(context2.handlerContext.agent.messages.length).toBeGreaterThan(0);
      const errorResultMessage = context2.handlerContext.agent.messages[context2.handlerContext.agent.messages.length - 1];
      expect(errorResultMessage.role).toBe('user');
      expect(errorResultMessage.content).toContain('<functions_result>');
      expect(errorResultMessage.content).toContain('Error:');
      expect(errorResultMessage.content).toContain('does not exist');
      expect(errorResultMessage.metadata?.isToolResult).toBe(true);
      expect(errorResultMessage.metadata?.isError).toBe(true);
    });

    it('should skip execution when no tool call is detected', async () => {
      const context3: AIResponseContext = {
        handlerContext: {
          agent: {
            id: 'test-agent',
            agentDefId: 'test-agent-def',
            status: {
              state: 'working',
              modified: new Date(),
            },
            created: new Date(),
            messages: [],
          },
          agentDef: { id: 'test-agent-def', name: 'Test Agent' },
          isCancelled: () => false,
        },
        response: {
          status: 'done',
          content: 'Just a regular response without any tool calls',
          requestId: 'test-request-345',
        },
        requestId: 'test-request',
        isFinal: true,
      };

      const hooks = createHandlerHooks();
      wikiSearchPlugin(hooks);

      await hooks.responseComplete.promise(context3);

      // Context should not be modified
      expect(context3.actions).toBeUndefined();
    });
  });
});
