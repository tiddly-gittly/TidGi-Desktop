// @vitest-environment node
import { container } from '@services/container';
import type { ToolExecutionResult } from 'memeloop';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentInstanceService } from '../../index';
import { spawnAgentDefinition } from '../spawnAgent';

const childService = {
  createAgent: vi.fn(),
  updateAgent: vi.fn(),
  executeLocalAgentMessage: vi.fn(),
  getAgentStorageFullContentMessagePage: vi.fn(),
};

type SpawnParameters = { task: string; context?: string; agentDefinitionId?: string };

async function spawn(signal: AbortSignal, timeoutMs = 120000): Promise<ToolExecutionResult | undefined> {
  let result: ToolExecutionResult | undefined;
  await spawnAgentDefinition.onResponseComplete?.({
    toolCall: { found: true, toolId: 'spawn-agent' },
    agentFrameworkContext: { agent: { id: 'parent' }, agentDef: { id: 'definition' }, operationSignal: signal },
    config: { defaultTimeoutMs: timeoutMs },
    executeToolCall: async (
      _name: string,
      executor: (parameters: SpawnParameters, signal: AbortSignal) => Promise<ToolExecutionResult>,
    ) => {
      result = await executor({ task: 'Summarize the supplied notes', context: 'A short note' }, signal);
      return true;
    },
  } as never);
  return result;
}

describe('spawn-agent cancellation', () => {
  beforeEach(() => {
    vi.spyOn(container, 'get').mockReturnValue(childService);
    childService.createAgent.mockResolvedValue({ id: 'child' });
    childService.updateAgent.mockResolvedValue(undefined);
    childService.executeLocalAgentMessage.mockResolvedValue({ state: 'completed', turnId: 'child-turn' });
    childService.getAgentStorageFullContentMessagePage.mockResolvedValue({
      items: [{ role: 'assistant', turnId: 'child-turn', content: 'Summary' }],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  it('returns the completed child output and execution identity', async () => {
    expect(await spawn(new AbortController().signal)).toEqual({
      success: true,
      data: 'Summary',
      metadata: { childAgentId: 'child', state: 'completed', turnId: 'child-turn' },
    });
    expect(childService.createAgent).toHaveBeenCalledWith('definition', { volatile: true });
    expect(childService.executeLocalAgentMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        provenance: expect.objectContaining({ conversationId: 'child', definitionId: 'definition' }),
        message: 'Summarize the supplied notes\n\n<context>\nA short note\n</context>',
      }),
      { signal: expect.any(AbortSignal) },
    );
  });

  it('forwards parent cancellation during execution with its original reason', async () => {
    const parent = new AbortController();
    const reason = new Error('User stopped the parent');
    const started = Promise.withResolvers<undefined>();
    const unsubscribe = vi.fn();
    const runtime = {
      subscribeToUpdates: vi.fn().mockReturnValue(unsubscribe),
      sendMessage: vi.fn().mockResolvedValue({ runId: 'child-run' }),
      getRunStatus: vi.fn(async () => {
        started.resolve(undefined);
        return { state: 'running' };
      }),
      cancelRun: vi.fn().mockResolvedValue(undefined),
    };
    const service = Object.create(AgentInstanceService.prototype) as AgentInstanceService;
    const updateStatus = vi.fn().mockResolvedValue(undefined);
    Object.assign(service, {
      deviceNetworkService: { getLocalIdentity: vi.fn().mockResolvedValue({ peerId: 'local' }) },
      agentDefinitionService: { getAgentDef: vi.fn().mockResolvedValue({ id: 'definition' }) },
      getAgentMetadata: vi.fn().mockResolvedValue({ id: 'child', agentDefId: 'definition', volatile: true }),
      getAgentMessage: vi.fn().mockResolvedValue(undefined),
      createAgentDeviceRpcRunTurn: vi.fn().mockResolvedValue({ conversationId: 'child', definitionId: 'definition' }),
      captureBeforeTurnCommitMap: vi.fn().mockResolvedValue({}),
      updateAgentStatusBestEffort: updateStatus,
      getDurableAgentRuntime: vi.fn().mockResolvedValue(runtime),
      activeDurableRunIds: new Map(),
    });
    childService.executeLocalAgentMessage.mockImplementation(
      service.executeLocalAgentMessage.bind(service),
    );

    const result = spawn(parent.signal);
    await started.promise;
    const childSignal = childService.executeLocalAgentMessage.mock.calls[0][1].signal as AbortSignal;
    expect(childSignal.aborted).toBe(false);
    parent.abort(reason);

    expect(await result).toEqual({ success: false, error: 'Failed to spawn sub-agent: User stopped the parent' });
    expect(childSignal.aborted).toBe(true);
    expect(childSignal.reason).toBe(reason);
    expect(runtime.cancelRun).toHaveBeenCalledWith('child-run');
    expect(updateStatus).toHaveBeenLastCalledWith('child', expect.objectContaining({ state: 'canceled' }));
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(childService.getAgentStorageFullContentMessagePage).not.toHaveBeenCalled();
  });

  it('retains the child timeout while its parent continues', async () => {
    const parent = new AbortController();
    const timeout = new AbortController();
    const reason = new DOMException('The operation timed out', 'TimeoutError');
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
    const started = Promise.withResolvers<undefined>();
    let childSignal: AbortSignal | undefined;
    childService.executeLocalAgentMessage.mockImplementation(
      (_request: unknown, { signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          childSignal = signal;
          signal.addEventListener('abort', () => {
            reject(signal.reason as Error);
          }, { once: true });
          started.resolve(undefined);
        }),
    );

    const result = spawn(parent.signal, 45000);
    await started.promise;
    timeout.abort(reason);

    expect(await result).toEqual({ success: false, error: 'Failed to spawn sub-agent: The operation timed out' });
    expect(AbortSignal.timeout).toHaveBeenCalledWith(45000);
    expect(childSignal?.reason).toBe(reason);
    expect(parent.signal.aborted).toBe(false);
    expect(childService.getAgentStorageFullContentMessagePage).not.toHaveBeenCalled();
  });

  it('skips child creation when the parent has already stopped', async () => {
    const parent = new AbortController();
    parent.abort();

    expect(await spawn(parent.signal)).toBeUndefined();
    expect(childService.createAgent).not.toHaveBeenCalled();
  });

  it.each(['createAgent', 'updateAgent'] as const)('observes cancellation while awaiting %s before dispatch', async (preparation) => {
    const parent = new AbortController();
    const ready = Promise.withResolvers<undefined>();
    const pending = Promise.withResolvers<{ id: string }>();
    childService[preparation].mockImplementation(() => {
      ready.resolve(undefined);
      return pending.promise;
    });
    const result = spawn(parent.signal);
    await ready.promise;
    parent.abort(new Error('Stopped during preparation'));
    pending.resolve({ id: 'child' });

    expect(await result).toEqual({ success: false, error: 'Failed to spawn sub-agent: Stopped during preparation' });
    expect(childService.executeLocalAgentMessage).not.toHaveBeenCalled();
  });
});
