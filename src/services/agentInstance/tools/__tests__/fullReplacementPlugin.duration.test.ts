/**
 * Tests for Full Replacement plugin duration mechanism
 * Tests that expired messages (with duration) are filtered out from AI context
 * Based on real configuration from taskAgents.json
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentInstanceMessage } from '../../interface';
import type { IPromptConcatTool } from '../../promptConcat/promptConcatSchema';
import type { IPrompt } from '../../promptConcat/promptConcatSchema/prompts';

import { cloneDeep } from 'lodash';
import defaultAgents from '../../agentFrameworks/taskAgents.json';
import { createAgentFrameworkHooks, PromptConcatHookContext } from '../index';
import { fullReplacementTool } from '../prompt';

// Use the real agent config
const exampleAgent = defaultAgents[0];
const realhandlerConfig = exampleAgent.handlerConfig;

describe('Full Replacement Plugin - Duration Mechanism', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('History Source Type with Duration Filtering', () => {
    it('should filter out expired messages (duration=1) from historyOfSession', async () => {
      // Find the real fullReplacement plugin for history from taskAgents.json
      const historyPlugin = realhandlerConfig.plugins.find(
        p => p.toolId === 'fullReplacement' && p.fullReplacementParam?.sourceType === 'historyOfSession',
      );
      expect(historyPlugin).toBeDefined();
      expect(historyPlugin!.fullReplacementParam!.targetId).toBe('default-history'); // Real target ID

      // Use real prompts structure from taskAgents.json
      const testPrompts = cloneDeep(realhandlerConfig.prompts) as IPrompt[];

      const messages: AgentInstanceMessage[] = [
        // Message 0: User message, no duration - should be included
        {
          id: 'user-msg-1',
          role: 'user' as const,
          content: 'Hello, help me search for something',
          agentId: 'test-agent',
          contentType: 'text/plain',
          modified: new Date(),
          duration: undefined, // No duration, should be included
        },
        // Message 1: AI tool call message, duration=1 - should be filtered out
        {
          id: 'ai-tool-call-msg',
          role: 'assistant' as const,
          content: '<tool_use name="wiki-search">{"workspaceName": "Test Wiki", "filter": "[tag[test]]"}</tool_use>',
          agentId: 'test-agent',
          contentType: 'text/plain',
          modified: new Date(),
          duration: 1, // Should be filtered out because it's expired
          metadata: {
            containsToolCall: true,
            toolId: 'wiki-search',
          },
        },
        // Message 2: Tool result message, duration=1 - should be filtered out
        {
          id: 'tool-result-msg',
          role: 'user' as const,
          content: '<functions_result>Tool: wiki-search\\nResult: Found some content</functions_result>',
          agentId: 'test-agent',
          contentType: 'text/plain',
          modified: new Date(),
          duration: 1, // Should be filtered out because it's expired
          metadata: {
            isToolResult: true,
            toolId: 'wiki-search',
          },
        },
        // Message 3: AI response after tool - should be included
        {
          id: 'ai-response-msg',
          role: 'assistant' as const,
          content: 'Based on the search results, here is the information you requested...',
          agentId: 'test-agent',
          contentType: 'text/plain',
          modified: new Date(),
          duration: undefined, // No duration, should be included
        },
        // Message 4: Latest user message - should be included but will be removed by fullReplacement
        {
          id: 'user-msg-2',
          role: 'user' as const,
          content: 'Can you tell me more about this?',
          agentId: 'test-agent',
          contentType: 'text/plain',
          modified: new Date(),
          duration: undefined, // No duration, should be included
        },
      ];

      const context: PromptConcatHookContext = {
        agentFrameworkContext: {
          agent: {
            id: 'test-agent',
            messages,
            agentDefId: 'test-agent-def',
            status: { state: 'working' as const, modified: new Date() },
            created: new Date(),
          },
          agentDef: { id: 'test-agent-def', name: 'test', handlerConfig: {} },
          isCancelled: () => false,
        },
        toolConfig: historyPlugin! as unknown as IPromptConcatTool, // Type cast due to JSON import limitations
        prompts: testPrompts,
        messages,
      };

      const hooks = createAgentFrameworkHooks();
      fullReplacementTool(hooks);

      // Execute the processPrompts hook
      await hooks.processPrompts.promise(context);

      // Find the target prompt that should be replaced (using real target ID from config)
      const targetId = historyPlugin!.fullReplacementParam!.targetId; // 'default-history'
      const historyPrompt = testPrompts.find(p => p.id === 'history');
      expect(historyPrompt).toBeDefined();

      const targetPrompt = historyPrompt!.children?.find(child => child.id === targetId);
      expect(targetPrompt).toBeDefined();

      // The fullReplacementTool puts filtered messages in children array
      // Note: fullReplacementTool removes the last message (current user message)
      const children = (targetPrompt as unknown as { children?: IPrompt[] }).children || [];
      expect(children.length).toBe(2); // Only non-expired messages (user1, ai-response), excluding last user message

      // Check the content of the children
      const childrenText = children.map((child: IPrompt) => child.text || '').join(' ');

      // Should include user messages without duration (except the last one which is removed)
      expect(childrenText).toContain('Hello, help me search for something');
      // Note: "Can you tell me more about this?" is the last message and gets removed by fullReplacement

      // Should include AI response without duration
      expect(childrenText).toContain('Based on the search results, here is the information');

      // Should NOT include expired messages (duration=1)
      expect(childrenText).not.toContain('<tool_use name="wiki-search">');
      expect(childrenText).not.toContain('<functions_result>');
    });

    it('should include messages with duration=0 (visible in current round)', async () => {
      const historyPlugin = realhandlerConfig.plugins.find(
        p => p.toolId === 'fullReplacement' && p.fullReplacementParam?.sourceType === 'historyOfSession',
      );

      const messages: AgentInstanceMessage[] = [
        {
          id: 'user-msg-1',
          role: 'user' as const,
          content: 'First message',
          agentId: 'test-agent',
          contentType: 'text/plain',
          modified: new Date(),
          duration: undefined,
        },
        {
          id: 'ai-msg-1',
          role: 'assistant' as const,
          content: 'AI response with duration 0',
          agentId: 'test-agent',
          contentType: 'text/plain',
          modified: new Date(),
          duration: 0, // Excluded from AI context but still in current round
        },
        {
          id: 'user-msg-2',
          role: 'user' as const,
          content: 'Latest message',
          agentId: 'test-agent',
          contentType: 'text/plain',
          modified: new Date(),
          duration: undefined,
        },
      ];

      const testPrompts = cloneDeep(realhandlerConfig.prompts) as IPrompt[];

      const context: PromptConcatHookContext = {
        agentFrameworkContext: {
          agent: {
            id: 'test-agent',
            messages,
            agentDefId: 'test-agent-def',
            status: { state: 'working' as const, modified: new Date() },
            created: new Date(),
          },
          agentDef: { id: 'test-agent-def', name: 'test', handlerConfig: {} },
          isCancelled: () => false,
        },
        toolConfig: historyPlugin! as unknown as IPromptConcatTool, // Type cast for JSON import
        prompts: testPrompts,
        messages,
      };

      const hooks = createAgentFrameworkHooks();
      fullReplacementTool(hooks);

      await hooks.processPrompts.promise(context);

      const targetId = historyPlugin!.fullReplacementParam!.targetId;
      const historyPrompt = testPrompts.find(p => p.id === 'history');
      const targetPrompt = historyPrompt!.children?.find(child => child.id === targetId);
      const children = (targetPrompt as unknown as { children?: IPrompt[] }).children || [];
      const childrenText = children.map((child: IPrompt) => child.text || '').join(' ');

      // Duration=0 messages are excluded from AI context by filterMessagesByDuration
      // Last message is also removed by fullReplacement
      expect(children.length).toBe(1); // Only user1 remains
      expect(childrenText).toContain('First message');
      // AI response with duration=0 should be filtered out
      expect(childrenText).not.toContain('AI response with duration 0');
    });

    it('should handle mixed duration values correctly', async () => {
      const historyPlugin = realhandlerConfig.plugins.find(
        p => p.toolId === 'fullReplacement' && p.fullReplacementParam?.sourceType === 'historyOfSession',
      );

      const messages: AgentInstanceMessage[] = [
        {
          id: 'msg-1',
          role: 'user' as const,
          content: 'Message 1 - no duration',
          agentId: 'test-agent',
          contentType: 'text/plain',
          modified: new Date(),
          duration: undefined, // Should be included
        },
        {
          id: 'msg-2',
          role: 'assistant' as const,
          content: 'Message 2 - duration 3',
          agentId: 'test-agent',
          contentType: 'text/plain',
          modified: new Date(),
          duration: 3, // Should be included (roundsFromCurrent=2 < duration=3)
        },
        {
          id: 'msg-3',
          role: 'user' as const,
          content: 'Message 3 - duration 1',
          agentId: 'test-agent',
          contentType: 'text/plain',
          modified: new Date(),
          duration: 1, // Should be included since roundsFromCurrent(0) < duration(1)
        },
        {
          id: 'msg-4',
          role: 'user' as const, // Changed to user so it gets removed by fullReplacement
          content: 'Message 4 - latest user message',
          agentId: 'test-agent',
          contentType: 'text/plain',
          modified: new Date(),
          duration: undefined, // Will be removed as last user message
        },
      ];

      const testPrompts = cloneDeep(realhandlerConfig.prompts) as IPrompt[];

      const context: PromptConcatHookContext = {
        agentFrameworkContext: {
          agent: {
            id: 'test-agent',
            messages,
            agentDefId: 'test-agent-def',
            status: { state: 'working' as const, modified: new Date() },
            created: new Date(),
          },
          agentDef: { id: 'test-agent-def', name: 'test', handlerConfig: {} },
          isCancelled: () => false,
        },
        toolConfig: historyPlugin! as unknown as IPromptConcatTool, // Type cast for JSON import
        prompts: testPrompts,
        messages,
      };

      const hooks = createAgentFrameworkHooks();
      fullReplacementTool(hooks);

      await hooks.processPrompts.promise(context);

      const targetId = historyPlugin!.fullReplacementParam!.targetId;
      const historyPrompt = testPrompts.find(p => p.id === 'history');
      const targetPrompt = historyPrompt!.children?.find(child => child.id === targetId);
      const children = (targetPrompt as unknown as { children?: IPrompt[] }).children || [];
      const childrenText = children.map((child: IPrompt) => child.text || '').join(' ');

      // Should include messages without duration and with duration values that haven't expired
      // Note: last message (msg-4) is removed by fullReplacement
      expect(children.length).toBe(3); // msg-1, msg-2, msg-3 (all within their duration windows)
      expect(childrenText).toContain('Message 1 - no duration');
      expect(childrenText).toContain('Message 2 - duration 3');
      expect(childrenText).toContain('Message 3 - duration 1'); // roundsFromCurrent(0) < duration(1)

      // Last message should be removed by fullReplacement (only if it's a user message)
      expect(childrenText).not.toContain('Message 4 - latest user message');
    });
  });

  describe('LLM Response Source Type', () => {
    it('should verify LLM response replacement config exists', () => {
      // Verify the real config has LLM response replacement
      const llmResponsePlugin = realhandlerConfig.plugins.find(
        p => p.toolId === 'fullReplacement' && p.fullReplacementParam?.sourceType === 'llmResponse',
      );
      expect(llmResponsePlugin).toBeDefined();
      expect(llmResponsePlugin!.fullReplacementParam!.targetId).toBe('default-response');
    });
  });
});
