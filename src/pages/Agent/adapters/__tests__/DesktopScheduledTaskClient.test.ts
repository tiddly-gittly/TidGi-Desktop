import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDesktopScheduledTaskClient } from '../DesktopScheduledTaskClient';

if (!('service' in window)) {
  Object.defineProperty(window, 'service', { configurable: true, writable: true, value: {} });
}
const mutableService = window.service as unknown as Record<string, unknown>;
const originalAgentInstance = mutableService.agentInstance;
const originalDeviceNetwork = mutableService.deviceNetwork;

const remoteTask = {
  id: 'task-remote',
  agentInstanceId: 'agent-1',
  agentDefinitionId: 'definition-1',
  name: 'Remote schedule',
  schedule: { kind: 'cron' as const, expression: '0 9 * * *' },
  payload: { message: 'wake' },
  enabled: true,
  createdBy: 'settings-ui',
  updatedAt: '2026-08-31T00:00:00.000Z',
  state: 'active' as const,
  executionNodeId: 'peer-remote',
  executionNodeLabel: 'Remote Mac',
  originNodeId: 'peer-local',
  runCount: 4,
  consecutiveFailures: 1,
  executionRevision: 7,
  occurrenceId: 'occurrence-7',
  occurrenceScheduledFor: '2026-09-01T01:00:00.000Z',
  occurrenceAttempt: 2,
};

const localWireTask = {
  ...remoteTask,
  id: 'task-local',
  name: 'Local schedule',
  executionNodeId: 'peer-local',
};

function createAgentInstanceService(overrides: Record<string, unknown> = {}) {
  return {
    listScheduledTasksForAgent: vi.fn().mockResolvedValue({
      items: [],
      hasMoreAfter: false,
      partial: false,
      sources: [{ executionNodeId: 'peer-local', state: 'online', fromCache: false }],
    }),
    ...overrides,
  };
}

