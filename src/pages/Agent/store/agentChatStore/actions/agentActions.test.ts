import { Subject } from 'rxjs';
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

describe('agentActions.subscribeToUpdates', () => {
  it('subscribes only to the newest assistant message when replaying active history', async () => {
    const agentUpdates = new Subject<unknown>();
    const messageUpdates = new Subject<unknown>();
    const subscribeToAgentUpdates = vi.fn((_: string, messageId?: string) => messageId ? messageUpdates : agentUpdates);
    const mutableObservables = window.observables as unknown as Record<string, unknown>;
    const originalAgentInstance = mutableObservables.agentInstance;
    mutableObservables.agentInstance = { subscribeToAgentUpdates };

    const state = {
      agent: undefined,
      messages: new Map(),
      orderedMessageIds: [],
      streamingMessageIds: new Set<string>(),
      setMessageStreaming: (messageId: string, isStreaming: boolean) => {
        if (isStreaming) state.streamingMessageIds.add(messageId);
        else state.streamingMessageIds.delete(messageId);
      },
    } as unknown as AgentChatStoreType;
    const set = vi.fn((
      partial:
        | Partial<AgentChatStoreType>
        | ((current: AgentChatStoreType) => Partial<AgentChatStoreType>),
    ) => {
      Object.assign(state, typeof partial === 'function' ? partial(state) : partial);
    }) as unknown as StoreApi<AgentChatStoreType>['setState'];
    const get = (() => state) as StoreApi<AgentChatStoreType>['getState'];
    const cleanup = agentActions(set, get).subscribeToUpdates('agent-1');

    agentUpdates.next({
      id: 'agent-1',
      status: { state: 'working' },
      messages: Array.from({ length: 151 }, (_, index) => ({
        messageId: `assistant-${index}`,
        role: 'assistant',
      })),
    });
    await vi.waitFor(() => {
      expect(subscribeToAgentUpdates).toHaveBeenCalledTimes(2);
    });
    expect(subscribeToAgentUpdates).toHaveBeenLastCalledWith(
      'agent-1',
      'assistant-150',
    );
    expect(state.streamingMessageIds).toEqual(new Set(['assistant-150']));

    cleanup?.();
    mutableObservables.agentInstance = originalAgentInstance;
  });
});
