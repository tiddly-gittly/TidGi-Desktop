import { act, renderHook, waitFor } from '@testing-library/react';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useExecutionTargets } from '../useExecutionTargets';

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

  beforeEach(() => {
    originalDeviceNetworkService = mutableService.deviceNetwork;
    originalDeviceNetworkObservable = mutableObservables.deviceNetwork;
  });

  afterEach(() => {
    mutableService.deviceNetwork = originalDeviceNetworkService;
    mutableObservables.deviceNetwork = originalDeviceNetworkObservable;
    vi.restoreAllMocks();
  });

  it('discovers remote agent devices and routes messages to the selected peer', async () => {
    const devices$ = new Subject<unknown[]>();
    const sendRpc = vi.fn().mockResolvedValue({});
    mutableService.deviceNetwork = {
      getLocalDevice: vi.fn().mockResolvedValue({ peerId: 'peer-local' }),
      listDevices: vi.fn().mockResolvedValue([{
        capabilities: { agentLoop: true },
        displayName: 'Remote Mac',
        peerId: 'peer-remote',
        platform: 'desktop',
        reachability: { paths: [], state: 'online' },
        trusted: true,
      }]),
      sendRpc,
      start: vi.fn().mockResolvedValue(undefined),
      syncWithDevice: vi.fn().mockResolvedValue(undefined),
    };
    mutableObservables.deviceNetwork = { devices$ };
    const sendLocalMessage = vi.fn().mockResolvedValue(undefined);

    const { result, unmount } = renderHook(() =>
      useExecutionTargets({
        agent: {
          agentDefId: 'definition-1',
          id: 'agent-1',
          name: 'Agent',
        } as never,
        cancelLocalAgent: vi.fn().mockResolvedValue(undefined),
        deleteTurn: vi.fn().mockResolvedValue(undefined),
        fetchAgent: vi.fn().mockResolvedValue(undefined),
        orderedMessages: [],
        sendLocalMessage,
        tabTitle: 'Conversation',
      })
    );

    await waitFor(() => {
      expect(result.current.executionTargets).toHaveLength(2);
    });
    expect(result.current.executionTargets[0].label).toBe('Chat.ExecutionTarget.ThisDevice');

    await act(async () => {
      await result.current.setExecutionTarget('peer:peer-remote');
    });
    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect(sendRpc).toHaveBeenCalledWith(
      'peer-remote',
      'memeloop.agent.runTurn',
      expect.objectContaining({ message: 'hello' }),
    );
    expect(sendLocalMessage).not.toHaveBeenCalled();

    unmount();
  });
});
