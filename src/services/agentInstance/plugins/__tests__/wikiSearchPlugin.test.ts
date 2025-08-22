/**
 * Comprehensive tests for Wiki Search plugin
 * Covers tool list injection, tool execution, duration mechanism, message persistence, and integration scenarios
 */
import type { AgentDefinition } from '@services/agentDefinition/interface';
import type { IWikiService } from '@services/wiki/interface';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentInstance } from '../../interface';
import type { AgentInstanceMessage } from '../../interface';
import type { IAgentInstanceService } from '../../interface';
import type { AIResponseContext, YieldNextRoundTarget } from '../types';

import { WikiChannel } from '@/constants/channels';
import serviceIdentifier from '@services/serviceIdentifier';

import type { AgentHandlerContext } from '@services/agentInstance/buildInAgentHandlers/type';
import { AgentPromptDescription } from '@services/agentInstance/promptConcat/promptConcatSchema';
import type { IPrompt } from '@services/agentInstance/promptConcat/promptConcatSchema';
import type { IPromptConcatPlugin } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { cloneDeep } from 'lodash';
import defaultAgents from '../../buildInAgentHandlers/defaultAgents.json';
import { createHandlerHooks, PromptConcatHookContext } from '../index';
import { messageManagementPlugin } from '../messageManagementPlugin';
import { wikiSearchPlugin } from '../wikiSearchPlugin';

// Use the real agent config
const exampleAgent = defaultAgents[0];
const handlerConfig = exampleAgent.handlerConfig as AgentPromptDescription['handlerConfig'];

// Services will be retrieved from container on demand inside each test/describe

type ActionBag = { yieldNextRoundTo?: YieldNextRoundTarget; newUserMessage?: string | undefined };

