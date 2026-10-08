import type { IAgentInstanceService } from '@services/agentInstance/interface';
import type { ScheduledTask, ScheduledTaskPage } from 'memeloop';
import { describe, expect, it, vi } from 'vitest';

import { createDesktopScheduledTaskRpcHandler, createDesktopScheduledTaskStore } from '../scheduledTaskRpcStore';

const task = (overrides: Partial<ScheduledTask> = {}): ScheduledTask => ({
  id: 'task-1',
  agentInstanceId: 'agent-1',
  agentDefinitionId: 'definition-1',
  name: 'Daily review',
  schedule: { kind: 'cron', expression: '0 9 * * *' },
  payload: { message: 'review' },
  enabled: true,
  deleteAfterRun: false,
  consecutiveFailures: 0,
  runCount: 0,
  createdBy: 'settings-ui',
  updatedAt: new Date(0).toISOString(),
  state: 'active',
  executionNodeId: 'peer-local',
  executionNodeLabel: 'Desktop',
  originNodeId: 'peer-remote',
  nextRunAt: '2026-09-01T01:00:00.000Z',
  lastRunAt: '2026-08-31T01:00:00.000Z',
  lastRunStatus: 'failed',
  lastError: 'provider_unavailable',
  lastFailureAt: '2026-08-31T01:00:01.000Z',
  nextRetryAt: '2026-08-31T01:01:00.000Z',
  maxRuns: 10,
  executionRevision: 7,
  occurrenceId: 'occurrence-7',
  occurrenceScheduledFor: '2026-09-01T01:00:00.000Z',
  occurrenceAttempt: 2,
  ...overrides,
});

const page = (
  items: ScheduledTask[],
  overrides: Partial<Omit<ScheduledTaskPage, 'items'>> = {},
): ScheduledTaskPage => ({
  items,
  hasMoreAfter: false,
  partial: false,
  sources: [{ executionNodeId: 'peer-local', state: 'online', fromCache: false }],
  ...overrides,
});