function createDeviceNetworkService(
  devices: Array<Record<string, unknown>>,
  overrides: Record<string, unknown> = {},
) {
  return {
    getLocalIdentity: vi.fn().mockResolvedValue({ peerId: 'peer-local' }),
    listDevices: vi.fn().mockResolvedValue(devices),
    sendRpc: vi.fn().mockResolvedValue({ items: [], hasMoreAfter: false }),
    abortOperation: vi.fn().mockResolvedValue(undefined),
    finishOperation: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function remoteDevice(peerId = 'peer-remote', state: 'online' | 'offline' = 'online') {
  return {
    peerId,
    trusted: true,
    reachability: { state },
  };
}

afterEach(() => {
  mutableService.agentInstance = originalAgentInstance;
  mutableService.deviceNetwork = originalDeviceNetwork;
  vi.restoreAllMocks();
});

describe('DesktopScheduledTaskClient bounded aggregation', () => {
  it('filters cancelled and archived tasks in the backend query by default', async () => {
    const listLocal = vi.fn().mockResolvedValue({
      items: [],
      hasMoreAfter: false,
      partial: false,
      sources: [{ executionNodeId: 'peer-local', state: 'online', fromCache: false }],
    });
    mutableService.agentInstance = createAgentInstanceService({
      listScheduledTasksForAgent: listLocal,
    });
    mutableService.deviceNetwork = createDeviceNetworkService([]);

    await createDesktopScheduledTaskClient().listScheduledTasksForAgent('agent-1', {
      executionNodeIds: ['peer-local'],
    });

    expect(listLocal).toHaveBeenCalledWith('agent-1', {
      executionNodeIds: ['peer-local'],
      limit: 64,
      maxBytes: 245_760,
      states: ['active', 'paused'],
    });
  });

  it('ignores discovered devices until they are trusted', async () => {
    const listLocal = vi.fn().mockResolvedValue({
      items: [],
      hasMoreAfter: false,
      partial: false,
      sources: [{ executionNodeId: 'peer-local', state: 'online', fromCache: false }],
    });
    const sendRpc = vi.fn();
    mutableService.agentInstance = createAgentInstanceService({
      listScheduledTasksForAgent: listLocal,
    });
    mutableService.deviceNetwork = createDeviceNetworkService([{
      ...remoteDevice('peer-unpaired'),
      trusted: false,
    }], { sendRpc });

    await expect(createDesktopScheduledTaskClient().listScheduledTasksForAgent('agent-1')).resolves.toEqual({
      items: [],
      hasMoreAfter: false,
      partial: false,
      sources: [{ executionNodeId: 'peer-local', state: 'online', fromCache: false }],
    });
    expect(listLocal).toHaveBeenCalledOnce();
    expect(sendRpc).not.toHaveBeenCalled();
  });

  it('reports an offline remote source without exposing a renderer-owned cache DTO', async () => {
    const sendRpc = vi.fn();
    mutableService.agentInstance = createAgentInstanceService();
    mutableService.deviceNetwork = createDeviceNetworkService([remoteDevice('peer-remote', 'offline')], { sendRpc });

    const client = createDesktopScheduledTaskClient();
    await expect(client.listScheduledTasksForAgent('agent-1', {
      executionNodeIds: ['peer-remote'],
    })).resolves.toEqual({
      items: [],
      hasMoreAfter: false,
      partial: true,
      sources: [{ executionNodeId: 'peer-remote', state: 'offline', fromCache: false }],
    });
    expect(sendRpc).not.toHaveBeenCalled();
  });

  it('uses the typed scoped RPC contract and returns every Core execution field unchanged', async () => {
    const finishOperation = vi.fn().mockResolvedValue(undefined);
    const sendRpc = vi.fn().mockResolvedValue({
      items: [remoteTask],
      hasMoreAfter: false,
    });
    mutableService.agentInstance = createAgentInstanceService();
    mutableService.deviceNetwork = createDeviceNetworkService([remoteDevice()], { sendRpc, finishOperation });

    const client = createDesktopScheduledTaskClient();
    const page = await client.listScheduledTasksForAgent('agent-1', {
      executionNodeIds: ['peer-remote'],
      limit: 16,
      states: ['active'],
    });

    expect(page).toEqual({
      items: [remoteTask],
      hasMoreAfter: false,
      partial: false,
      sources: [{ executionNodeId: 'peer-remote', state: 'online', fromCache: false }],
    });
    expect(sendRpc).toHaveBeenCalledWith(
      'peer-remote',
      'memeloop.schedule.list',
      {
        agentInstanceId: 'agent-1',
        executionNodeId: 'peer-remote',
        limit: 16,
        maxBytes: 245_760,
        states: ['active'],
      },
      { operationId: expect.any(String) },
    );
    expect(finishOperation).toHaveBeenCalledOnce();
    await expect(client.updateScheduledTask('task-remote', { executionNodeId: 'peer-other' }))
      .rejects.toThrow('scheduled_task_execution_transfer_unsupported');
  });

  it('retains each source keyset cursor without walking an extra remote page', async () => {
    const localList = vi.fn()
      .mockResolvedValueOnce({
        items: [localWireTask],
        hasMoreAfter: false,
        partial: false,
        sources: [{ executionNodeId: 'peer-local', state: 'online', fromCache: false }],
      });
    const sendRpc = vi.fn()
      .mockResolvedValueOnce({ items: [remoteTask], nextCursor: 'remote-next', hasMoreAfter: true })
      .mockResolvedValueOnce({
        items: [{ ...remoteTask, id: 'task-remote-2' }],
        hasMoreAfter: false,
      });
    mutableService.agentInstance = createAgentInstanceService({
      listScheduledTasksForAgent: localList,
    });
    mutableService.deviceNetwork = createDeviceNetworkService([remoteDevice()], { sendRpc });
    const client = createDesktopScheduledTaskClient();

    const first = await client.listScheduledTasksForAgent('agent-1', { limit: 2 });
    expect(first.items.map(task => task.id)).toEqual(['task-local', 'task-remote']);
    expect(first.hasMoreAfter).toBe(true);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(sendRpc).toHaveBeenCalledOnce();

    const second = await client.listScheduledTasksForAgent('agent-1', {
      cursor: first.nextCursor,
      limit: 2,
    });
    expect(second.items.map(task => task.id)).toEqual(['task-remote-2']);
    expect(second.hasMoreAfter).toBe(false);
    expect(sendRpc).toHaveBeenCalledTimes(2);
    expect(sendRpc.mock.calls[1]?.[2]).toMatchObject({ cursor: 'remote-next', limit: 2 });
    expect(localList).toHaveBeenCalledOnce();
  });

  it('forwards the local Core page cursor opaquely without interpreting storage fields', async () => {
    const localList = vi.fn()
      .mockResolvedValueOnce({
        items: [localWireTask],
        nextCursor: 'opaque-local-cursor',
        hasMoreAfter: true,
        partial: false,
        sources: [{ executionNodeId: 'peer-local', state: 'online', fromCache: false }],
      })
      .mockResolvedValueOnce({
        items: [{ ...localWireTask, id: 'task-local-2' }],
        hasMoreAfter: false,
        partial: false,
        sources: [{ executionNodeId: 'peer-local', state: 'online', fromCache: false }],
      });
    mutableService.agentInstance = createAgentInstanceService({
      listScheduledTasksForAgent: localList,
    });
    mutableService.deviceNetwork = createDeviceNetworkService([]);
    const client = createDesktopScheduledTaskClient();

    const first = await client.listScheduledTasksForAgent('agent-1', {
      executionNodeIds: ['peer-local'],
      limit: 1,
    });
    const second = await client.listScheduledTasksForAgent('agent-1', {
      cursor: first.nextCursor,
      executionNodeIds: ['peer-local'],
      limit: 1,
    });

    expect(second.items).toEqual([{ ...localWireTask, id: 'task-local-2' }]);
    expect(localList.mock.calls[1]?.[1]).toMatchObject({ cursor: 'opaque-local-cursor' });
  });

  it('limits simultaneous remote reads to four across a bounded eight-source page', async () => {
    let active = 0;
    let maxActive = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const peers = Array.from({ length: 8 }, (_, index) => `peer-${index}`);
    const sendRpc = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await gate;
      active -= 1;
      return { items: [], hasMoreAfter: false };
    });
    mutableService.agentInstance = createAgentInstanceService();
    mutableService.deviceNetwork = createDeviceNetworkService(peers.map(peerId => remoteDevice(peerId)), { sendRpc });

    const pending = createDesktopScheduledTaskClient().listScheduledTasksForAgent('agent-1', {
      executionNodeIds: peers,
      limit: 8,
    });
    await vi.waitFor(() => {
      expect(sendRpc).toHaveBeenCalledTimes(4);
    });
    expect(maxActive).toBe(4);
    release();
    const page = await pending;
    expect(page.sources).toHaveLength(8);
    expect(sendRpc).toHaveBeenCalledTimes(8);
    expect(maxActive).toBe(4);
  });

  it('maps renderer abort to one main-process operation abort and always releases the handle', async () => {
    let resolveRpc!: (value: unknown) => void;
    const sendRpc = vi.fn(() =>
      new Promise(resolve => {
        resolveRpc = resolve;
      })
    );
    const abortOperation = vi.fn().mockResolvedValue(undefined);
    const finishOperation = vi.fn().mockResolvedValue(undefined);
    mutableService.agentInstance = createAgentInstanceService();
    mutableService.deviceNetwork = createDeviceNetworkService([remoteDevice()], {
      sendRpc,
      abortOperation,
      finishOperation,
    });
    const controller = new AbortController();

    const pending = createDesktopScheduledTaskClient().listScheduledTasksForAgent('agent-1', {
      executionNodeIds: ['peer-remote'],
      signal: controller.signal,
    });
    await vi.waitFor(() => {
      expect(sendRpc).toHaveBeenCalledOnce();
    });
    controller.abort(new Error('cancelled'));
    controller.abort(new Error('duplicate'));
    resolveRpc({ items: [], hasMoreAfter: false });

    await expect(pending).rejects.toThrow('cancelled');
    expect(abortOperation).toHaveBeenCalledOnce();
    expect(finishOperation).toHaveBeenCalledOnce();
    expect(abortOperation.mock.calls[0]?.[0]).toBe(finishOperation.mock.calls[0]?.[0]);
  });

  it('rejects an opaque continuation after device reachability changes', async () => {
    const listDevices = vi.fn().mockResolvedValue([remoteDevice()]);
    const sendRpc = vi.fn().mockResolvedValue({
      items: [remoteTask],
      nextCursor: 'remote-next',
      hasMoreAfter: true,
    });
    mutableService.agentInstance = createAgentInstanceService();
    mutableService.deviceNetwork = createDeviceNetworkService([remoteDevice()], { listDevices, sendRpc });
    const client = createDesktopScheduledTaskClient();
    const first = await client.listScheduledTasksForAgent('agent-1', {
      executionNodeIds: ['peer-remote'],
      limit: 1,
    });
    listDevices.mockResolvedValue([remoteDevice('peer-remote', 'offline')]);

    await expect(client.listScheduledTasksForAgent('agent-1', {
      cursor: first.nextCursor,
      executionNodeIds: ['peer-remote'],
      limit: 1,
    })).rejects.toThrow('scheduled_task_cursor_stale');
    expect(sendRpc).toHaveBeenCalledOnce();
  });

  it('fails closed when a local source exceeds the requested page limit', async () => {
    mutableService.agentInstance = createAgentInstanceService({
      listScheduledTasksForAgent: vi.fn().mockResolvedValue({
        items: [localWireTask, { ...localWireTask, id: 'task-local-2' }],
        hasMoreAfter: false,
        partial: false,
        sources: [{ executionNodeId: 'peer-local', state: 'online', fromCache: false }],
      }),
    });
    mutableService.deviceNetwork = createDeviceNetworkService([]);

    await expect(
      createDesktopScheduledTaskClient().listScheduledTasksForAgent('agent-1', {
        executionNodeIds: ['peer-local'],
        limit: 1,
      }),
    ).rejects.toThrow('scheduled_task_page_limit_exceeded');
  });
});
