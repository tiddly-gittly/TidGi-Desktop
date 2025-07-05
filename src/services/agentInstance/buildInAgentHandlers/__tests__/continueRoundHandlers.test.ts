import { beforeEach, describe, expect, it, vi } from 'vitest';
import { continueRoundHandlerRegistry } from '../continueRoundHandlers';
import { AgentHandlerContext } from '../type';
import { AgentPromptDescription } from '../../promptConcat/promptConcatSchema';
import { ContinueRoundResult } from '../continueRoundHandlers/types';
import { AgentInstance } from '../../interface';
import { AgentDefinition } from '@services/agentDefinition/interface';
import { container } from '@services/container';
import serviceIdentifier from '@services/serviceIdentifier';

describe('continueRoundHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('registry functionality', () => {
    it('should have default tool calling handler registered', () => {
      const handlers = continueRoundHandlerRegistry.getHandlers();
      expect(handlers).toHaveLength(1);
      expect(handlers[0].id).toBe('tool-calling');
      expect(handlers[0].enabled).toBe(true);
      expect(handlers[0].priority).toBe(100);
    });

    it('should allow registering new handlers', () => {
      const testHandler = {
        id: 'test-handler',
        handler: vi.fn().mockResolvedValue({ continue: false, reason: 'test' }),
        priority: 50,
        enabled: true,
      };

      continueRoundHandlerRegistry.register(testHandler);
      const handlers = continueRoundHandlerRegistry.getHandlers();

      // Should have 2 handlers now (default + test)
      expect(handlers).toHaveLength(2);

      // Should be sorted by priority (test handler has lower priority)
      expect(handlers[0].id).toBe('test-handler');
      expect(handlers[1].id).toBe('tool-calling');
    });

    it('should process handlers in priority order and stop at first continue', async () => {
      // Mock agent definition service
      const mockAgentDefinitionService = {
        matchToolCalling: vi.fn().mockResolvedValue({ found: false }),
      };

      vi.mocked(container.get).mockImplementation((identifier) => {
        if (identifier === serviceIdentifier.AgentDefinition) {
          return mockAgentDefinitionService;
        }
        throw new Error(`Unknown service identifier: ${String(identifier)}`);
      });

      const firstHandler = vi.fn().mockResolvedValue({ continue: false, reason: 'first-no' });
      const secondHandler = vi.fn().mockResolvedValue({ continue: true, reason: 'second-yes' });
      const thirdHandler = vi.fn().mockResolvedValue({ continue: false, reason: 'third-no' });

      continueRoundHandlerRegistry.register({
        id: 'first',
        handler: firstHandler,
        priority: 10,
        enabled: true,
      });

      continueRoundHandlerRegistry.register({
        id: 'second',
        handler: secondHandler,
        priority: 20,
        enabled: true,
      });

      continueRoundHandlerRegistry.register({
        id: 'third',
        handler: thirdHandler,
        priority: 30,
        enabled: true,
      });

      const mockContext: AgentHandlerContext = {
        agent: { id: 'test-agent', agentDefId: 'test-def', messages: [], status: { state: 'unknown' }, created: new Date() } as AgentInstance,
        agentDef: { id: 'test-def', name: 'Test Agent' } as AgentDefinition,
        isCancelled: vi.fn().mockReturnValue(false),
      };

      const result: ContinueRoundResult = await continueRoundHandlerRegistry.processContinueRound(
        { id: 'test-config', promptConfig: {} } as AgentPromptDescription,
        'test response',
        mockContext,
      );

      // Should return the second handler's result since it decided to continue
      expect(result).toEqual({ continue: true, reason: 'second-yes' });

      // First two handlers should be called, third should not
      expect(firstHandler).toHaveBeenCalledOnce();
      expect(secondHandler).toHaveBeenCalledOnce();
      expect(thirdHandler).not.toHaveBeenCalled();
    });
  });
});
