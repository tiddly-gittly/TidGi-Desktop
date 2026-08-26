import type { IAgentInstanceService } from '@services/agentInstance/interface';
import type { ScheduledTask as DesktopScheduledTask } from '@services/agentInstance/tools/scheduledTaskTypes';
import { describe, expect, it, vi } from 'vitest';

import { createDesktopScheduledTaskRpcHandler, createDesktopScheduledTaskStore } from '../scheduledTaskRpcStore';

const task = (overrides: Partial<DesktopScheduledTask> = {}): DesktopScheduledTask => ({
  id: 'task-1',
  agentInstanceId: 'agent-1',
  agentDefinitionId: 'definition-1',
  name: 'Daily review',
  scheduleKind: 'cron',
  schedule: { kind: 'cron', expression: '0 9 * * *' },
  payload: { message: 'review' },
  enabled: true,
  deleteAfterRun: false,
  consecutiveFailures: 0,
  runCount: 0,
  createdBy: 'settings-ui',
  created: new Date(0).toISOString(),
  updated: new Date(0).toISOString(),
  state: 'active',
  executionNodeId: 'peer-local',
  executionNodeLabel: 'Desktop',
  originNodeId: 'peer-remote',
  ...overrides,
});

describe('Desktop scheduled-task RPC store', () => {
  it('keeps list reads target-scoped, state-filtered and cursor-bounded', async () => {
    const tasks = Array.from({ length: 3 }, (_, index) => task({ id: `task-${index + 1}` }));
    const listScheduledTasksPageForAgent = vi.fn()
      .mockResolvedValueOnce({
        items: tasks.slice(0, 2),
        revision: 'revision-1',
        next: { updatedAt: tasks[1].updated, id: tasks[1].id },
      })
      .mockResolvedValueOnce({ items: tasks.slice(2), revision: 'revision-1' });
    const store = createDesktopScheduledTaskStore({ listScheduledTasksPageForAgent } as unknown as IAgentInstanceService);

    const first = await store.list({
      agentInstanceId: 'agent-1',
      executionNodeId: 'peer-local',
      states: ['active'],
      limit: 2,
      maxBytes: 256 * 1024,
    }, { localPeerId: 'peer-local', remotePeerId: 'peer-remote' });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(listScheduledTasksPageForAgent).toHaveBeenCalledWith({
      agentInstanceId: 'agent-1',
      executionNodeId: 'peer-local',
      states: ['active'],
      limit: 2,
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
    expect(listScheduledTasksPageForAgent).toHaveBeenLastCalledWith(expect.objectContaining({
      after: { updatedAt: tasks[1].updated, id: tasks[1].id },
      expectedRevision: 'revision-1',
    }));
    await expect(store.list({
      agentInstanceId: 'other-agent',
      executionNodeId: 'peer-local',
      limit: 2,
      maxBytes: 256 * 1024,
      cursor: first.nextCursor,
    }, { localPeerId: 'peer-local', remotePeerId: 'peer-remote' })).rejects.toThrow('scheduled_task_invalid_cursor');
  });

  it('binds cursors to the normalized state filter', async () => {
    const firstTask = task();
    const service = {
      listScheduledTasksPageForAgent: vi.fn().mockResolvedValue({
        items: [firstTask],
        revision: 'revision-filter',
        next: { updatedAt: firstTask.updated, id: firstTask.id },
      }),
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
    }, { localPeerId: 'peer-local', remotePeerId: 'peer-remote' })).rejects.toThrow('scheduled_task_invalid_cursor');
    expect(service.listScheduledTasksPageForAgent).toHaveBeenCalledTimes(1);
  });

  it('stops before the strict response byte budget and returns a resumable cursor', async () => {
    const tasks = Array.from({ length: 3 }, (_, index) =>
      task({
        id: `large-${index}`,
        payload: { message: String(index).repeat(800) },
      }));
    const listScheduledTasksPageForAgent = vi.fn().mockResolvedValue({
      items: tasks,
      revision: 'revision-bytes',
    });
    const store = createDesktopScheduledTaskStore({ listScheduledTasksPageForAgent } as unknown as IAgentInstanceService);
    const maxBytes = 1_600;
    const page = await store.list({
      agentInstanceId: 'agent-1',
      executionNodeId: 'peer-local',
      states: ['active'],
      limit: 3,
      maxBytes,
    }, { localPeerId: 'peer-local', remotePeerId: 'peer-remote' });

    expect(page.items).toHaveLength(1);
    expect(page.hasMoreAfter).toBe(true);
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(Buffer.byteLength(JSON.stringify(page), 'utf8')).toBeLessThanOrEqual(maxBytes);
    expect(listScheduledTasksPageForAgent).toHaveBeenCalledWith(expect.objectContaining({ limit: 3 }));
  });

  it('fails explicitly when one task cannot fit rather than returning a non-progressing cursor', async () => {
    const store = createDesktopScheduledTaskStore({
      listScheduledTasksPageForAgent: vi.fn().mockResolvedValue({ items: [task()], revision: 'revision-small' }),
    } as unknown as IAgentInstanceService);
    await expect(store.list({
      agentInstanceId: 'agent-1',
      executionNodeId: 'peer-local',
      states: ['active'],
      limit: 1,
      maxBytes: 64,
    }, { localPeerId: 'peer-local', remotePeerId: 'peer-remote' })).rejects.toThrow('item_exceeds_byte_budget');
  });

  it('propagates cancellation before and during bounded reads without returning late state', async () => {
    let finish!: (value: { items: DesktopScheduledTask[]; revision: string }) => void;
    const pendingPage = new Promise<{ items: DesktopScheduledTask[]; revision: string }>(resolve => {
      finish = resolve;
    });
    const listScheduledTasksPageForAgent = vi.fn().mockReturnValue(pendingPage);
    const store = createDesktopScheduledTaskStore({ listScheduledTasksPageForAgent } as unknown as IAgentInstanceService);

    const aborted = new AbortController();
    aborted.abort(new Error('superseded'));
    await expect(store.list({
      agentInstanceId: 'agent-1',
      executionNodeId: 'peer-local',
      maxBytes: 256 * 1024,
    }, { localPeerId: 'peer-local', remotePeerId: 'peer-remote', signal: aborted.signal })).rejects.toThrow('superseded');
    expect(listScheduledTasksPageForAgent).not.toHaveBeenCalled();

    const active = new AbortController();
    const result = store.list({
      agentInstanceId: 'agent-1',
      executionNodeId: 'peer-local',
      maxBytes: 256 * 1024,
    }, { localPeerId: 'peer-local', remotePeerId: 'peer-remote', signal: active.signal });
    active.abort(new Error('configuration changed'));
    finish({ items: [task()], revision: 'late-revision' });
    await expect(result).rejects.toThrow('configuration changed');
  });

  it('derives create ownership from authenticated peers and emits the strict DTO', async () => {
    const createScheduledTask = vi.fn().mockResolvedValue(task());
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
    })).resolves.toEqual({
      task: expect.objectContaining({
        agentDefinitionId: 'definition-1',
        executionNodeId: 'peer-local',
        originNodeId: 'peer-remote',
      }),
    });
    expect(createScheduledTask).toHaveBeenCalledWith(
      expect.objectContaining({
        executionNodeId: 'peer-local',
        originNodeId: 'peer-remote',
        scheduleKind: 'cron',
      }),
      { signal: undefined },
    );
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
