import serviceIdentifier from '@services/serviceIdentifier';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptConcatContext } from '../../../promptConcat';
import { Prompt, PromptDynamicModification } from '../../../promptConcatSchema';
import { retrievalAugmentedGenerationHandler } from '../retrievalAugmentedGeneration';

// Mock dependencies
vi.mock('@services/container', () => ({
  container: {
    get: vi.fn(),
  },
}));

vi.mock('@services/libs/log', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../../../../constants/channels', () => ({
  WikiChannel: {
    runFilter: 'wiki:runFilter',
  },
  WorkspaceChannel: {
    name: 'workspace',
  },
}));

describe('RAG Tool Injection', () => {
  let mockWorkspaceService: {
    getWorkspacesAsList: ReturnType<typeof vi.fn>;
  };
  let mockAgentDefinitionService: {
    getAvailableTools: ReturnType<typeof vi.fn>;
  };
  let mockWikiService: {
    wikiOperationInServer: ReturnType<typeof vi.fn>;
  };
  let prompts: Prompt[];
  let context: PromptConcatContext;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock workspace service
    mockWorkspaceService = {
      getWorkspacesAsList: vi.fn().mockResolvedValue([
        {
          id: 'wiki1',
          name: 'Documentation Wiki',
          wikiFolderLocation: '/path/to/wiki1',
          tagName: '',
        },
        {
          id: 'browser1',
          name: 'Browser Tab',
          tagName: '',
        },
        {
          id: 'wiki2',
          name: 'Personal Notes',
          wikiFolderLocation: '/path/to/wiki2',
          tagName: '',
        },
      ]),
    };

    // Mock agent definition service with optimized schema format
    mockAgentDefinitionService = {
      getAvailableTools: vi.fn().mockResolvedValue([
        {
          id: 'wiki-search',
          name: 'Wiki Search',
          description: 'Search for content in TiddlyWiki workspaces using filter expressions',
          schema: {
            description: 'search wiki content using filters',
            parameters:
              'workspaceName (required): string - workspace to search; filter (required): string - filter expression; maxResults: number - max results (default: 10); includeText: boolean - include text content (default: true)',
          },
        },
      ]),
    };

    // Mock wiki service
    mockWikiService = {
      wikiOperationInServer: vi.fn().mockResolvedValue(['Tiddler1', 'Tiddler2', 'Tiddler3']),
    };

    // Mock container.get
    const { container } = await import('@services/container');
    vi.mocked(container).get.mockImplementation((serviceId: unknown) => {
      if (serviceId === serviceIdentifier.Workspace) return mockWorkspaceService;
      if (serviceId === serviceIdentifier.AgentDefinition) return mockAgentDefinitionService;
      if (serviceId === serviceIdentifier.Wiki) return mockWikiService;
      return {};
    });

    // Setup test prompts with proper structure for findPromptById
    prompts = [
      {
        id: 'system',
        caption: 'System Prompt',
        role: 'system',
        text: 'You are a helpful assistant.',
        enabled: true,
      },
      {
        id: 'tool-injection-target',
        caption: 'Tool Injection Target',
        role: 'user',
        text: 'Target for tool injection',
        enabled: true,
      },
    ];

    // Setup context
    context = {
      messages: [],
      sourcePaths: new Map(),
    };
  });

  describe('Tool List Injection', () => {
    it('should inject optimized tool schema when toolListPosition is specified', async () => {
      const modification: PromptDynamicModification = {
        id: 'test-rag',
        caption: 'Test RAG',
        forbidOverrides: false,
        dynamicModificationType: 'retrievalAugmentedGeneration',
        retrievalAugmentedGenerationParam: {
          position: 'relative',
          targetId: 'system',
          sourceType: 'wiki',
          toolListPosition: {
            position: 'after',
            targetId: 'tool-injection-target',
          },
        },
      };

      const result = await retrievalAugmentedGenerationHandler(prompts, modification, context);

      // Should have added a new prompt after the target
      expect(result).toHaveLength(3);

      // Find the injected tool prompt
      const toolPrompt = result.find(p => p.tags?.includes('toolList'));
      expect(toolPrompt).toBeDefined();
      expect(toolPrompt?.text).toContain('Available Wiki Workspaces:');
      expect(toolPrompt?.text).toContain('Documentation Wiki (ID: wiki1)');
      expect(toolPrompt?.text).toContain('Personal Notes (ID: wiki2)');
      expect(toolPrompt?.text).not.toContain('Browser Tab'); // Should not include non-wiki workspaces

      // Should contain tool information with optimized schema
      expect(toolPrompt?.text).toContain('Available Tools:');
      expect(toolPrompt?.text).toContain('Wiki Search: Search for content in TiddlyWiki workspaces using filter expressions');
      // Should contain optimized parameter format (not JSON)
      expect(toolPrompt?.text).toContain('Parameters:');
      expect(toolPrompt?.text).toContain('Description: search wiki content using filters');
      expect(toolPrompt?.text).toContain('Parameters: workspaceName (required): string - workspace to search');
      expect(toolPrompt?.text).toContain('filter (required): string - filter expression');
      expect(toolPrompt?.text).toContain('maxResults: number - max results (default: 10)');
      expect(toolPrompt?.text).toContain('includeText: boolean - include text content (default: true)');
      // Should NOT contain JSON schema syntax
      expect(toolPrompt?.text).not.toContain('"type": "object"');
      expect(toolPrompt?.text).not.toContain('"properties"');
      expect(toolPrompt?.text).not.toContain('"required"');
    });

    it('should inject before target when position is "before"', async () => {
      const modification: PromptDynamicModification = {
        id: 'test-rag',
        caption: 'Test RAG',
        forbidOverrides: false,
        dynamicModificationType: 'retrievalAugmentedGeneration',
        retrievalAugmentedGenerationParam: {
          position: 'relative',
          targetId: 'system',
          sourceType: 'wiki',
          toolListPosition: {
            position: 'before',
            targetId: 'tool-injection-target',
          },
        },
      };

      const result = await retrievalAugmentedGenerationHandler(prompts, modification, context);

      // Should have added a new prompt before the target
      expect(result).toHaveLength(3);

      // The tool prompt should be at index 1 (before the target)
      const toolPrompt = result[1];
      expect(toolPrompt.tags).toContain('toolList');
      expect(result[2].id).toBe('tool-injection-target'); // Target should be after the injected prompt
    });

    it('should not inject when target prompt is not found', async () => {
      const modification: PromptDynamicModification = {
        id: 'test-rag',
        caption: 'Test RAG',
        forbidOverrides: false,
        dynamicModificationType: 'retrievalAugmentedGeneration',
        retrievalAugmentedGenerationParam: {
          position: 'relative',
          targetId: 'system',
          sourceType: 'wiki',
          toolListPosition: {
            position: 'after',
            targetId: 'non-existent-target',
          },
        },
      };

      const result = await retrievalAugmentedGenerationHandler(prompts, modification, context);

      // Should not modify prompts when target is not found
      expect(result).toHaveLength(2);
      expect(result.find(p => p.tags?.includes('toolList'))).toBeUndefined();
    });
  });

  describe('Tool Result Injection', () => {
    it('should inject wiki search results when resultPosition and wikiParam are specified', async () => {
      const modification: PromptDynamicModification = {
        id: 'test-rag',
        caption: 'Test RAG',
        forbidOverrides: false,
        dynamicModificationType: 'retrievalAugmentedGeneration',
        retrievalAugmentedGenerationParam: {
          position: 'relative',
          targetId: 'system',
          sourceType: 'wiki',
          resultPosition: {
            position: 'after',
            targetId: 'system',
          },
          wikiParam: {
            workspaceName: 'wiki1',
            filter: '[tag[example]]',
          },
        },
      };

      const result = await retrievalAugmentedGenerationHandler(prompts, modification, context);

      // Should have added a new prompt after the target
      expect(result).toHaveLength(3);

      // Find the injected result prompt
      const resultPrompt = result.find(p => p.tags?.includes('toolResult'));
      expect(resultPrompt).toBeDefined();
      expect(resultPrompt?.text).toContain('Wiki search results from "wiki1" with filter "[tag[example]]"');
      expect(resultPrompt?.text).toContain('Tiddler1\nTiddler2\nTiddler3');

      // Verify wiki service was called correctly
      expect(mockWikiService.wikiOperationInServer).toHaveBeenCalledWith(
        'wiki:runFilter',
        'wiki1',
        ['[tag[example]]'],
      );
    });

    it('should not inject when wikiParam is missing', async () => {
      const modification: PromptDynamicModification = {
        id: 'test-rag',
        caption: 'Test RAG',
        forbidOverrides: false,
        dynamicModificationType: 'retrievalAugmentedGeneration',
        retrievalAugmentedGenerationParam: {
          position: 'relative',
          targetId: 'system',
          sourceType: 'wiki',
          resultPosition: {
            position: 'after',
            targetId: 'system',
          },
        },
      };

      const result = await retrievalAugmentedGenerationHandler(prompts, modification, context);

      // Should not modify prompts when wikiParam is missing
      expect(result).toHaveLength(2);
      expect(result.find(p => p.tags?.includes('toolResult'))).toBeUndefined();
      expect(mockWikiService.wikiOperationInServer).not.toHaveBeenCalled();
    });

    it('should handle empty search results gracefully', async () => {
      mockWikiService.wikiOperationInServer.mockResolvedValue([]);

      const modification: PromptDynamicModification = {
        id: 'test-rag',
        caption: 'Test RAG',
        forbidOverrides: false,
        dynamicModificationType: 'retrievalAugmentedGeneration',
        retrievalAugmentedGenerationParam: {
          position: 'relative',
          targetId: 'system',
          sourceType: 'wiki',
          resultPosition: {
            position: 'after',
            targetId: 'system',
          },
          wikiParam: {
            workspaceName: 'wiki1',
            filter: '[tag[nonexistent]]',
          },
        },
      };

      const result = await retrievalAugmentedGenerationHandler(prompts, modification, context);

      // Should not inject when no results are found
      expect(result).toHaveLength(2);
      expect(result.find(p => p.tags?.includes('toolResult'))).toBeUndefined();
    });
  });

  describe('Trigger Conditions', () => {
    it('should skip when trigger condition is not met', async () => {
      context.messages = [
        {
          role: 'user',
          content: 'This is a normal message without trigger terms',
          id: 'msg1',
          agentId: 'agent1',
        },
      ];

      const modification: PromptDynamicModification = {
        id: 'test-rag',
        caption: 'Test RAG',
        forbidOverrides: false,
        dynamicModificationType: 'retrievalAugmentedGeneration',
        retrievalAugmentedGenerationParam: {
          position: 'relative',
          targetId: 'system',
          sourceType: 'wiki',
          trigger: {
            search: 'search',
          },
          toolListPosition: {
            position: 'after',
            targetId: 'tool-injection-target',
          },
        },
      };

      const result = await retrievalAugmentedGenerationHandler(prompts, modification, context);

      // Should not modify prompts when trigger condition is not met
      expect(result).toHaveLength(2);
      expect(result.find(p => p.tags?.includes('toolList'))).toBeUndefined();
    });

    it('should inject when search trigger condition is met', async () => {
      context.messages = [
        {
          role: 'user',
          content: 'I want to search for something in the wiki',
          id: 'msg1',
          agentId: 'agent1',
        },
      ];

      const modification: PromptDynamicModification = {
        id: 'test-rag',
        caption: 'Test RAG',
        forbidOverrides: false,
        dynamicModificationType: 'retrievalAugmentedGeneration',
        retrievalAugmentedGenerationParam: {
          position: 'relative',
          targetId: 'system',
          sourceType: 'wiki',
          trigger: {
            search: 'search',
          },
          toolListPosition: {
            position: 'after',
            targetId: 'tool-injection-target',
          },
        },
      };

      const result = await retrievalAugmentedGenerationHandler(prompts, modification, context);

      // Should inject when trigger condition is met
      expect(result).toHaveLength(3);
      expect(result.find(p => p.tags?.includes('toolList'))).toBeDefined();
    });

    it('should inject when no trigger is specified (default behavior)', async () => {
      const modification: PromptDynamicModification = {
        id: 'test-rag',
        caption: 'Test RAG',
        forbidOverrides: false,
        dynamicModificationType: 'retrievalAugmentedGeneration',
        retrievalAugmentedGenerationParam: {
          position: 'relative',
          targetId: 'system',
          sourceType: 'wiki',
          toolListPosition: {
            position: 'after',
            targetId: 'tool-injection-target',
          },
        },
      };

      const result = await retrievalAugmentedGenerationHandler(prompts, modification, context);

      // Should inject when no trigger is specified
      expect(result).toHaveLength(3);
      expect(result.find(p => p.tags?.includes('toolList'))).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle workspace service errors gracefully', async () => {
      mockWorkspaceService.getWorkspacesAsList.mockRejectedValue(new Error('Workspace service error'));

      const modification: PromptDynamicModification = {
        id: 'test-rag',
        caption: 'Test RAG',
        forbidOverrides: false,
        dynamicModificationType: 'retrievalAugmentedGeneration',
        retrievalAugmentedGenerationParam: {
          position: 'relative',
          targetId: 'system',
          sourceType: 'wiki',
          toolListPosition: {
            position: 'after',
            targetId: 'tool-injection-target',
          },
        },
      };

      const result = await retrievalAugmentedGenerationHandler(prompts, modification, context);

      // Should return original prompts when service fails
      expect(result).toHaveLength(2);
      expect(result.find(p => p.tags?.includes('toolList'))).toBeUndefined();
    });

    it('should handle wiki service errors gracefully', async () => {
      mockWikiService.wikiOperationInServer.mockRejectedValue(new Error('Wiki service error'));

      const modification: PromptDynamicModification = {
        id: 'test-rag',
        caption: 'Test RAG',
        forbidOverrides: false,
        dynamicModificationType: 'retrievalAugmentedGeneration',
        retrievalAugmentedGenerationParam: {
          position: 'relative',
          targetId: 'system',
          sourceType: 'wiki',
          resultPosition: {
            position: 'after',
            targetId: 'system',
          },
          wikiParam: {
            workspaceName: 'wiki1',
            filter: '[tag[example]]',
          },
        },
      };

      const result = await retrievalAugmentedGenerationHandler(prompts, modification, context);

      // Should return original prompts when wiki service fails
      expect(result).toHaveLength(2);
      expect(result.find(p => p.tags?.includes('toolResult'))).toBeUndefined();
    });

    it('should handle missing retrievalAugmentedGenerationParam', async () => {
      const modification: PromptDynamicModification = {
        id: 'test-rag',
        caption: 'Test RAG',
        forbidOverrides: false,
        dynamicModificationType: 'retrievalAugmentedGeneration',
      };

      const result = await retrievalAugmentedGenerationHandler(prompts, modification, context);

      // Should return original prompts when param is missing
      expect(result).toHaveLength(2);
    });
  });
});
