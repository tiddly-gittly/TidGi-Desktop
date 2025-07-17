/* eslint-disable @typescript-eslint/require-await */
import { mockServiceInstances } from '@/__tests__/setup-vitest';
import { matchToolCalling } from '@services/agentDefinition/responsePatternUtility';
import { matchAndExecuteTool } from '@services/agentDefinition/toolExecutor';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Tool Executor Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('matchToolCalling', () => {
    it('should detect wiki-search tool call correctly', () => {
      const responseText = '<tool_use name="wiki-search">{workspaceName: "wiki", filter: "[title[Index]]", maxResults: 1, includeText: true}</tool_use>';
      
      const result = matchToolCalling(responseText);
      
      expect(result.found).toBe(true);
      expect(result.toolId).toBe('wiki-search');
      expect(result.parameters).toMatchObject({
        workspaceName: "wiki",
        filter: "[title[Index]]",
        maxResults: 1,
        includeText: true
      });
    });

    it('should return false for text without tool calls', () => {
      const responseText = 'This is just a normal response without any tool calls.';
      
      const result = matchToolCalling(responseText);
      
      expect(result.found).toBe(false);
    });
  });

  describe('matchAndExecuteTool', () => {
    it('should execute wiki-search tool when detected', async () => {
      // Enhanced mock for workspace service
      const enhancedWorkspaceService = {
        ...mockServiceInstances.workspace,
        getWorkspacesAsList: vi.fn().mockResolvedValue([
          { id: 'wiki-workspace-1', name: 'wiki', type: 'wiki' }
        ]),
        exists: vi.fn().mockResolvedValue(true),
      };

      // Enhanced mock for wiki service
      const enhancedWikiService = {
        ...mockServiceInstances.wiki,
        wikiOperationInServer: vi.fn().mockImplementation(async (channel, workspaceId, params) => {
          if (channel === 'wiki-run-filter') {
            return ['Index'];
          } else if (channel === 'get-tiddlers-as-json') {
            return [{
              title: 'Index',
              text: 'This is the Index tiddler content.',
              fields: { title: 'Index', text: 'This is the Index tiddler content.' }
            }];
          }
          return [];
        }),
      };

      // Update service instances
      mockServiceInstances.workspace = enhancedWorkspaceService;
      mockServiceInstances.wiki = enhancedWikiService;

      const responseText = '<tool_use name="wiki-search">{workspaceName: "wiki", filter: "[title[Index]]", maxResults: 1, includeText: true}</tool_use>';
      
      const result = await matchAndExecuteTool(responseText, {
        workspaceId: 'test-workspace',
        metadata: { messageId: 'test-message' }
      });
      
      expect(result).toBeDefined();
      expect(result?.success).toBe(true);
      expect(result?.data).toContain('Index');
      expect(result?.data).toContain('This is the Index tiddler content.');
    });

    it('should return undefined for text without tool calls', async () => {
      const responseText = 'This is just a normal response without any tool calls.';
      
      const result = await matchAndExecuteTool(responseText, {
        workspaceId: 'test-workspace',
        metadata: { messageId: 'test-message' }
      });
      
      expect(result).toBeUndefined();
    });
  });
});
