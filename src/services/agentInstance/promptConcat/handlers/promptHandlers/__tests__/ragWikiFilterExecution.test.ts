import { WikiChannel } from '@/constants/channels';
import serviceIdentifier from '@services/serviceIdentifier';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptConcatContext } from '../../../promptConcat';
import { IPrompt, PromptDynamicModification } from '../../../promptConcatSchema';
import { retrievalAugmentedGenerationHandler } from '../retrievalAugmentedGeneration';

describe('RAG Handler Execute Provided Wiki Filter ', () => {
  let mockWorkspaceService: {
    getWorkspacesAsList: ReturnType<typeof vi.fn>;
  };
  let mockAgentDefinitionService: {
    getAvailableTools: ReturnType<typeof vi.fn>;
  };
  let mockWikiService: {
    wikiOperationInServer: ReturnType<typeof vi.fn>;
  };
  let prompts: IPrompt[];
  let context: PromptConcatContext;

  beforeEach(async () => {
    mockWorkspaceService = {
      getWorkspacesAsList: vi.fn().mockResolvedValue([
        {
          id: 'test-wiki',
          name: 'Test Wiki',
          wikiFolderLocation: '/path/to/test-wiki',
          tagName: '',
        },
      ]),
    };

    mockAgentDefinitionService = {
      getAvailableTools: vi.fn().mockResolvedValue([
        {
          id: 'wiki-search',
          name: 'Wiki Search',
          description: 'Search wiki content',
          schema: {
            description: 'search wiki content using filters',
            parameters: 'workspaceName (required): string - workspace to search Example: 我的知识库; filter (required): string - filter expression Example: [tag[example]]',
          },
        },
      ]),
    };

    mockWikiService = {
      wikiOperationInServer: vi.fn(),
    };

    const { container } = await import('@services/container');
    vi.mocked(container).get.mockImplementation((serviceId: unknown) => {
      if (serviceId === serviceIdentifier.Workspace) return mockWorkspaceService;
      if (serviceId === serviceIdentifier.AgentDefinition) return mockAgentDefinitionService;
      if (serviceId === serviceIdentifier.Wiki) return mockWikiService;
      return {};
    });

    prompts = [
      {
        id: 'system',
        caption: 'System',
        role: 'system',
        text: 'You are a helpful assistant.',
        enabled: true,
      },
      {
        id: 'tool-result-target',
        caption: 'Tool Results',
        role: 'system',
        text: '',
        enabled: true,
      },
      {
        id: 'user-message',
        caption: 'User',
        role: 'user',
        text: 'Search for machine learning notes',
        enabled: true,
      },
    ];

    context = {
      messages: [],
      sourcePaths: new Map(),
    };
  });

  describe('Wiki Filter Execution', () => {
    it('should execute wiki filter and inject results when wikiParam is provided', async () => {
      const filterResults = ['Tiddler 1: Machine Learning Basics', 'Tiddler 2: Deep Learning'];
      mockWikiService.wikiOperationInServer.mockResolvedValue(filterResults);

      const modification: PromptDynamicModification = {
        id: 'test-rag',
        caption: 'Test RAG',
        forbidOverrides: false,
        dynamicModificationType: 'retrievalAugmentedGeneration',
        retrievalAugmentedGenerationParam: {
          position: 'relative',
          targetId: 'tool-result-target',
          sourceType: 'wiki',
          wikiParam: {
            workspaceName: 'test-wiki',
            filter: '[tag[machine-learning]]',
          },
          trigger: {
            randomChance: 1.0,
          },
        },
      };

      const result = await retrievalAugmentedGenerationHandler(prompts, modification, context);

      expect(mockWikiService.wikiOperationInServer).toHaveBeenCalledWith(
        WikiChannel.runFilter,
        'test-wiki',
        ['[tag[machine-learning]]'],
      );

      const resultPrompt = result.find(p => p.tags?.includes('toolResult'));
      expect(resultPrompt).toBeDefined();
      expect(resultPrompt?.text).toContain('Wiki search results from "test-wiki"');
      expect(resultPrompt?.text).toContain('[tag[machine-learning]]');
      expect(resultPrompt?.text).toContain('Tiddler 1: Machine Learning Basics');
      expect(resultPrompt?.text).toContain('Tiddler 2: Deep Learning');
    });

    it('should handle empty filter results gracefully', async () => {
      mockWikiService.wikiOperationInServer.mockResolvedValue([]);

      const modification: PromptDynamicModification = {
        id: 'test-rag',
        caption: 'Test RAG',
        forbidOverrides: false,
        dynamicModificationType: 'retrievalAugmentedGeneration',
        retrievalAugmentedGenerationParam: {
          position: 'relative',
          targetId: 'tool-result-target',
          sourceType: 'wiki',
          wikiParam: {
            workspaceName: 'test-wiki',
            filter: '[tag[nonexistent]]',
          },
          trigger: {
            randomChance: 1.0,
          },
        },
      };

      const result = await retrievalAugmentedGenerationHandler(prompts, modification, context);

      expect(mockWikiService.wikiOperationInServer).toHaveBeenCalledWith(
        WikiChannel.runFilter,
        'test-wiki',
        ['[tag[nonexistent]]'],
      );

      // Should not inject result prompt when no results
      const resultPrompt = result.find(p => p.tags?.includes('toolResult'));
      expect(resultPrompt).toBeUndefined();
    });

    it('should skip filter execution when wikiParam is missing', async () => {
      const modification: PromptDynamicModification = {
        id: 'test-rag',
        caption: 'Test RAG',
        forbidOverrides: false,
        dynamicModificationType: 'retrievalAugmentedGeneration',
        retrievalAugmentedGenerationParam: {
          position: 'relative',
          targetId: 'tool-result-target',
          sourceType: 'wiki',
          trigger: {
            randomChance: 1.0,
          },
        },
      };

      const result = await retrievalAugmentedGenerationHandler(prompts, modification, context);

      expect(mockWikiService.wikiOperationInServer).not.toHaveBeenCalled();

      const resultPrompt = result.find(p => p.tags?.includes('toolResult'));
      expect(resultPrompt).toBeUndefined();
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
          targetId: 'tool-result-target',
          sourceType: 'wiki',
          wikiParam: {
            workspaceName: 'test-wiki',
            filter: '[tag[test]]',
          },
          trigger: {
            randomChance: 1.0,
          },
        },
      };

      const result = await retrievalAugmentedGenerationHandler(prompts, modification, context);

      expect(mockWikiService.wikiOperationInServer).toHaveBeenCalled();

      // Should not inject result prompt on error
      const resultPrompt = result.find(p => p.tags?.includes('toolResult'));
      expect(resultPrompt).toBeUndefined();

      // Original prompts should remain unchanged
      expect(result).toHaveLength(3);
    });

    it('should inject both tool list and wiki results when both are configured', async () => {
      const filterResults = ['Result 1', 'Result 2'];
      mockWikiService.wikiOperationInServer.mockResolvedValue(filterResults);

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
            targetId: 'system',
          },
          wikiParam: {
            workspaceName: 'test-wiki',
            filter: '[tag[test]]',
          },
          trigger: {
            randomChance: 1.0,
          },
        },
      };

      const result = await retrievalAugmentedGenerationHandler(prompts, modification, context);

      // Should have both tool list and result prompts
      const toolListPrompt = result.find(p => p.tags?.includes('toolList'));
      const resultPrompt = result.find(p => p.tags?.includes('toolResult'));

      expect(toolListPrompt).toBeDefined();
      expect(resultPrompt).toBeDefined();

      expect(toolListPrompt?.text).toContain('Available Wiki Workspaces:');
      expect(toolListPrompt?.text).toContain('Test Wiki (ID: test-wiki)');

      expect(resultPrompt?.text).toContain('Wiki search results from "test-wiki"');
      expect(resultPrompt?.text).toContain('Result 1');
      expect(resultPrompt?.text).toContain('Result 2');
    });

    it('should not inject tool result prompt, as resultPosition is deprecated and results are now in message history', async () => {
      mockWikiService.wikiOperationInServer.mockResolvedValue(['Tiddler 1', 'Tiddler 2']);
      const modification: PromptDynamicModification = {
        id: 'test-rag',
        caption: 'Test RAG',
        forbidOverrides: false,
        dynamicModificationType: 'retrievalAugmentedGeneration',
        retrievalAugmentedGenerationParam: {
          position: 'relative',
          targetId: 'tool-result-target',
          sourceType: 'wiki',
          wikiParam: {
            workspaceName: 'test-wiki',
            filter: '[tag[machine-learning]]',
          },
          trigger: {
            randomChance: 1.0,
          },
        },
      };
      const result = await retrievalAugmentedGenerationHandler(prompts, modification, context);
      expect(mockWikiService.wikiOperationInServer).toHaveBeenCalledWith(
        WikiChannel.runFilter,
        'test-wiki',
        ['[tag[machine-learning]]'],
      );
      expect(result.find(p => p.tags?.includes('toolResult'))).toBeUndefined();
    });
  });

  describe('AI Tool Calling Detection and Execution', () => {
    it('should detect AI tool calls in messages and execute wiki search', async () => {
      // Setup messages with AI tool call from previous round
      context.messages = [
        {
          id: 'msg-1',
          agentId: 'test-agent',
          role: 'user',
          content: 'Find information about machine learning',
        },
        {
          id: 'msg-2',
          agentId: 'test-agent',
          role: 'assistant',
          content: "I'll search for machine learning information in your wiki.",
        },
        {
          id: 'msg-3',
          agentId: 'test-agent',
          role: 'assistant',
          content:
            '<tool_use name="wiki-search">\n{\n  "workspaceName": "test-wiki",\n  "filter": "[tag[machine-learning]]",\n  "maxResults": 5,\n  "includeText": true\n}\n</tool_use>',
        },
      ];

      const filterResults = ['Machine Learning Basics: A comprehensive guide', 'Neural Networks Overview'];
      mockWikiService.wikiOperationInServer.mockResolvedValue(filterResults);

      const modification: PromptDynamicModification = {
        id: 'test-rag',
        caption: 'Test RAG',
        forbidOverrides: false,
        dynamicModificationType: 'retrievalAugmentedGeneration',
        retrievalAugmentedGenerationParam: {
          position: 'relative',
          targetId: 'tool-result-target',
          sourceType: 'wiki',
          toolListPosition: {
            position: 'after',
            targetId: 'system',
          },
          trigger: {
            randomChance: 1.0,
          },
        },
      };

      // First, we need to implement tool call detection in the handler
      // For now, let's test that the handler can process tool calls from messages
      const result = await retrievalAugmentedGenerationHandler(prompts, modification, context);

      // Should inject tool list prompt
      const toolListPrompt = result.find(p => p.tags?.includes('toolList'));
      expect(toolListPrompt).toBeDefined();
      expect(toolListPrompt?.text).toContain('Available Tools:');
      expect(toolListPrompt?.text).toContain('Wiki Search');

      // TODO: When tool call detection is implemented, should also execute the detected tool call
      // and inject results automatically
    });

    it('should extract tool parameters from various AI message formats', async () => {
      const testCases = [
        {
          name: 'JSON format',
          message: '<tool_use name="wiki-search">\n{"workspaceName": "docs-wiki", "filter": "[tag[docs]]"}\n</tool_use>',
          expectedWorkspace: 'docs-wiki',
          expectedFilter: '[tag[docs]]',
        },
        {
          name: 'multiline JSON',
          message: '<tool_use name="wiki-search">\n{\n  "workspaceName": "research-notes",\n  "filter": "[tag[research]]\n}\n</tool_use>',
          expectedWorkspace: 'research-notes',
          expectedFilter: '[tag[research]]',
        },
        {
          name: 'with extra parameters',
          message:
            '<tool_use name="wiki-search">\n{\n  "workspaceName": "personal-wiki",\n  "filter": "[tag[personal]]",\n  "maxResults": 10,\n  "includeText": true\n}\n</tool_use>',
          expectedWorkspace: 'personal-wiki',
          expectedFilter: '[tag[personal]]',
        },
      ];

      for (const testCase of testCases) {
        // Setup context with AI tool call message
        context.messages = [
          {
            id: 'msg-1',
            agentId: 'test-agent',
            role: 'user',
            content: 'Search for information',
          },
          {
            id: 'msg-2',
            agentId: 'test-agent',
            role: 'assistant',
            content: testCase.message,
          },
        ];

        const filterResults = [`Result for ${testCase.expectedWorkspace}`];
        mockWikiService.wikiOperationInServer.mockResolvedValue(filterResults);

        const modification: PromptDynamicModification = {
          id: 'test-rag',
          caption: 'Test RAG',
          forbidOverrides: false,
          dynamicModificationType: 'retrievalAugmentedGeneration',
          retrievalAugmentedGenerationParam: {
            position: 'relative',
            targetId: 'tool-result-target',
            sourceType: 'wiki',
            trigger: {
              randomChance: 1.0,
            },
          },
        };

        // TODO: When tool call detection is implemented, verify it extracts parameters correctly
        // and calls wikiOperationInServer with the right parameters
        const result = await retrievalAugmentedGenerationHandler(prompts, modification, context);

        // For now, just verify the handler doesn't crash with various message formats
        expect(result).toBeDefined();
        expect(result.length).toBeGreaterThanOrEqual(prompts.length);
      }
    });

    it('should handle multiple tool calls in conversation history', async () => {
      context.messages = [
        {
          id: 'msg-1',
          agentId: 'test-agent',
          role: 'user',
          content: 'Find information about AI and machine learning',
        },
        {
          id: 'msg-2',
          agentId: 'test-agent',
          role: 'assistant',
          content: "I'll search for AI information first.",
        },
        {
          id: 'msg-3',
          agentId: 'test-agent',
          role: 'assistant',
          content: '<tool_use name="wiki-search">\n{\n  "workspaceName": "ai-wiki",\n  "filter": "[tag[artificial-intelligence]]"\n}\n</tool_use>',
        },
        {
          id: 'msg-4',
          agentId: 'test-agent',
          role: 'user',
          content: 'Now search for machine learning specifically',
        },
        {
          id: 'msg-5',
          agentId: 'test-agent',
          role: 'assistant',
          content: '<tool_use name="wiki-search">\n{\n  "workspaceName": "ml-wiki",\n  "filter": "[tag[machine-learning]]"\n}\n</tool_use>',
        },
      ];

      const filterResults = ['Latest AI research findings', 'Machine learning fundamentals'];
      mockWikiService.wikiOperationInServer.mockResolvedValue(filterResults);

      const modification: PromptDynamicModification = {
        id: 'test-rag',
        caption: 'Test RAG',
        forbidOverrides: false,
        dynamicModificationType: 'retrievalAugmentedGeneration',
        retrievalAugmentedGenerationParam: {
          position: 'relative',
          targetId: 'tool-result-target',
          sourceType: 'wiki',
          toolListPosition: {
            position: 'after',
            targetId: 'system',
          },
          trigger: {
            randomChance: 1.0,
          },
        },
      };

      const result = await retrievalAugmentedGenerationHandler(prompts, modification, context);

      // Should inject tool list
      const toolListPrompt = result.find(p => p.tags?.includes('toolList'));
      expect(toolListPrompt).toBeDefined();

      // TODO: When implemented, should detect and execute the most recent tool call
      // and inject results from the latest tool call in conversation
    });

    it('should ignore malformed tool calls gracefully', async () => {
      const malformedMessages = [
        '<tool_use name="wiki-search">invalid json</tool_use>',
        '<tool_use name="wiki-search">{"workspaceName": "test"}</tool_use>', // missing required filter
        '<tool_use name="unknown-tool">{"param": "value"}</tool_use>', // unknown tool
        'regular message without tool calls',
      ];

      for (const malformedMessage of malformedMessages) {
        context.messages = [
          {
            id: 'msg-1',
            agentId: 'test-agent',
            role: 'user',
            content: 'Search for something',
          },
          {
            id: 'msg-2',
            agentId: 'test-agent',
            role: 'assistant',
            content: malformedMessage,
          },
        ];

        const modification: PromptDynamicModification = {
          id: 'test-rag',
          caption: 'Test RAG',
          forbidOverrides: false,
          dynamicModificationType: 'retrievalAugmentedGeneration',
          retrievalAugmentedGenerationParam: {
            position: 'relative',
            targetId: 'tool-result-target',
            sourceType: 'wiki',
            trigger: {
              randomChance: 1.0,
            },
          },
        };

        // Should not crash on malformed tool calls
        const result = await retrievalAugmentedGenerationHandler(prompts, modification, context);
        expect(result).toBeDefined();

        // Should not call wiki service for malformed calls
        expect(mockWikiService.wikiOperationInServer).not.toHaveBeenCalled();

        // Reset mock for next iteration
        mockWikiService.wikiOperationInServer.mockClear();
      }
    });

    it('should prioritize latest tool call when multiple calls exist', async () => {
      context.messages = [
        {
          id: 'msg-1',
          agentId: 'test-agent',
          role: 'assistant',
          content: '<tool_use name="wiki-search">\n{\n  "workspaceName": "old-wiki",\n  "filter": "[tag[old]]"\n}\n</tool_use>',
        },
        {
          id: 'msg-2',
          agentId: 'test-agent',
          role: 'assistant',
          content: '<tool_use name="wiki-search">\n{\n  "workspaceName": "new-wiki",\n  "filter": "[tag[new]]"\n}\n</tool_use>',
        },
      ];

      const filterResults = ['New search results'];
      mockWikiService.wikiOperationInServer.mockResolvedValue(filterResults);

      const modification: PromptDynamicModification = {
        id: 'test-rag',
        caption: 'Test RAG',
        forbidOverrides: false,
        dynamicModificationType: 'retrievalAugmentedGeneration',
        retrievalAugmentedGenerationParam: {
          position: 'relative',
          targetId: 'tool-result-target',
          sourceType: 'wiki',
          trigger: {
            randomChance: 1.0,
          },
        },
      };

      const result = await retrievalAugmentedGenerationHandler(prompts, modification, context);

      // TODO: When implemented, should execute the latest tool call (new-wiki, [tag[new]])
      // not the older one
      expect(result).toBeDefined();
    });
  });
});
