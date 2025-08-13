/**
 * Tests for Wiki Search plugin duration mechanism
 * Using real configuration from defaultAgents.json
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentInstanceMessage } from '../../interface';

import { WikiChannel } from '@/constants/channels';
import serviceIdentifier from '@services/serviceIdentifier';

import defaultAgents from '../../buildInAgentHandlers/defaultAgents.json';
import { createHandlerHooks } from '../index';
import { wikiSearchPlugin } from '../wikiSearchPlugin';

// Use the real agent config
const exampleAgent = defaultAgents[0];
const realHandlerConfig = exampleAgent.handlerConfig;

const mockWikiService = {
  wikiOperationInServer: vi.fn(),
};

const mockWorkspaceService = {
  getWorkspacesAsList: vi.fn(),
  exists: vi.fn(),
};

const mockAgentInstanceService = {
  saveUserMessage: vi.fn(),
  debounceUpdateMessage: vi.fn(), // Add mock for debounceUpdateMessage
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
      if (identifier === serviceIdentifier.AgentInstance) {
        return mockAgentInstanceService;
      }
      return {};
    }),
  },
}));

describe('Wiki Search Plugin - Duration Mechanism', () => {
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
    ]);
    mockWorkspaceService.exists.mockResolvedValue(true);
    mockAgentInstanceService.saveUserMessage.mockResolvedValue(undefined);
  });

  describe('WikiSearch Plugin Tool Call Duration Mechanism', () => {
    // The duration mechanism should work as follows:
    // - AI tool call message should have duration=1 to gray out immediately after tool execution
    // - Tool result message should have duration=1 to gray out after 1 round
    // - This prevents AI from seeing stale tool calls in subsequent rounds
    it('should set duration=1 for AI tool call message to gray out immediately using real config', async () => {
      // Find the real wikiSearch plugin config from defaultAgents.json
      const wikiPlugin = realHandlerConfig.plugins.find(p => p.pluginId === 'wikiSearch');
      expect(wikiPlugin).toBeDefined();
      expect(wikiPlugin!.wikiSearchParam).toBeDefined();

      // Mock wiki search results
      mockWikiService.wikiOperationInServer.mockImplementation(
        (channel: WikiChannel) => {
          if (channel === WikiChannel.runFilter) {
            return Promise.resolve(['Test Result']);
          }
          if (channel === WikiChannel.getTiddlersAsJson) {
            return Promise.resolve([{
              title: 'Test Result',
              text: 'This is test content',
              tags: ['test'],
            }]);
          }
          return Promise.resolve([]);
        },
      );

      const handlerContext = {
        agent: {
          id: 'test-agent',
          agentDefId: 'test-agent-def',
          status: {
            state: 'working' as const,
            modified: new Date(),
          },
          created: new Date(),
          messages: [
            // Previous user message
            {
              id: 'user-msg-1',
              role: 'user' as const,
              content: 'Search for information',
              agentId: 'test-agent',
              contentType: 'text/plain',
              modified: new Date(),
              duration: undefined, // Should stay visible
            },
            // AI tool call message (this is the message we're testing)
            {
              id: 'ai-tool-call-msg',
              role: 'assistant' as const,
              content: '<tool_use name="wiki-search">{"workspaceName": "Test Wiki 1", "filter": "[tag[test]]"}</tool_use>',
              agentId: 'test-agent',
              contentType: 'text/plain',
              modified: new Date(),
              duration: undefined, // Should be set to 1 after tool execution
            },
          ],
        },
        agentDef: { id: 'test-agent-def', name: 'test' },
        isCancelled: () => false,
      };

      const response = {
        status: 'done' as const,
        content: '<tool_use name="wiki-search">{"workspaceName": "Test Wiki 1", "filter": "[tag[test]]"}</tool_use>',
        requestId: 'test-request-duration',
      };

      const context = {
        handlerContext,
        response,
        requestId: 'test-request-duration',
        isFinal: true,
        pluginConfig: wikiPlugin! as any, // Type cast for JSON import
        prompts: [],
        messages: [],
        llmResponse: response.content,
        responses: [],
        actions: {
          yieldNextRoundTo: undefined,
          newUserMessage: undefined,
        },
      };

      const hooks = createHandlerHooks();
      wikiSearchPlugin(hooks);

      // Execute the response complete hook
      await hooks.responseComplete.promise(context);

      // Verify that debounceUpdateMessage was called to notify frontend immediately (no delay)
      expect(mockAgentInstanceService.debounceUpdateMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'ai-tool-call-msg',
          duration: 1,
        }),
        'test-agent',
        0, // No delay for immediate update
      );

      // Check that tool result was added
      expect(handlerContext.agent.messages.length).toBe(3); // user + ai + tool_result

      // Check that AI tool call message now has duration=1 (should gray out immediately)
      const aiToolCallMessage = handlerContext.agent.messages[1] as AgentInstanceMessage;
      expect(aiToolCallMessage.id).toBe('ai-tool-call-msg');
      expect(aiToolCallMessage.duration).toBe(1); // Should be 1 to gray out immediately
      expect(aiToolCallMessage.metadata?.containsToolCall).toBe(true);
      expect(aiToolCallMessage.metadata?.toolId).toBe('wiki-search');

      // Check that tool result message has duration=1 (from config)
      const toolResultMessage = handlerContext.agent.messages[2] as AgentInstanceMessage;
      expect(toolResultMessage.role).toBe('assistant'); // Changed from 'user' to 'assistant'
      expect(toolResultMessage.duration).toBe(1); // Tool result uses configurable toolResultDuration (default 1)
      expect(toolResultMessage.metadata?.isToolResult).toBe(true);

      // Check that previous user message is unchanged
      const userMessage = handlerContext.agent.messages[0] as AgentInstanceMessage;
      expect(userMessage.id).toBe('user-msg-1');
      expect(userMessage.duration).toBeUndefined(); // Should stay visible
    });

    it('should set duration=1 for AI tool call message even when tool execution fails', async () => {
      const handlerContext = {
        agent: {
          id: 'test-agent',
          agentDefId: 'test-agent-def',
          status: {
            state: 'working' as const,
            modified: new Date(),
          },
          created: new Date(),
          messages: [
            {
              id: 'ai-error-tool-call',
              role: 'assistant' as const,
              content: '<tool_use name="wiki-search">{"workspaceName": "Nonexistent Wiki", "filter": "[tag[test]]"}</tool_use>',
              agentId: 'test-agent',
              contentType: 'text/plain',
              modified: new Date(),
              duration: undefined, // Should be set to 1 after error handling
            },
          ],
        },
        agentDef: { id: 'test-agent-def', name: 'test' },
        isCancelled: () => false,
      };

      const response = {
        status: 'done' as const,
        content: '<tool_use name="wiki-search">{"workspaceName": "Nonexistent Wiki", "filter": "[tag[test]]"}</tool_use>',
        requestId: 'test-request-error',
      };

      const context = {
        handlerContext,
        response,
        requestId: 'test-request-error',
        isFinal: true,
        pluginConfig: {
          id: 'test-plugin',
          pluginId: 'wikiSearch' as const,
          forbidOverrides: false,
        },
        prompts: [],
        messages: [],
        llmResponse: response.content,
        responses: [],
        actions: {
          yieldNextRoundTo: undefined,
          newUserMessage: undefined,
        },
      };

      const hooks = createHandlerHooks();
      wikiSearchPlugin(hooks);

      await hooks.responseComplete.promise(context);

      // Check that AI tool call message has duration=1 even after error (should gray out immediately)
      const aiToolCallMessage = handlerContext.agent.messages[0] as AgentInstanceMessage;
      expect(aiToolCallMessage.id).toBe('ai-error-tool-call');
      expect(aiToolCallMessage.duration).toBe(1); // Should be 1 to gray out immediately
      expect(aiToolCallMessage.metadata?.containsToolCall).toBe(true);

      // Check that error result message was added with duration=1
      const errorResultMessage = handlerContext.agent.messages[1] as AgentInstanceMessage;
      expect(errorResultMessage.role).toBe('assistant'); // Changed from 'user' to 'assistant'
      expect(errorResultMessage.duration).toBe(1); // Now uses configurable toolResultDuration (default 1)
      expect(errorResultMessage.metadata?.isToolResult).toBe(true);
      expect(errorResultMessage.metadata?.isError).toBe(true);
    });

    it('should not modify duration of unrelated messages', async () => {
      // Mock successful tool execution
      mockWikiService.wikiOperationInServer.mockImplementation(
        (channel: WikiChannel) => {
          if (channel === WikiChannel.runFilter) {
            return Promise.resolve(['Result1']);
          }
          if (channel === WikiChannel.getTiddlersAsJson) {
            return Promise.resolve([{ title: 'Result1', text: 'Content1' }]);
          }
          return Promise.resolve([]);
        },
      );

      const handlerContext = {
        agent: {
          id: 'test-agent',
          agentDefId: 'test-agent-def',
          status: {
            state: 'working' as const,
            modified: new Date(),
          },
          created: new Date(),
          messages: [
            {
              id: 'unrelated-user-msg',
              role: 'user' as const,
              content: 'This is an unrelated message',
              agentId: 'test-agent',
              contentType: 'text/plain',
              modified: new Date(),
              duration: 5, // Should remain unchanged
            },
            {
              id: 'unrelated-ai-msg',
              role: 'assistant' as const,
              content: 'This is a regular AI response without tool calls',
              agentId: 'test-agent',
              contentType: 'text/plain',
              modified: new Date(),
              duration: undefined, // Should remain unchanged
            },
            {
              id: 'ai-tool-call-msg',
              role: 'assistant' as const,
              content: '<tool_use name="wiki-search">{"workspaceName": "Test Wiki 1", "filter": "[tag[test]]"}</tool_use>',
              agentId: 'test-agent',
              contentType: 'text/plain',
              modified: new Date(),
              duration: undefined, // This should be modified to 1
            },
          ],
        },
        agentDef: { id: 'test-agent-def', name: 'test' },
        isCancelled: () => false,
      };

      const response = {
        status: 'done' as const,
        content: '<tool_use name="wiki-search">{"workspaceName": "Test Wiki 1", "filter": "[tag[test]]"}</tool_use>',
        requestId: 'test-request-selective',
      };

      const context = {
        handlerContext,
        response,
        requestId: 'test-request-selective',
        isFinal: true,
        pluginConfig: {
          id: 'test-plugin',
          pluginId: 'wikiSearch' as const,
          forbidOverrides: false,
        },
        prompts: [],
        messages: [],
        llmResponse: response.content,
        responses: [],
        actions: {
          yieldNextRoundTo: undefined,
          newUserMessage: undefined,
        },
      };

      const hooks = createHandlerHooks();
      wikiSearchPlugin(hooks);

      await hooks.responseComplete.promise(context);

      // Check that unrelated messages were not modified
      const unrelatedUserMsg = handlerContext.agent.messages[0] as AgentInstanceMessage;
      expect(unrelatedUserMsg.duration).toBe(5); // Should remain unchanged

      const unrelatedAiMsg = handlerContext.agent.messages[1] as AgentInstanceMessage;
      expect(unrelatedAiMsg.duration).toBeUndefined(); // Should remain unchanged

      // Check that only the tool call message was modified
      const toolCallMsg = handlerContext.agent.messages[2] as AgentInstanceMessage;
      expect(toolCallMsg.duration).toBe(1); // Should be set to 1
      expect(toolCallMsg.metadata?.containsToolCall).toBe(true);
    });
  });
});
