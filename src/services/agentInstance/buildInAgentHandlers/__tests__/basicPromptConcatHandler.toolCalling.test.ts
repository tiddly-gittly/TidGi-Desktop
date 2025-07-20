/* eslint-disable @typescript-eslint/require-await */
import { mockServiceInstances } from '@/__tests__/setup-vitest';
import type { AgentDefinition } from '@services/agentDefinition/interface';
import { matchToolCalling } from '@services/agentDefinition/responsePatternUtility';
import { matchAndExecuteTool } from '@services/agentDefinition/toolExecutor';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentInstance, AgentInstanceMessage } from '../../interface';
import { basicPromptConcatHandler } from '../basicPromptConcatHandler';
import defaultAgents from '../defaultAgents.json';
import type { AgentHandlerContext } from '../type';

describe('basicPromptConcatHandler - Tool Calling Integration', () => {
  let mockContext: AgentHandlerContext;
  let mockAgent: AgentInstance;
  const defaultAgentConfig: AgentDefinition = defaultAgents[0] as AgentDefinition;

  beforeEach(() => {
    vi.clearAllMocks();

    const userMessage: AgentInstanceMessage = {
      id: 'msg-1',
      agentId: 'agent-1',
      role: 'user',
      content: 'Hello, how are you?',
      contentType: 'text/plain',
      modified: new Date(),
    };

    mockAgent = {
      id: 'agent-1',
      messages: [userMessage],
      aiApiConfig: {},
    } as AgentInstance;

    mockContext = {
      agent: mockAgent,
      agentDef: defaultAgentConfig,
      isCancelled: vi.fn().mockReturnValue(false),
    };
  });

  it('should use real pure functions for tool calling', async () => {
    // Setup test message for wiki search
    const userMessage: AgentInstanceMessage = {
      id: 'msg-wiki-1',
      agentId: 'agent-1',
      role: 'user',
      content: '搜索 wiki 里的 Index 条目并解释',
      contentType: 'text/plain',
      modified: new Date(),
    };

    mockAgent.messages = [userMessage];

    // Enhanced mock for workspace service
    const enhancedWorkspaceService = {
      ...mockServiceInstances.workspace,
      getWorkspacesAsList: vi.fn().mockResolvedValue([
        { id: 'wiki-workspace-1', name: 'wiki', type: 'wiki' },
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
            fields: { title: 'Index', text: 'This is the Index tiddler content.' },
          }];
        }
        return [];
      }),
    };

    // Update service instances
    mockServiceInstances.workspace = enhancedWorkspaceService;
    mockServiceInstances.wiki = enhancedWikiService;

    // AI response containing tool call
    const aiResponse = {
      status: 'done' as const,
      content: '<tool_use name="wiki-search">{workspaceName: "wiki", filter: "[title[Index]]", maxResults: 1, includeText: true}</tool_use>',
      requestId: 'req-wiki-1',
    };

    mockServiceInstances.externalAPI.generateFromAI = vi.fn().mockImplementation(async function*() {
      yield aiResponse;
    });

    // Test the real pure functions directly
    const toolMatch = matchToolCalling(aiResponse.content);
    expect(toolMatch.found).toBe(true);
    expect(toolMatch.toolId).toBe('wiki-search');
    expect(toolMatch.parameters).toMatchObject({
      workspaceName: 'wiki',
      filter: '[title[Index]]',
      maxResults: 1,
      includeText: true,
    });

    // Test the real tool execution
    const toolResult = await matchAndExecuteTool(aiResponse.content, {
      workspaceId: 'agent-1',
      metadata: { messageId: 'test-message' },
    });

    expect(toolResult).toBeDefined();
    expect(toolResult?.success).toBe(true);
    expect(toolResult?.data).toContain('Index');
    expect(toolResult?.data).toContain('This is the Index tiddler content.');

    // Execute the handler to verify integration
    const generator = basicPromptConcatHandler(mockContext);
    const results = [];
    for await (const result of generator) {
      results.push(result);
    }

    // Verify we got at least one result
    expect(results.length).toBeGreaterThan(0);
    expect(mockServiceInstances.externalAPI.generateFromAI).toHaveBeenCalled();

    // Verify workspace and wiki services were called correctly
    expect(enhancedWorkspaceService.getWorkspacesAsList).toHaveBeenCalled();
    expect(enhancedWorkspaceService.exists).toHaveBeenCalledWith('wiki-workspace-1');
    expect(enhancedWikiService.wikiOperationInServer).toHaveBeenCalledWith(
      'wiki-run-filter',
      'wiki-workspace-1',
      ['[title[Index]]'],
    );
    expect(enhancedWikiService.wikiOperationInServer).toHaveBeenCalledWith(
      'get-tiddlers-as-json',
      'wiki-workspace-1',
      ['Index'],
    );
  });
});