describe('Wiki Search Plugin - Comprehensive Tests', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  describe('Tool List Injection', () => {
    beforeEach(async () => {
      const { container } = await import('@services/container');
      const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
      // Replace agent instance methods with spies
      vi.spyOn(agentInstanceService, 'saveUserMessage').mockResolvedValue(undefined);
      vi.spyOn(agentInstanceService, 'debounceUpdateMessage').mockImplementation(() => undefined);
      // updateAgent returns Promise<AgentInstance> - return a minimal stub
      vi.spyOn(agentInstanceService, 'updateAgent').mockResolvedValue({} as AgentInstance);
    });

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
          content: 'Help me search for information in my wiki',
          agentId: 'test-agent',
          contentType: 'text/plain',
          modified: new Date(),
        },
      ];

      const context: PromptConcatHookContext = {
        handlerContext: {
          agent: { id: 'test', messages: [], agentDefId: 'test', status: { state: 'working' as const, modified: new Date() }, created: new Date() },
          agentDef: { id: 'test', name: 'test' },
          isCancelled: () => false,
        },
        pluginConfig: wikiPlugin,
        prompts: prompts,
        messages,
      };

      // Use real hooks from the plugin system
      const promptHooks = createHandlerHooks();
      wikiSearchPlugin(promptHooks);

      // Execute the processPrompts hook
      await promptHooks.processPrompts.promise(context);

      // Verify that tool information was injected into the prompts
      const promptTexts = JSON.stringify(prompts);
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

      const context = {
        pluginConfig: wikiPlugin,
        prompts,
        messages: [
          {
            id: 'user-1',
            role: 'user' as const,
            content: 'Hello, how are you?',
            agentId: 'test-agent',
            contentType: 'text/plain',
            modified: new Date(),
          },
        ],
      };

      const hooks = createHandlerHooks();
      wikiSearchPlugin(hooks);
      // build a minimal PromptConcatHookContext to run the plugin's processPrompts
      const handlerCtx: AgentHandlerContext = {
        agent: {
          id: 'test',
          agentDefId: 'test',
          messages: [],
          status: { state: 'working' as const, modified: new Date() },
          created: new Date(),
        } as AgentInstance,
        agentDef: { id: 'test', name: 'test' } as AgentDefinition,
        isCancelled: () => false,
      };
      const hookContext: PromptConcatHookContext = {
        handlerContext: handlerCtx,
        pluginConfig: wikiPlugin as IPromptConcatPlugin,
        prompts: prompts as IPrompt[],
        messages: context.messages as AgentInstanceMessage[],
      };
      await hooks.processPrompts.promise(hookContext);

      // Prompts should not be modified since trigger condition wasn't met
      const modifiedPromptsText = JSON.stringify(prompts);
      expect(modifiedPromptsText).toBe(originalPromptsText);
    });
  });
  describe('Tool Execution & Duration Mechanism', () => {
    beforeEach(async () => {
      // Mock wiki search results
      const { container } = await import('@services/container');
      const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
      if (!wikiService.wikiOperationInServer) {
        // ensure method exists for spying (exception allowed)
        (wikiService as unknown as { wikiOperationInServer: (...p: unknown[]) => Promise<unknown> }).wikiOperationInServer = async () => [];
      }
      vi.spyOn(wikiService, 'wikiOperationInServer').mockImplementation(
        ((...args: unknown[]) => {
          const channel = args[0] as WikiChannel;
          const opArgs = args[2] as string[] | undefined;
          if (channel === WikiChannel.runFilter) {
            return Promise.resolve(['Important Note 1', 'Important Note 2']);
          }
          if (channel === WikiChannel.getTiddlersAsJson && opArgs && opArgs.length > 0) {
            const title = opArgs[0];
            return Promise.resolve([
              {
                title,
                text: `Content of ${title}: This contains important information.`,
                tags: ['important'],
              },
            ]);
          }
          return Promise.resolve([]);
        }) as unknown as IWikiService['wikiOperationInServer'],
      );
    });

    it('should execute wiki search with correct duration=1 and trigger next round', async () => {
      // Find the real wikiSearch plugin config from defaultAgents.json
      const wikiPlugin = handlerConfig.plugins.find(p => p.pluginId === 'wikiSearch');
      expect(wikiPlugin).toBeDefined();
      expect(wikiPlugin!.wikiSearchParam).toBeDefined();

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
              content: '<tool_use name="wiki-search">{"workspaceName": "Test Wiki 1", "filter": "[tag[important]]"}</tool_use>',
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

      // Create a response that contains a valid tool call
      const response = {
        status: 'done' as const,
        content: '<tool_use name="wiki-search">{"workspaceName": "Test Wiki 1", "filter": "[tag[important]]"}</tool_use>',
        requestId: 'test-request-123',
      };

      const context = {
        handlerContext,
        response,
        requestId: 'test-request-123',
        isFinal: true,
        pluginConfig: wikiPlugin!,
        prompts: [],
        messages: [],
        llmResponse: response.content,
        responses: [],
        actions: {} as ActionBag,
      };

      // Use real handler hooks
      const hooks = createHandlerHooks();

      // Register the plugin
      wikiSearchPlugin(hooks);

      // Execute the response complete hook
      await hooks.responseComplete.promise(context);

      // Verify that the search was executed and results were set up for next round
      expect(context.actions.yieldNextRoundTo).toBe('self');

      // Verify that debounceUpdateMessage was called to notify frontend immediately (no delay)
      const { container } = await import('@services/container');
      const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
      expect(agentInstanceService.debounceUpdateMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'ai-tool-call-msg',
          duration: 1,
        }),
        'test-agent',
        0, // No delay for immediate update
      );

      // Check that AI tool call message now has duration=1 (should gray out immediately)
      const aiToolCallMessage = handlerContext.agent.messages[1] as AgentInstanceMessage;
      expect(aiToolCallMessage.id).toBe('ai-tool-call-msg');
      expect(aiToolCallMessage.duration).toBe(1); // Should be 1 to gray out immediately
      expect(aiToolCallMessage.metadata?.containsToolCall).toBe(true);
      expect(aiToolCallMessage.metadata?.toolId).toBe('wiki-search');

      // Verify tool result message was added to agent history with correct settings
      expect(handlerContext.agent.messages.length).toBe(3); // user + ai + tool_result
      const toolResultMessage = handlerContext.agent.messages[2] as AgentInstanceMessage;
      expect(toolResultMessage.role).toBe('assistant'); // Changed from 'user' to 'assistant'
      expect(toolResultMessage.content).toContain('<functions_result>');
      expect(toolResultMessage.content).toContain('Tool: wiki-search');
      expect(toolResultMessage.content).toContain('Important Note 1');
      expect(toolResultMessage.metadata?.isToolResult).toBe(true);
      expect(toolResultMessage.metadata?.isPersisted).toBe(false); // Should be false initially
      expect(toolResultMessage.duration).toBe(1); // Tool result uses configurable toolResultDuration (default 1)

      // Check that previous user message is unchanged
      const userMessage = handlerContext.agent.messages[0] as AgentInstanceMessage;
      expect(userMessage.id).toBe('user-msg-1');
      expect(userMessage.duration).toBeUndefined(); // Should stay visible
    });

    it('should handle wiki search errors gracefully and set duration=1 for both messages', async () => {
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

      // Tool call with nonexistent workspace
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

      // Should still set up next round with error message
      expect(context.actions.yieldNextRoundTo).toBe('self');

      // Check that AI tool call message has duration=1 even after error (should gray out immediately)
      const aiToolCallMessage = handlerContext.agent.messages[0] as AgentInstanceMessage;
      expect(aiToolCallMessage.id).toBe('ai-error-tool-call');
      expect(aiToolCallMessage.duration).toBe(1); // Should be 1 to gray out immediately
      expect(aiToolCallMessage.metadata?.containsToolCall).toBe(true);

      // Verify error message was added to agent history
      expect(handlerContext.agent.messages.length).toBe(2); // tool_call + error_result
      const errorResultMessage = handlerContext.agent.messages[1] as AgentInstanceMessage;
      expect(errorResultMessage.role).toBe('assistant'); // Changed from 'user' to 'assistant'
      expect(errorResultMessage.content).toContain('<functions_result>');
      expect(errorResultMessage.content).toContain('Error:');
      expect(errorResultMessage.content).toContain('does not exist');
      expect(errorResultMessage.metadata?.isToolResult).toBe(true);
      expect(errorResultMessage.metadata?.isError).toBe(true);
      expect(errorResultMessage.metadata?.isPersisted).toBe(false); // Should be false initially
      expect(errorResultMessage.duration).toBe(1); // Now uses configurable toolResultDuration (default 1)
    });

    it('should not modify duration of unrelated messages', async () => {
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

    it('should skip execution when no tool call is detected', async () => {
      const handlerCtx = {
        agent: {
          id: 'test-agent',
          agentDefId: 'test-agent-def',
          messages: [],
          status: { state: 'working' as const, modified: new Date() },
          created: new Date(),
        } as AgentInstance,
        agentDef: { id: 'test-agent-def', name: 'test' } as AgentDefinition,
        isCancelled: () => false,
      };

      const context: AIResponseContext = {
        handlerContext: handlerCtx,
        pluginConfig: { id: 'test-plugin', pluginId: 'wikiSearch' } as IPromptConcatPlugin,
        response: { requestId: 'test-request-345', content: 'Just a regular response without any tool calls', status: 'done' },
        requestId: 'test-request',
        isFinal: true,
      };

      const hooks = createHandlerHooks();
      wikiSearchPlugin(hooks);

      await hooks.responseComplete.promise(context);

      // Context should not be modified
      expect(context.actions).toBeUndefined();
    });
  });

  describe('Message Persistence Integration', () => {
    it('should work with messageManagementPlugin for complete persistence flow', async () => {
      // This test ensures wikiSearchPlugin works well with messageManagementPlugin
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
              id: 'ai-tool-msg',
              role: 'assistant' as const,
              content: '<tool_use name="wiki-search">{"workspaceName": "Test Wiki 1", "filter": "[tag[test]]"}</tool_use>',
              agentId: 'test-agent',
              contentType: 'text/plain',
              modified: new Date(),
              duration: undefined,
            },
          ],
        },
        agentDef: { id: 'test-agent-def', name: 'test' },
        isCancelled: () => false,
      };

      const response = {
        status: 'done' as const,
        content: '<tool_use name="wiki-search">{"workspaceName": "Test Wiki 1", "filter": "[tag[test]]"}</tool_use>',
        requestId: 'test-request-integration',
      };

      const context = {
        handlerContext,
        response,
        requestId: 'test-request-integration',
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
      messageManagementPlugin(hooks);

      await hooks.responseComplete.promise(context);

      // Verify integration works
      expect(context.actions.yieldNextRoundTo).toBe('self');
      expect(handlerContext.agent.messages.length).toBe(2); // original + tool result

      const toolResultMessage = handlerContext.agent.messages[1] as AgentInstanceMessage;
      expect(toolResultMessage.metadata?.isToolResult).toBe(true);
      expect(toolResultMessage.metadata?.isPersisted).toBe(true); // Should be true after messageManagementPlugin processing
    });

    it('should prevent regression: tool result not filtered in second round', async () => {
      // Root cause test to prevent regression of the original bug
      // Bug: Tool result messages were filtered out in second round due to duration=1
      const messages: AgentInstanceMessage[] = [
        {
          id: 'user-1',
          agentId: 'test',
          role: 'user',
          content: '搜索 wiki 中的 Index 条目并解释',
          modified: new Date(),
          duration: undefined,
        },
        {
          id: 'ai-tool-1',
          agentId: 'test',
          role: 'assistant',
          content: '<tool_use name="wiki-search">{workspaceName:"wiki", filter:"[title[Index]]"}</tool_use>',
          modified: new Date(),
          duration: 1,
          metadata: { containsToolCall: true, toolId: 'wiki-search' },
        },
        {
          id: 'tool-result-1',
          agentId: 'test',
          role: 'assistant',
          content: '<functions_result>\nTool: wiki-search\nResult: Found Index page...\n</functions_result>',
          modified: new Date(),
          duration: 1,
          metadata: { isToolResult: true, toolId: 'wiki-search' },
        },
      ];

      // Test duration filtering - this is where the bug was
      const { filterMessagesByDuration } = await import('../../utilities/messageDurationFilter');
      const filtered = filterMessagesByDuration(messages);

      // Root cause: Both tool call and tool result should be included for proper AI context
      expect(filtered.length).toBe(3); // user + tool call + tool result
      expect(filtered.some((m: AgentInstanceMessage) => m.metadata?.containsToolCall)).toBe(true);
      expect(filtered.some((m: AgentInstanceMessage) => m.metadata?.isToolResult)).toBe(true);
    });
  });
});
