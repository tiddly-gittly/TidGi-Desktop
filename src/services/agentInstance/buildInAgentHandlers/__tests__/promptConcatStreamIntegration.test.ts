/**
 * Integration tests for promptConcatStream with wikiSearch plugin
 * Tests the complete workflow: tool list injection -> AI response -> tool execution -> next round
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WikiChannel } from '@/constants/channels';
import { matchToolCalling } from '@services/agentDefinition/responsePatternUtility';
import serviceIdentifier from '@services/serviceIdentifier';

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
import { wikiSearchHandlerPlugin, wikiSearchPlugin } from '../../plugins/wikiSearchPlugin';

describe('WikiSearch Plugin Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock responses
    (mockWorkspaceService.getWorkspacesAsList as any).mockResolvedValue([
      { id: 'test-wiki-1', name: 'Test Wiki 1', type: 'wiki' },
      { id: 'test-wiki-2', name: 'Test Wiki 2', type: 'wiki' },
    ]);
    (mockWorkspaceService.exists as any).mockResolvedValue(true);
  });

  describe('Complete Workflow Integration', () => {
    it('should complete full wiki search workflow: tool list -> tool execution -> response', async () => {
      // Test data
      const prompts = [
        {
          id: 'system-prompt',
          text: 'You are a helpful assistant.',
          caption: 'System prompt',
          enabled: true,
        },
        {
          id: 'tools-section',
          text: 'Available tools:',
          caption: 'Tools section',
          enabled: true,
        },
      ];

      const pluginConfig = {
        id: 'wiki-search-plugin',
        pluginId: 'wikiSearch' as const,
        forbidOverrides: false,
        retrievalAugmentedGenerationParam: {
          position: 'after' as const,
          targetId: 'system-prompt',
          sourceType: 'wiki' as const,
          toolListPosition: {
            targetId: 'tools-section',
            position: 'after' as const,
          },
        },
      };

      // Phase 1: Tool List Injection
      const promptContext = {
        pluginConfig,
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

      let toolListInjected = false;
      const promptHooks = {
        processPrompts: {
          tapAsync: vi.fn(async (name: string, callback: (ctx: any, cb: () => void) => Promise<void>) => {
            if (name === 'wikiSearchPlugin-toolList') {
              await callback(promptContext, () => {
                toolListInjected = true;
              });
            }
          }),
        },
      };

      // Execute tool list injection
      wikiSearchPlugin(promptHooks as any);
      await new Promise((resolve) => setTimeout(resolve, 50));

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

      const responseContext = {
        handlerContext: {
          agent: {
            id: 'test-agent',
            messages: [],
          },
        },
        response: {
          status: 'done' as const,
          content: 'I will search for important content using wiki-search tool.',
        },
        requestId: 'test-request',
        pluginConfig: {
          id: 'test-plugin',
          pluginId: 'wikiSearch' as const,
          forbidOverrides: false,
        },
        prompts: [],
        messages: [],
        llmResponse: 'I will search for important content using wiki-search tool.',
        responses: [],
        actions: {} as any,
      };

      let toolExecuted = false;
      const responseHooks = {
        responseComplete: {
          tapAsync: vi.fn(async (name: string, callback: (ctx: any, cb: () => void) => Promise<void>) => {
            if (name === 'wikiSearchHandlerPlugin') {
              await callback(responseContext, () => {
                toolExecuted = true;
              });
            }
          }),
        },
        toolExecuted: {
          callAsync: vi.fn((data: any, callback: (error: Error | null) => void) => {
            callback(null);
          }),
        },
      };

      // Execute tool execution
      wikiSearchHandlerPlugin(responseHooks as any);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(toolExecuted).toBe(true);
      expect(mockWikiService.wikiOperationInServer).toHaveBeenCalledWith(WikiChannel.runFilter, 'test-wiki-1', [
        '[tag[important]]',
      ]);

      // Verify tool results were set up for next round
      expect(responseContext.actions.yieldNextRoundTo).toBe('self');
      expect(responseContext.actions.newUserMessage).toContain('<functions_result>');
      expect(responseContext.actions.newUserMessage).toContain('Tool: wiki-search');
      expect(responseContext.actions.newUserMessage).toContain('Important Note 1');
      expect(responseContext.actions.newUserMessage).toContain('Important Note 2');
    });

    it('should handle errors in wiki search gracefully', async () => {
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
            messages: [],
          },
        },
        response: {
          status: 'done' as const,
          content: 'Search in nonexistent wiki',
        },
        requestId: 'test-request',
        pluginConfig: {
          id: 'test-plugin',
          pluginId: 'wikiSearch' as const,
          forbidOverrides: false,
        },
        prompts: [],
        messages: [],
        llmResponse: 'Search in nonexistent wiki',
        responses: [],
        actions: {} as any,
      };

      let errorHandled = false;
      const responseHooks = {
        responseComplete: {
          tapAsync: vi.fn(async (name: string, callback: (ctx: any, cb: () => void) => Promise<void>) => {
            if (name === 'wikiSearchHandlerPlugin') {
              await callback(responseContext, () => {
                errorHandled = true;
              });
            }
          }),
        },
        toolExecuted: {
          callAsync: vi.fn((data: any, callback: (error: Error | null) => void) => {
            callback(null);
          }),
        },
      };

      // Execute with error scenario
      wikiSearchHandlerPlugin(responseHooks as any);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(errorHandled).toBe(true);

      // Should still set up next round even with error
      expect(responseContext.actions.yieldNextRoundTo).toBe('self');
      expect(responseContext.actions.newUserMessage).toContain('Error:');
      expect(responseContext.actions.newUserMessage).toContain('does not exist');
    });
  });
});
