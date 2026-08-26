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
  scheduleKind: 'cron' as const,
  schedule: { kind: 'cron' as const, expression: '0 9 * * *' },
  payload: { message: 'wake' },
  enabled: true,
  deleteAfterRun: false,
  consecutiveFailures: 0,
  runCount: 0,
  createdBy: 'settings-ui',
  created: new Date(0).toISOString(),
  updated: new Date(0).toISOString(),
  state: 'active' as const,
  executionNodeId: 'peer-remote',
  executionNodeLabel: 'Remote Mac',
  originNodeId: 'peer-local',
};

const remoteWireTask = {
  id: remoteTask.id,
  agentInstanceId: remoteTask.agentInstanceId,
  agentDefinitionId: remoteTask.agentDefinitionId,
  name: remoteTask.name,
  schedule: remoteTask.schedule,
  payload: remoteTask.payload,
  enabled: remoteTask.enabled,
  createdBy: remoteTask.createdBy,
  state: remoteTask.state,
  executionNodeId: remoteTask.executionNodeId,
  executionNodeLabel: remoteTask.executionNodeLabel,
  originNodeId: remoteTask.originNodeId,
  updatedAt: remoteTask.updated,
};

const localWireTask = {
  ...remoteWireTask,
  id: 'task-local',
  name: 'Local schedule',
  executionNodeId: 'peer-local',
};

function createAgentInstanceService(overrides: Record<string, unknown> = {}) {
  return {
    listScheduledTasksPageForAgent: vi.fn().mockResolvedValue({
      items: [],
      revision: 'local-r1',
    }),
    listRemoteScheduledTaskProjectionPageForAgent: vi.fn().mockResolvedValue({
      items: [],
      revision: 'cache-r1',
    }),
    replaceRemoteScheduledTaskProjections: vi.fn().mockResolvedValue(undefined),
    upsertRemoteScheduledTaskProjection: vi.fn().mockResolvedValue(undefined),
    deleteRemoteScheduledTaskProjection: vi.fn().mockResolvedValue(undefined),
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
    const listLocal = vi.fn().mockResolvedValue({ items: [], revision: 'local-r1' });
    mutableService.agentInstance = createAgentInstanceService({
      listScheduledTasksPageForAgent: listLocal,
    });
    mutableService.deviceNetwork = createDeviceNetworkService([]);

    await createDesktopScheduledTaskClient().listScheduledTasksForAgent('agent-1', {
      executionNodeIds: ['peer-local'],
    });

    expect(listLocal).toHaveBeenCalledWith(expect.objectContaining({
      agentInstanceId: 'agent-1',
      executionNodeId: 'peer-local',
      states: ['active', 'paused'],
    }));
  });

  it('ignores discovered devices until they are trusted', async () => {
    const listLocal = vi.fn().mockResolvedValue({ items: [], revision: 'local-r1' });
    const listCached = vi.fn();
    const sendRpc = vi.fn();
    mutableService.agentInstance = createAgentInstanceService({
      listScheduledTasksPageForAgent: listLocal,
      listRemoteScheduledTaskProjectionPageForAgent: listCached,
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
    expect(listCached).not.toHaveBeenCalled();
    expect(sendRpc).not.toHaveBeenCalled();
  });

  it('keeps an offline remote schedule visible with provenance and blocks stale mutation', async () => {
    const sendRpc = vi.fn();
    mutableService.agentInstance = createAgentInstanceService({
      listRemoteScheduledTaskProjectionPageForAgent: vi.fn().mockResolvedValue({
        items: [{ task: remoteTask, observedAt: 123 }],
        revision: 'cache-r1',
      }),
    });
    mutableService.deviceNetwork = createDeviceNetworkService([remoteDevice('peer-remote', 'offline')], { sendRpc });

    const client = createDesktopScheduledTaskClient();
    await expect(client.listScheduledTasksForAgent('agent-1', {
      executionNodeIds: ['peer-remote'],
    })).resolves.toEqual({
      items: [expect.objectContaining({ id: 'task-remote', executionNodeId: 'peer-remote' })],
      hasMoreAfter: false,
      partial: true,
      sources: [{ executionNodeId: 'peer-remote', state: 'offline', fromCache: true }],
    });
    await expect(client.updateScheduledTask('task-remote', { payload: { message: 'changed' } }))
      .rejects.toThrow('scheduled_task_remote_snapshot_offline');
    expect(sendRpc).not.toHaveBeenCalled();
  });

  it('uses the typed scoped RPC contract and replaces a complete durable projection', async () => {
    const replace = vi.fn().mockResolvedValue(undefined);
    const finishOperation = vi.fn().mockResolvedValue(undefined);
    const sendRpc = vi.fn().mockResolvedValue({
      items: [remoteWireTask],
      hasMoreAfter: false,
    });
    mutableService.agentInstance = createAgentInstanceService({ replaceRemoteScheduledTaskProjections: replace });
    mutableService.deviceNetwork = createDeviceNetworkService([remoteDevice()], { sendRpc, finishOperation });

    const client = createDesktopScheduledTaskClient();
    const page = await client.listScheduledTasksForAgent('agent-1', {
      executionNodeIds: ['peer-remote'],
      limit: 16,
      states: ['active'],
    });

    expect(page).toEqual({
      items: [expect.objectContaining({ id: 'task-remote' })],
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
    expect(replace).toHaveBeenCalledWith(
      'agent-1',
      'peer-remote',
      [expect.objectContaining({ id: 'task-remote', scheduleKind: 'cron' })],
      expect.any(Number),
    );
    await expect(client.updateScheduledTask('task-remote', { executionNodeId: 'peer-other' }))
      .rejects.toThrow('scheduled_task_execution_transfer_unsupported');
  });

  it('retains each source keyset cursor without walking an extra remote page', async () => {
    const localList = vi.fn()
      .mockResolvedValueOnce({ items: [localWireTask], revision: 'local-r1' })
      .mockResolvedValueOnce({ items: [], revision: 'local-r1' });
    const sendRpc = vi.fn()
      .mockResolvedValueOnce({ items: [remoteWireTask], nextCursor: 'remote-next', hasMoreAfter: true })
      .mockResolvedValueOnce({
        items: [{ ...remoteWireTask, id: 'task-remote-2' }],
        hasMoreAfter: false,
      });
    mutableService.agentInstance = createAgentInstanceService({
      listScheduledTasksPageForAgent: localList,
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
      items: [remoteWireTask],
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
      listScheduledTasksPageForAgent: vi.fn().mockResolvedValue({
        items: [localWireTask, { ...localWireTask, id: 'task-local-2' }],
        revision: 'local-r1',
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
