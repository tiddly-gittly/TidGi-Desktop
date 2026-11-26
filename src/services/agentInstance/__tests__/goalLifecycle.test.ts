import { describe, expect, it, vi } from 'vitest';
import * as repo from '../agentRepository';
import { AgentInstanceService } from '../index';
import * as mcp from '../tools/modelContextProtocol';
import * as scheduling from '../tools/scheduledTaskManager';

describe('AgentInstance goal lifecycle', () => {
  it('awaits goal suspension before stopping the durable runtime', async () => {
    const pending = Promise.withResolvers<undefined>();
    const suspend = vi.fn(() => pending.promise);
    const stopRuntime = vi.fn().mockResolvedValue(undefined);
    const service = new AgentInstanceService();
    Object.assign(service, { goalCoordinator: { suspend }, memeLoopRuntime: { dispose: stopRuntime } });
    const disposing = service.dispose();
    expect(suspend).toHaveBeenCalledOnce();
    expect(stopRuntime).not.toHaveBeenCalled();
    pending.resolve(undefined);
    await disposing;
    expect(stopRuntime).toHaveBeenCalledOnce();
  });

  it('pauses continuation before cancelling a run selected by the renderer or RPC', async () => {
    const order: string[] = [];
    const pauseConversation = vi.fn(async () => {
      order.push('pause');
    });
    const runtime = {
      getRunStatus: vi.fn().mockResolvedValue({ conversationId: 'conversation' }),
      cancelRun: vi.fn(async () => {
        order.push('cancel');
        return true;
      }),
    };
    const service = new AgentInstanceService();
    Object.assign(service, { goalCoordinator: { pauseConversation }, getDurableAgentRuntime: vi.fn().mockResolvedValue(runtime) });
    await expect(service.cancelAgentRun('run')).resolves.toBe(true);
    expect(pauseConversation).toHaveBeenCalledWith('conversation');
    expect(order).toEqual(['pause', 'cancel']);
  });

  it.each(['cancelAgent', 'closeAgent', 'deleteAgent'] as const)('%s persists pause before cancelling the conversation', async method => {
    const order: string[] = [];
    const pauseConversation = vi.fn(async () => {
      order.push('pause');
    });
    const cancelAgent = vi.fn(async () => {
      order.push('cancel');
    });
    const service = new AgentInstanceService();
    Object.assign(service, {
      goalCoordinator: { pauseConversation },
      getDurableAgentRuntime: vi.fn().mockResolvedValue({ cancelAgent }),
      ensureRepositories: vi.fn(),
      agentInstanceRepository: {
        findOne: vi.fn().mockResolvedValue({ id: 'conversation', closed: false }),
        save: vi.fn().mockResolvedValue(undefined),
      },
      agentMessageRepository: {},
    });
    const stopHeartbeat = vi.spyOn(scheduling, 'stopHeartbeat').mockImplementation(() => {});
    const cancelTasks = vi.spyOn(scheduling, 'cancelTasksForAgent').mockResolvedValue(undefined);
    const cleanupMCP = vi.spyOn(mcp, 'cleanupMCPClient').mockResolvedValue(undefined);
    const deleteAgent = vi.spyOn(repo, 'deleteAgent').mockResolvedValue(undefined);
    try {
      await service[method]('conversation');
      expect(pauseConversation).toHaveBeenCalledWith('conversation');
      expect(order).toEqual(['pause', 'cancel']);
    } finally {
      stopHeartbeat.mockRestore();
      cancelTasks.mockRestore();
      cleanupMCP.mockRestore();
      deleteAgent.mockRestore();
    }
  });

  it('reports a successful stop when goal pause has already cancelled the selected run', async () => {
    const service = new AgentInstanceService();
    Object.assign(service, {
      goalCoordinator: { pauseConversation: vi.fn().mockResolvedValue({ status: 'paused', pendingRound: { runId: 'run' } }) },
      getDurableAgentRuntime: vi.fn().mockResolvedValue({
        getRunStatus: vi.fn().mockResolvedValue({ conversationId: 'conversation' }),
        cancelRun: vi.fn().mockResolvedValue(false),
      }),
    });
    await expect(service.cancelAgentRun('run')).resolves.toBe(true);
  });
});
