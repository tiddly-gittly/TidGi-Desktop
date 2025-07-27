/**
 * Tests for Wiki Search plugin
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WikiChannel } from '@/constants/channels';
import { matchToolCalling } from '@services/agentDefinition/responsePatternUtility';
import serviceIdentifier from '@services/serviceIdentifier';

import { wikiSearchHandlerPlugin, wikiSearchPlugin } from '../wikiSearchPlugin';

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

describe('Wiki Search Plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock responses
    (mockWorkspaceService.getWorkspacesAsList as any).mockResolvedValue([
      { id: 'test-wiki-1', name: 'Test Wiki 1', type: 'wiki' },
      { id: 'test-wiki-2', name: 'Test Wiki 2', type: 'wiki' },
    ]);
    (mockWorkspaceService.exists as any).mockResolvedValue(true);
  });

  describe('wikiSearchPlugin - Tool List Injection', () => {
    it('should register plugin hooks', () => {
      const hooks = {
        processPrompts: {
          tapAsync: vi.fn(),
        },
      };

      // Execute the plugin
      wikiSearchPlugin(hooks as any);

      // Verify that both tapAsync calls were registered
      expect(hooks.processPrompts.tapAsync).toHaveBeenCalledWith(
        'wikiSearchPlugin-toolList',
        expect.any(Function),
      );
      expect(hooks.processPrompts.tapAsync).toHaveBeenCalledWith(
        'wikiSearchPlugin-content',
        expect.any(Function),
      );
    });
  });

  describe('wikiSearchHandlerPlugin - Tool Execution', () => {
    it('should execute wiki search when tool call is detected in AI response', async () => {
      // Mock tool calling detection
      const mockToolMatch = {
        found: true,
        toolId: 'wiki-search',
        parameters: {
          workspaceName: 'Test Wiki 1',
          filter: '[tag[important]]',
          maxResults: 5,
          includeText: true,
        },
        originalText: 'Let me search for important content',
      };
      (matchToolCalling as any).mockReturnValue(mockToolMatch);

      // Mock wiki search results
      (mockWikiService.wikiOperationInServer as any).mockImplementation(
        (channel: string, _workspaceId: string, args: string[]) => {
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

      const handlerContext = {
        agent: {
          id: 'test-agent',
          messages: [
            {
              id: 'ai-response',
              role: 'assistant',
              content: 'I need to search for important content. Let me use the wiki-search tool.',
              agentId: 'test-agent',
              contentType: 'text/plain',
              modified: new Date(),
            },
          ],
        },
      };

      const response = {
        status: 'done' as const,
        content: 'I need to search for important content. Let me use the wiki-search tool.',
      };

      const context = {
        handlerContext,
        response,
        requestId: 'test-request-1',
        pluginConfig: {
          id: 'test-plugin',
          pluginId: 'wikiSearch' as const,
          forbidOverrides: false,
        },
        prompts: [],
        messages: [],
        llmResponse: response.content,
        responses: [],
        actions: {} as any,
      };

      let callbackExecuted = false;
      const mockCallback = vi.fn(() => {
        callbackExecuted = true;
      });

      const hooks = {
        responseComplete: {
          tapAsync: vi.fn((name: string, callback: (ctx: any, cb: () => void) => Promise<void>) => {
            if (name === 'wikiSearchHandlerPlugin') {
              callback(context, mockCallback);
            }
          }),
        },
        toolExecuted: {
          callAsync: vi.fn((data: any, callback: (error: Error | null) => void) => {
            callback(null);
          }),
        },
      };

      // Execute the handler plugin
      wikiSearchHandlerPlugin(hooks as any);

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify tool calling was detected
      expect(matchToolCalling).toHaveBeenCalledWith(response.content);

      // Verify wiki services were called
      expect(mockWorkspaceService.getWorkspacesAsList).toHaveBeenCalled();
      expect(mockWikiService.wikiOperationInServer).toHaveBeenCalledWith(WikiChannel.runFilter, 'test-wiki-1', [
        '[tag[important]]',
      ]);

      // Verify that yieldNextRoundTo was set for continuing the conversation
      expect(context.actions?.yieldNextRoundTo).toBe('self');
      expect(context.actions?.newUserMessage).toContain('<functions_result>');
      expect(context.actions?.newUserMessage).toContain('Tool: wiki-search');

      expect(callbackExecuted).toBe(true);
    });

    it('should skip execution when no wiki-search tool call is found', async () => {
      // Mock tool calling detection with no match
      const mockToolMatch = {
        found: false,
        toolId: '',
        parameters: {},
        originalText: '',
      };
      (matchToolCalling as any).mockReturnValue(mockToolMatch);

      const context = {
        handlerContext: {
          agent: { id: 'test-agent', messages: [] },
        },
        response: {
          status: 'done' as const,
          content: 'Just a regular response without tool calls',
        },
        requestId: 'test-request-3',
        pluginConfig: {
          id: 'test-plugin',
          pluginId: 'wikiSearch' as const,
          forbidOverrides: false,
        },
        prompts: [],
        messages: [],
        llmResponse: 'Just a regular response without tool calls',
        responses: [],
      };

      let callbackExecuted = false;
      const mockCallback = vi.fn(() => {
        callbackExecuted = true;
      });

      const hooks = {
        responseComplete: {
          tapAsync: vi.fn((name: string, callback: (ctx: any, cb: () => void) => Promise<void>) => {
            if (name === 'wikiSearchHandlerPlugin') {
              callback(context, mockCallback);
            }
          }),
        },
        toolExecuted: {
          callAsync: vi.fn(),
        },
      };

      // Execute the handler plugin
      wikiSearchHandlerPlugin(hooks as any);

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should not execute any wiki operations
      expect(mockWorkspaceService.getWorkspacesAsList).not.toHaveBeenCalled();
      expect(mockWikiService.wikiOperationInServer).not.toHaveBeenCalled();

      // Should not set up next round
      expect((context as any).actions).toBeUndefined();

      expect(callbackExecuted).toBe(true);
    });
  });
});
