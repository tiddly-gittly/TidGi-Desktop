/**
 * Integration tests for promptConcatStream with wikiSearch plugin
 * Tests the complete workflow: tool list injection -> AI response -> tool execution -> next round
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

describe('WikiSearch Plugin Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

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
});
