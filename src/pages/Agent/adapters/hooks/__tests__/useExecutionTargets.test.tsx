import { act, renderHook, waitFor } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const coordinatorHarness = vi.hoisted(() => {
  let listener: ((snapshot: Record<string, unknown>) => void) | undefined;
  const snapshots = new Map<string, Record<string, unknown>>();
  let factoryOptions: { onRunAccepted?: (provenance: Record<string, string>, handle: Record<string, string>) => void | Promise<void> } | undefined;
  let id = 0;
  const coordinator = {
    cancel: vi.fn(async () => undefined),
    delete: vi.fn(async () => ({ ok: true })),
    dispose: vi.fn(async () => undefined),
    execute: vi.fn(async (_request?: { provenance: Record<string, string> }) => ({ runId: 'run-1' })),
    getSnapshot: vi.fn<(conversationId: string) => Record<string, unknown>>(),
    prepareProvenance: vi.fn((input: { conversationId: string; definitionId: string; turnId?: string; requestId?: string }) => ({
      conversationId: input.conversationId,
      definitionId: input.definitionId,
      turnId: input.turnId ?? `turn-${++id}`,
      requestId: input.requestId ?? `request-${++id}`,
    })),
    retry: vi.fn(async () => ({ runId: 'retry-run' })),
    stopConversation: vi.fn(),
    subscribe: vi.fn((next: (snapshot: Record<string, unknown>) => void) => {
      listener = next;
      return vi.fn();
    }),
    switchTarget: vi.fn(),
  };
  return {
    coordinator,
    emit(snapshot: Record<string, unknown>) {
      snapshots.set(String(snapshot.conversationId), snapshot);
      listener?.(snapshot);
    },
    accept: async (provenance: Record<string, string>) =>
      factoryOptions?.onRunAccepted?.(provenance, {
        runId: 'run-1',
        conversationId: provenance.conversationId,
        turnId: provenance.turnId,
        requestId: provenance.requestId,
        state: 'accepted',
      }),
    factory: vi.fn((_peerId: string, options?: typeof factoryOptions) => {
      factoryOptions = options;
      return coordinator;
    }),
    reset() {
      listener = undefined;
      snapshots.clear();
      factoryOptions = undefined;
      id = 0;
      for (const value of Object.values(coordinator)) {
        if (typeof value === 'function' && 'mockReset' in value) (value as ReturnType<typeof vi.fn>).mockReset();
      }
      coordinator.cancel.mockResolvedValue(undefined);
      coordinator.delete.mockResolvedValue({ ok: true });
      coordinator.dispose.mockResolvedValue(undefined);
      coordinator.execute.mockResolvedValue({ runId: 'run-1' });
      coordinator.getSnapshot.mockImplementation(conversationId => snapshots.get(conversationId) ?? { conversationId, generation: 0, status: 'idle', updatedAt: 1 });
      coordinator.prepareProvenance.mockImplementation((input: { conversationId: string; definitionId: string; turnId?: string; requestId?: string }) => ({
        conversationId: input.conversationId,
        definitionId: input.definitionId,
        turnId: input.turnId ?? `turn-${++id}`,
        requestId: input.requestId ?? `request-${++id}`,
      }));
      coordinator.retry.mockResolvedValue({ runId: 'retry-run' });
      coordinator.subscribe.mockImplementation((next: (snapshot: Record<string, unknown>) => void) => {
        listener = next;
        return vi.fn(() => {
          listener = undefined;
        });
      });
      coordinator.stopConversation.mockImplementation(() => undefined);
      coordinator.switchTarget.mockImplementation((conversationId: string, target: unknown) => {
        coordinatorHarness.emit({ conversationId, target, generation: 1, status: 'idle', updatedAt: 1 });
      });
      coordinatorHarness.factory.mockClear();
    },
  };
});