describe('Desktop scheduled-task RPC store', () => {
  it('uses the Core active/paused default when the RPC omits a state filter', async () => {
    const listScheduledTasksForAgent = vi.fn().mockResolvedValue(page([]));
    const store = createDesktopScheduledTaskStore({ listScheduledTasksForAgent } as unknown as IAgentInstanceService);

    await store.list({
      agentInstanceId: 'agent-1',
      executionNodeId: 'peer-local',
      maxBytes: 256 * 1024,
    }, { localPeerId: 'peer-local', remotePeerId: 'peer-remote' });

    expect(listScheduledTasksForAgent).toHaveBeenCalledWith('agent-1', {
      executionNodeIds: ['peer-local'],
      limit: 100,
      maxBytes: 256 * 1024,
      states: ['active', 'paused'],
      signal: undefined,
    });
  });

  it('keeps list reads target-scoped, state-filtered and cursor-bounded', async () => {
    const tasks = Array.from({ length: 3 }, (_, index) => task({ id: `task-${index + 1}` }));
    const listScheduledTasksForAgent = vi.fn()
      .mockResolvedValueOnce(page(tasks.slice(0, 2), {
        nextCursor: 'opaque-core-cursor',
        hasMoreAfter: true,
      }))
      .mockResolvedValueOnce(page(tasks.slice(2)));
    const store = createDesktopScheduledTaskStore({ listScheduledTasksForAgent } as unknown as IAgentInstanceService);

    const first = await store.list({
      agentInstanceId: 'agent-1',
      executionNodeId: 'peer-local',
      states: ['active'],
      limit: 2,
      maxBytes: 256 * 1024,
    }, { localPeerId: 'peer-local', remotePeerId: 'peer-remote' });
    expect(first.items).toHaveLength(2);
    expect(first.items).toEqual(tasks.slice(0, 2));
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(listScheduledTasksForAgent).toHaveBeenCalledWith('agent-1', {
      executionNodeIds: ['peer-local'],
      states: ['active'],
      limit: 2,
      maxBytes: 256 * 1024,
      signal: undefined,
    });

    const second = await store.list({
      agentInstanceId: 'agent-1',
      executionNodeId: 'peer-local',
      states: ['active'],
      limit: 2,
      maxBytes: 256 * 1024,
      cursor: first.nextCursor,
    }, { localPeerId: 'peer-local', remotePeerId: 'peer-remote' });
    expect(second.items.map(item => item.id)).toEqual(['task-3']);
    expect(listScheduledTasksForAgent).toHaveBeenLastCalledWith(
      'agent-1',
      expect.objectContaining({
        cursor: 'opaque-core-cursor',
      }),
    );
    await expect(store.list({
      agentInstanceId: 'other-agent',
      executionNodeId: 'peer-local',
      limit: 2,
      maxBytes: 256 * 1024,
      cursor: first.nextCursor,
    }, { localPeerId: 'peer-local', remotePeerId: 'peer-remote' })).rejects.toThrow('scheduled_task_cursor_stale');
  });

  it('binds cursors to the normalized state filter', async () => {
    const firstTask = task();
    const service = {
      listScheduledTasksForAgent: vi.fn().mockResolvedValue(page([firstTask], {
        nextCursor: 'state-bound-core-cursor',
        hasMoreAfter: true,
      })),
    } as unknown as IAgentInstanceService;
    const store = createDesktopScheduledTaskStore(service);
    const first = await store.list({
      agentInstanceId: 'agent-1',
      executionNodeId: 'peer-local',
      states: ['paused', 'active'],
      limit: 1,
      maxBytes: 256 * 1024,
    }, { localPeerId: 'peer-local', remotePeerId: 'peer-remote' });

    await expect(store.list({
      agentInstanceId: 'agent-1',
      executionNodeId: 'peer-local',
      states: ['active'],
      limit: 1,
      maxBytes: 256 * 1024,
      cursor: first.nextCursor,
    }, { localPeerId: 'peer-local', remotePeerId: 'peer-remote' })).rejects.toThrow('scheduled_task_cursor_stale');
    expect(service.listScheduledTasksForAgent).toHaveBeenCalledTimes(1);
  });

  it('preserves an exact bounded Core page and wraps only its opaque cursor', async () => {
    const firstTask = task({
      id: 'large-0',
      payload: { message: '0'.repeat(1_200) },
    });
    const listScheduledTasksForAgent = vi.fn().mockResolvedValue(page([firstTask], {
      nextCursor: 'byte-bounded-core-cursor',
      hasMoreAfter: true,
    }));
    const store = createDesktopScheduledTaskStore({ listScheduledTasksForAgent } as unknown as IAgentInstanceService);
    const maxBytes = 2_400;
    const result = await store.list({
      agentInstanceId: 'agent-1',
      executionNodeId: 'peer-local',
      states: ['active'],
      limit: 3,
      maxBytes,
    }, { localPeerId: 'peer-local', remotePeerId: 'peer-remote' });

    expect(result.items).toEqual([firstTask]);
    expect(result.hasMoreAfter).toBe(true);
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(maxBytes);
    expect(listScheduledTasksForAgent).toHaveBeenCalledWith(
      'agent-1',
      expect.objectContaining({
        limit: 3,
        maxBytes,
      }),
    );
  });

  it('propagates a Core item byte-budget failure without inventing a compatibility page', async () => {
    const store = createDesktopScheduledTaskStore({
      listScheduledTasksForAgent: vi.fn().mockRejectedValue(new Error('scheduled_task_page_item_exceeds_byte_budget')),
    } as unknown as IAgentInstanceService);
    await expect(store.list({
      agentInstanceId: 'agent-1',
      executionNodeId: 'peer-local',
      states: ['active'],
      limit: 1,
      maxBytes: 64,
    }, { localPeerId: 'peer-local', remotePeerId: 'peer-remote' })).rejects.toThrow('scheduled_task_page_item_exceeds_byte_budget');
  });

  it('propagates cancellation before and during bounded reads without returning late state', async () => {
    let finish!: (value: ScheduledTaskPage) => void;
    const pendingPage = new Promise<ScheduledTaskPage>(resolve => {
      finish = resolve;
    });
    const listScheduledTasksForAgent = vi.fn().mockReturnValue(pendingPage);
    const store = createDesktopScheduledTaskStore({ listScheduledTasksForAgent } as unknown as IAgentInstanceService);

    const aborted = new AbortController();
    aborted.abort(new Error('superseded'));
    await expect(store.list({
      agentInstanceId: 'agent-1',
      executionNodeId: 'peer-local',
      maxBytes: 256 * 1024,
    }, { localPeerId: 'peer-local', remotePeerId: 'peer-remote', signal: aborted.signal })).rejects.toThrow('superseded');
    expect(listScheduledTasksForAgent).not.toHaveBeenCalled();

    const active = new AbortController();
    const result = store.list({
      agentInstanceId: 'agent-1',
      executionNodeId: 'peer-local',
      maxBytes: 256 * 1024,
    }, { localPeerId: 'peer-local', remotePeerId: 'peer-remote', signal: active.signal });
    active.abort(new Error('configuration changed'));
    finish(page([task()]));
    await expect(result).rejects.toThrow('configuration changed');
  });

  it('derives create ownership from authenticated peers and returns the exact Core task without dropping execution state', async () => {
    const persistedTask = task();
    const createScheduledTask = vi.fn().mockResolvedValue(persistedTask);
    const handler = createDesktopScheduledTaskRpcHandler({
      createScheduledTask,
      getCronPreviewDates: vi.fn(),
    } as unknown as IAgentInstanceService, 'peer-local');

    await expect(handler({
      remotePeerId: 'peer-remote',
      method: 'memeloop.schedule.create',
      parameters: {
        input: {
          agentInstanceId: 'agent-1',
          agentDefinitionId: 'definition-1',
          name: 'Daily review',
          schedule: { kind: 'cron', expression: '0 9 * * *' },
          enabled: true,
          executionNodeId: 'peer-local',
        },
      },
    })).resolves.toEqual({ task: persistedTask });
    expect(createScheduledTask).toHaveBeenCalledWith(
      expect.objectContaining({
        executionNodeId: 'peer-local',
        originNodeId: 'peer-remote',
        scheduleKind: 'cron',
      }),
      { signal: undefined },
    );
  });

  it('passes exact Core tasks and the exact RPC patch through get and update', async () => {
    const persistedTask = task({ occurrenceAttempt: 4, executionRevision: 11 });
    const getScheduledTaskByScope = vi.fn().mockResolvedValue(persistedTask);
    const updateScheduledTaskScoped = vi.fn().mockResolvedValue(persistedTask);
    const store = createDesktopScheduledTaskStore({
      getScheduledTaskByScope,
      updateScheduledTaskScoped,
    } as unknown as IAgentInstanceService);
    const scope = {
      taskId: persistedTask.id,
      agentInstanceId: persistedTask.agentInstanceId,
      agentDefinitionId: persistedTask.agentDefinitionId,
      executionNodeId: persistedTask.executionNodeId,
    };
    const context = { localPeerId: 'peer-local', remotePeerId: 'peer-remote' };

    await expect(store.get(scope, context)).resolves.toEqual(persistedTask);
    const patch = {
      schedule: { kind: 'at' as const, wakeAtISO: '2026-09-02T03:04:05.000Z' },
      payload: null,
      activeHoursStart: null,
      executionNodeLabel: null,
      enabled: false,
    };
    await expect(store.update({ ...scope, patch }, context)).resolves.toEqual(persistedTask);
    expect(updateScheduledTaskScoped).toHaveBeenCalledWith(scope, patch, { signal: undefined });
  });

  it('checks the complete resource tuple before update or delete', async () => {
    const updateScheduledTaskScoped = vi.fn().mockRejectedValue(new Error('scheduled_task_scope_unavailable'));
    const deleteScheduledTaskScoped = vi.fn().mockRejectedValue(new Error('scheduled_task_scope_unavailable'));
    const store = createDesktopScheduledTaskStore({
      deleteScheduledTaskScoped,
      updateScheduledTaskScoped,
    } as unknown as IAgentInstanceService);
    const mismatched = {
      taskId: 'task-1',
      agentInstanceId: 'agent-1',
      agentDefinitionId: 'definition-other',
      executionNodeId: 'peer-local',
    };

    await expect(store.update({ ...mismatched, patch: { enabled: false } }, {
      localPeerId: 'peer-local',
      remotePeerId: 'peer-remote',
    })).rejects.toThrow('scheduled_task_scope_unavailable');
    await expect(store.delete(mismatched, {
      localPeerId: 'peer-local',
      remotePeerId: 'peer-remote',
    })).rejects.toThrow('scheduled_task_scope_unavailable');
    expect(updateScheduledTaskScoped).toHaveBeenCalledWith(
      expect.objectContaining(mismatched),
      expect.any(Object),
      { signal: undefined },
    );
    expect(deleteScheduledTaskScoped).toHaveBeenCalledWith(
      expect.objectContaining(mismatched),
      { signal: undefined },
    );
  });
});
