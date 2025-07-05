/* eslint-disable @typescript-eslint/require-await */
import { mockServiceInstances } from '@/__tests__/setup-vitest';
import type { AgentDefinition } from '@services/agentDefinition/interface';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentInstance, AgentInstanceMessage } from '../../interface';
import { processResponse } from '../../promptConcat/handlers/responseHandler';
import { basicPromptConcatHandler } from '../basicPromptConcatHandler';
import { continueRoundHandler } from '../continueRoundHandlers';
import type { AgentHandlerContext } from '../type';

// Mock the specific modules we need to control
vi.mock('../continueRoundHandlers', () => ({
  continueRoundHandler: vi.fn(),
}));

vi.mock('../../promptConcat/handlers/responseHandler', () => ({
  processResponse: vi.fn(),
}));

describe('basicPromptConcatHandler', () => {
  let mockContext: AgentHandlerContext;
  let mockAgent: AgentInstance;
  let mockAgentDefinition: AgentDefinition;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up basic agent and context
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

    mockAgentDefinition = {
      id: 'def-1',
      handlerID: 'basicPromptConcat',
      aiApiConfig: {},
      handlerConfig: {},
    } as AgentDefinition;

    mockContext = {
      agent: mockAgent,
      agentDef: mockAgentDefinition,
      isCancelled: vi.fn().mockReturnValue(false),
    };

    // Set up default mock behaviors
    vi.mocked(continueRoundHandler).mockResolvedValue({
      continue: false,
      reason: 'Default: no continuation needed',
    });

    vi.mocked(processResponse).mockResolvedValue({
      processedResponse: 'Default processed response',
      needsNewLLMCall: false,
    });
  });

  describe('single round conversation', () => {
    it('should handle simple AI response without continuation', async () => {
      const mockResponse = {
        status: 'done' as const,
        content: 'Hello! I am doing well, thank you for asking.',
        requestId: 'req-1',
      };

      // Mock AI generation using the shared service instances
      mockServiceInstances.externalAPI.generateFromAI = vi.fn().mockImplementation(async function*() {
        yield mockResponse;
      });

      // Mock continue round handler to not continue
      vi.mocked(continueRoundHandler).mockResolvedValue({
        continue: false,
        reason: 'No continuation needed',
      });

      // Mock response processing
      vi.mocked(processResponse).mockResolvedValue({
        processedResponse: 'Hello! I am doing well, thank you for asking.',
        needsNewLLMCall: false,
      });

      // Execute handler
      const generator = basicPromptConcatHandler(mockContext);
      const results = [];
      for await (const result of generator) {
        results.push(result);
      }

      // Verify results
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        state: 'completed',
        message: {
          content: 'Hello! I am doing well, thank you for asking.',
          role: 'agent',
        },
      });

      // Verify mocks called
      expect(mockServiceInstances.externalAPI.generateFromAI).toHaveBeenCalledOnce();
      expect(continueRoundHandler).toHaveBeenCalledOnce();
      expect(processResponse).toHaveBeenCalledOnce();
    });

    it('should handle cancellation before AI generation', async () => {
      // Mock cancellation
      mockContext.isCancelled = vi.fn().mockReturnValue(true);

      // Execute handler
      const generator = basicPromptConcatHandler(mockContext);
      const results = [];
      for await (const result of generator) {
        results.push(result);
      }

      // Should return cancelled immediately
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        state: 'canceled',
      });

      // Should not call AI service
      expect(mockServiceInstances.externalAPI.generateFromAI).not.toHaveBeenCalled();
    });

    it('should handle missing user message', async () => {
      // Mock agent with no user messages
      mockContext.agent.messages = [
        {
          id: 'msg-1',
          agentId: 'agent-1',
          role: 'assistant',
          content: 'System message',
          contentType: 'text/plain',
          modified: new Date(),
        },
      ];

      // Execute handler
      const generator = basicPromptConcatHandler(mockContext);
      const results = [];
      for await (const result of generator) {
        results.push(result);
      }

      // Should return completed with error message
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        state: 'completed',
        message: {
          content: 'No user message found to process.',
          role: 'agent',
        },
      });
    });

    it('should handle AI generation errors', async () => {
      const mockErrorResponse = {
        status: 'error' as const,
        content: '',
        requestId: 'req-1',
        errorDetail: {
          message: 'API rate limit exceeded',
          code: 'RATE_LIMIT',
          name: 'RateLimitError',
          provider: 'test-provider',
        },
      };

      mockServiceInstances.externalAPI.generateFromAI = vi.fn().mockImplementation(async function*() {
        yield mockErrorResponse;
      });

      // Execute handler
      const generator = basicPromptConcatHandler(mockContext);
      const results = [];
      for await (const result of generator) {
        results.push(result);
      }

      // Verify error result
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        state: 'completed',
        message: {
          content: 'Error: API rate limit exceeded',
          metadata: {
            errorDetail: {
              code: 'RATE_LIMIT',
              message: 'API rate limit exceeded',
            },
          },
          role: 'agent',
        },
      });
    });
  });

  describe('multi-round conversation', () => {
    it('should handle continue round when tool calling is detected', async () => {
      const firstResponse = {
        status: 'done' as const,
        content: 'I will search for information.',
        requestId: 'req-1',
      };

      const secondResponse = {
        status: 'done' as const,
        content: 'Based on the search results, here is your answer.',
        requestId: 'req-2',
      };

      let callCount = 0;
      mockServiceInstances.externalAPI.generateFromAI = vi.fn().mockImplementation(async function*() {
        if (callCount === 0) {
          callCount++;
          yield firstResponse;
        } else {
          yield secondResponse;
        }
      });

      // First call continues, second call doesn't
      let continueCallCount = 0;
      vi.mocked(continueRoundHandler).mockImplementation(async () => {
        if (continueCallCount === 0) {
          continueCallCount++;
          return {
            continue: true,
            reason: 'Tool calling detected',
          };
        } else {
          return {
            continue: false,
            reason: 'No more tools needed',
          };
        }
      });

      // Process response calls - only called when continue=false
      vi.mocked(processResponse).mockResolvedValue({
        processedResponse: 'Based on the search results, here is your answer.',
        needsNewLLMCall: false,
      });

      // Execute handler
      const generator = basicPromptConcatHandler(mockContext);
      const results = [];
      for await (const result of generator) {
        results.push(result);
      }

      // Should have working status from first round and completed from second
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        state: 'working',
        message: {
          content: 'I will search for information.',
          role: 'agent',
        },
      });
      expect(results[1]).toMatchObject({
        state: 'completed',
        message: {
          content: 'Based on the search results, here is your answer.',
          role: 'agent',
        },
      });

      // Both continue round handler calls should have happened
      expect(continueRoundHandler).toHaveBeenCalledTimes(2);
      expect(mockServiceInstances.externalAPI.generateFromAI).toHaveBeenCalledTimes(2);
    });

    it('should respect max retry limit', async () => {
      const mockResponse = {
        status: 'done' as const,
        content: 'Tool calling response',
        requestId: 'req-1',
      };

      // Mock to always continue (simulating infinite tool calling)
      mockServiceInstances.externalAPI.generateFromAI = vi.fn().mockImplementation(async function*() {
        yield mockResponse;
      });

      vi.mocked(continueRoundHandler).mockResolvedValue({
        continue: true,
        reason: 'Tool calling detected',
      });

      vi.mocked(processResponse).mockResolvedValue({
        processedResponse: 'Tool calling response',
        needsNewLLMCall: false,
      });

      // Execute handler
      const generator = basicPromptConcatHandler(mockContext);
      const results = [];
      for await (const result of generator) {
        results.push(result);
      }

      // Should stop after max retries - check that we get final completed result
      const completedResults = results.filter((r) => r.state === 'completed');
      expect(completedResults).toHaveLength(1);

      // Should have called continue handler multiple times but stopped at limit (3 retries + 1 initial = 4)
      expect(continueRoundHandler).toHaveBeenCalledTimes(4);
    });

    it('should handle working status updates during generation', async () => {
      const mockResponses = [
        {
          status: 'update' as const,
          content: 'Thinking...',
          requestId: 'req-1',
        },
        {
          status: 'done' as const,
          content: 'Hello! I am doing well, thank you for asking.',
          requestId: 'req-1',
        },
      ];

      mockServiceInstances.externalAPI.generateFromAI = vi.fn().mockImplementation(async function*() {
        for (const response of mockResponses) {
          yield response;
        }
      });

      vi.mocked(continueRoundHandler).mockResolvedValue({
        continue: false,
        reason: 'No continuation needed',
      });

      vi.mocked(processResponse).mockResolvedValue({
        processedResponse: 'Hello! I am doing well, thank you for asking.',
        needsNewLLMCall: false,
      });

      // Execute handler
      const generator = basicPromptConcatHandler(mockContext);
      const results = [];
      for await (const result of generator) {
        results.push(result);
      }

      // Verify results - should have working and completed status
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        state: 'working',
        message: {
          content: 'Thinking...',
          role: 'agent',
        },
      });
      expect(results[1]).toMatchObject({
        state: 'completed',
        message: {
          content: 'Hello! I am doing well, thank you for asking.',
          role: 'agent',
        },
      });
    });
  });

  describe('cancellation handling', () => {
    it('should handle cancellation during AI generation', async () => {
      let isCancelled = false;
      mockContext.isCancelled = vi.fn().mockImplementation(() => isCancelled);

      mockServiceInstances.externalAPI.generateFromAI = vi.fn().mockImplementation(async function*() {
        // Simulate cancellation happening during generation
        isCancelled = true;
        yield {
          status: 'update' as const,
          content: 'Generating...',
          requestId: 'req-1',
        };
      });

      // Execute handler
      const generator = basicPromptConcatHandler(mockContext);
      const results = [];
      for await (const result of generator) {
        results.push(result);
      }

      // Should return cancelled
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        state: 'canceled',
      });

      // Should attempt to cancel AI request
      expect(mockServiceInstances.externalAPI.cancelAIRequest).toHaveBeenCalledWith('req-1');
    });
  });

  describe('error handling', () => {
    it('should handle unexpected errors', async () => {
      // Mock service to throw error
      mockServiceInstances.workspace.concatPrompt = vi.fn().mockRejectedValue(
        new Error('Service unavailable'),
      );

      // Execute handler
      const generator = basicPromptConcatHandler(mockContext);
      const results = [];
      for await (const result of generator) {
        results.push(result);
      }

      // Should return completed with error message
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        state: 'completed',
        message: {
          content: 'Unexpected error: Service unavailable',
          role: 'agent',
        },
      });
    });
  });
});