vi.mock('../../DesktopAgentExecutionCoordinator', () => ({
  createDesktopAgentExecutionCoordinator: coordinatorHarness.factory,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

describe('useExecutionTargets', () => {
  const mutableService = window.service as unknown as Record<string, unknown>;
  const mutableObservables = window.observables as unknown as Record<string, unknown>;
  let originalDeviceNetworkService: unknown;
  let originalDeviceNetworkObservable: unknown;
  let devices$: BehaviorSubject<unknown[]>;
  let useExecutionTargets: typeof import('../useExecutionTargets').useExecutionTargets;

  beforeEach(async () => {
    vi.resetModules();
    ({ useExecutionTargets } = await import('../useExecutionTargets'));
    coordinatorHarness.reset();
    originalDeviceNetworkService = mutableService.deviceNetwork;
    originalDeviceNetworkObservable = mutableObservables.deviceNetwork;
    devices$ = new BehaviorSubject<unknown[]>([remoteDevice()]);
    mutableService.deviceNetwork = {
      getLocalIdentity: vi.fn().mockResolvedValue({ peerId: 'peer-local' }),
    };
    mutableObservables.deviceNetwork = { devices$ };
  });

  afterEach(() => {
    mutableService.deviceNetwork = originalDeviceNetworkService;
    mutableObservables.deviceNetwork = originalDeviceNetworkObservable;
    vi.restoreAllMocks();
  });

  it('discovers targets and submits exact provenance plus portable attachment to Core', async () => {
    const { result, unmount } = renderHook(() => useExecutionTargets(agent()));
    await waitFor(() => {
      expect(result.current.executionTargets).toHaveLength(2);
    });
    expect(coordinatorHarness.factory).toHaveBeenCalledWith('peer-local', {
      onRunAccepted: expect.any(Function),
    });

    const remoteTarget = result.current.executionTargets[1]?.value;
    expect(remoteTarget).toEqual({ kind: 'remote', peerId: 'peer-remote' });
    if (!remoteTarget) throw new Error('remote target not discovered');
    await act(async () => result.current.setExecutionTarget(remoteTarget));
    const attachment = {
      kind: 'source' as const,
      filename: 'note.txt',
      mimeType: 'text/plain',
      totalBytes: 4,
      readChunk: vi.fn(),
    };
    await act(async () => result.current.sendMessage('hello', attachment, [{ workspaceName: 'Wiki', tiddlerTitle: 'One' }]));

    expect(coordinatorHarness.coordinator.switchTarget).toHaveBeenCalledWith('agent-1', { kind: 'remote', peerId: 'peer-remote' });
    expect(coordinatorHarness.coordinator.execute).toHaveBeenCalledWith({
      target: { kind: 'remote', peerId: 'peer-remote' },
      provenance: expect.objectContaining({ conversationId: 'agent-1', definitionId: 'definition-1' }),
      message: 'hello',
      attachment,
      wikiTiddlers: [{ workspaceName: 'Wiki', tiddlerTitle: 'One' }],
    });
    unmount();
  });

  it('derives running, error, and provenance only from the typed coordinator snapshot', async () => {
    const { result, unmount } = renderHook(() => useExecutionTargets(agent()));
    await waitFor(() => {
      expect(coordinatorHarness.coordinator.subscribe).toHaveBeenCalledOnce();
    });
    const error = Object.assign(new Error('remote_agent_execution_port_failure'), { code: 'PORT_FAILURE', retryable: true });
    act(() => {
      coordinatorHarness.emit({
        conversationId: 'agent-1',
        generation: 3,
        status: 'running',
        target: { kind: 'remote', peerId: 'peer-remote' },
        executionPeerId: 'peer-remote',
        operation: 'execute',
        provenance: { conversationId: 'agent-1', definitionId: 'definition-1', turnId: 'turn-1', requestId: 'request-1' },
        error,
        updatedAt: 2,
      });
    });
    expect(result.current.isRunning).toBe(true);
    expect(result.current.error).toBe(error);
    expect(result.current.provenance).toEqual(expect.objectContaining({ turnId: 'turn-1', requestId: 'request-1' }));

    act(() => {
      coordinatorHarness.emit({ conversationId: 'other-agent', generation: 1, status: 'failed', updatedAt: 3 });
    });
    expect(result.current.executionSnapshot?.conversationId).toBe('agent-1');
    unmount();
  });

  it('passes stable initial provenance unchanged and checkpoints only after durable acceptance', async () => {
    const accepted = vi.fn(async () => undefined);
    coordinatorHarness.coordinator.execute.mockImplementationOnce(async request => {
      if (!request) throw new Error('missing request');
      expect(accepted).not.toHaveBeenCalled();
      await coordinatorHarness.accept(request.provenance);
      return { runId: 'run-1' };
    });
    const { result, unmount } = renderHook(() => useExecutionTargets(agent()));
    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    await act(async () =>
      result.current.sendMessage('initial', undefined, undefined, {
        requestId: 'initial:tab-1:agent-1:request',
        turnId: 'initial:tab-1:agent-1:turn',
        onAccepted: accepted,
      })
    );

    expect(coordinatorHarness.coordinator.prepareProvenance).toHaveBeenCalledWith({
      conversationId: 'agent-1',
      definitionId: 'definition-1',
      requestId: 'initial:tab-1:agent-1:request',
      turnId: 'initial:tab-1:agent-1:turn',
    });
    expect(accepted).toHaveBeenCalledOnce();
    unmount();
  });

  it('keeps the current device if a turn starts before a device click is handled', async () => {
    const { result } = renderHook(() => useExecutionTargets(agent()));
    await waitFor(() => {
      expect(result.current.executionTargets).toHaveLength(2);
    });
    coordinatorHarness.coordinator.getSnapshot.mockReturnValue({ conversationId: 'agent-1', status: 'running' });

    await act(async () => result.current.setExecutionTarget({ kind: 'remote', peerId: 'peer-remote' }));

    expect(coordinatorHarness.coordinator.switchTarget).not.toHaveBeenCalled();
  });

  it('resumes observing the same remote run after leaving and reopening its tab', async () => {
    const { unmount } = renderHook(() => useExecutionTargets(agent()));
    await waitFor(() => {
      expect(coordinatorHarness.factory).toHaveBeenCalledOnce();
    });
    act(() => {
      coordinatorHarness.emit({
        conversationId: 'agent-1',
        target: { kind: 'remote', peerId: 'peer-remote' },
        status: 'running',
        provenance: { conversationId: 'agent-1', turnId: 'running-turn' },
      });
    });
    unmount();
    const reopened = renderHook(() => useExecutionTargets(agent()));
    await waitFor(() => {
      expect(reopened.result.current.isRunning).toBe(true);
    });
    expect(reopened.result.current.activeExecutionTarget).toEqual({ kind: 'remote', peerId: 'peer-remote' });
    expect(coordinatorHarness.factory).toHaveBeenCalledOnce();
    expect(coordinatorHarness.coordinator.stopConversation).not.toHaveBeenCalled();
    expect(coordinatorHarness.coordinator.dispose).not.toHaveBeenCalled();
    await act(async () => reopened.result.current.cancelSelectedTarget());
    expect(coordinatorHarness.coordinator.cancel).toHaveBeenCalledWith(expect.objectContaining({
      target: { kind: 'remote', peerId: 'peer-remote' },
      provenance: expect.objectContaining({ turnId: 'running-turn' }),
    }));
  });

  it('submits on the local device when pairing discovery has no devices', async () => {
    devices$.next([]);
    const { result } = renderHook(() => useExecutionTargets(agent()));
    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
    await act(async () => result.current.sendMessage('local message'));
    expect(coordinatorHarness.coordinator.execute).toHaveBeenCalledWith(expect.objectContaining({
      target: { kind: 'local' },
      message: 'local message',
    }));
  });
});

function agent() {
  return { agentDefId: 'definition-1', id: 'agent-1', name: 'Agent' } as never;
}

function remoteDevice() {
  return {
    capabilities: { agentLoop: true },
    displayName: 'Remote Mac',
    peerId: 'peer-remote',
    platform: 'desktop',
    reachability: { paths: [], state: 'online' },
    trusted: true,
  };
}
