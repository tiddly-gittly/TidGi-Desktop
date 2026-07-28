import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';

import type { AgentChatStoreType, AgentWithoutMessages } from '../types';
import { agentActions } from './agentActions';

describe('agentActions.cancelAgent', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('releases loading and streaming state before waiting for the backend', async () => {
    vi.useFakeTimers();
    let resolveBackendCancel: (() => void) | undefined;
    const backendCancel = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveBackendCancel = resolve;
        }),
    );
    const mutableService = window.service as unknown as Record<string, unknown>;
    const originalAgentInstance = mutableService.agentInstance;
    mutableService.agentInstance = { cancelAgent: backendCancel };
    const state = {
      agent: { id: 'agent-1' } as AgentWithoutMessages,
      isCancelling: false,
      loading: true,
      streamingMessageIds: new Set(['assistant-message']),
    } as AgentChatStoreType;
    const set = vi.fn((partial: Partial<AgentChatStoreType>) => {
      Object.assign(state, partial);
    }) as unknown as StoreApi<AgentChatStoreType>['setState'];
    const get = (() => state) as StoreApi<AgentChatStoreType>['getState'];
    const cancelPromise = agentActions(set, get).cancelAgent();

    expect(backendCancel).toHaveBeenCalledWith('agent-1');
    expect(state.loading).toBe(false);
    expect(state.streamingMessageIds.size).toBe(0);
    expect(state.isCancelling).toBe(true);

    resolveBackendCancel?.();
    await cancelPromise;
    await vi.advanceTimersByTimeAsync(1000);

    expect(state.isCancelling).toBe(false);
    mutableService.agentInstance = originalAgentInstance;
  });
});
