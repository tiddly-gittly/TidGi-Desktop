/**
 * Unit tests for ScheduledTaskManager — cron parsing, restore, active hours, volatile exemption.
 */

import type { ScheduledTaskEntity } from '@services/database/schema/agent';
import type { Repository } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IAgentInstanceService } from '../interface';

// ─── We test the module-level exported functions directly ────────────────────
// Dynamic import to get a fresh module state (the Map is module-level)
async function importManager() {
  return await import('../tools/scheduledTaskManager');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEntity(overrides: Partial<ScheduledTaskEntity> = {}): ScheduledTaskEntity {
  return {
    id: 'task-1',
    agentInstanceId: 'agent-1',
    agentDefinitionId: 'definition-1',
    name: 'Test Task',
    scheduleKind: 'cron',
    schedule: { kind: 'cron', expression: '* * * * *' },
    payload: { message: 'hello' },
    enabled: true,
    deleteAfterRun: false,
    activeHoursStart: undefined,
    activeHoursEnd: undefined,
    lastRunAt: undefined,
    lastRunStatus: undefined,
    lastError: null,
    lastFailureAt: null,
    consecutiveFailures: 0,
    nextRetryAt: null,
    nextRunAt: undefined,
    runCount: 0,
    maxRuns: undefined,
    createdBy: 'test',
    created: new Date(),
    updated: new Date(),
    ...overrides,
    state: overrides.state ?? 'active',
    executionNodeId: overrides.executionNodeId ?? 'local',
    executionNodeLabel: overrides.executionNodeLabel,
    originNodeId: overrides.originNodeId ?? 'local',
  };
}

function makeRepo(entities: ScheduledTaskEntity[] = []): Repository<ScheduledTaskEntity> {
  const store = new Map(entities.map(e => [e.id, e]));
  const repository = {
    find: vi.fn(async (options?: { where?: Partial<ScheduledTaskEntity> }) => {
      let results = [...store.values()];
      if (options?.where) {
        const { where } = options;
        if ('enabled' in where) results = results.filter(e => e.enabled === where.enabled);
        if ('agentInstanceId' in where && typeof where.agentInstanceId === 'string') {
          results = results.filter(e => e.agentInstanceId === where.agentInstanceId);
        }
        const stateFilter = where.state as unknown as { _value?: string[] } | string | undefined;
        const states = typeof stateFilter === 'string' ? [stateFilter] : stateFilter?._value;
        if (states) results = results.filter(e => states.includes(e.state));
      }
      return results;
    }),
    findOne: vi.fn(async (options?: { where?: { id?: string } }) => {
      const id = options?.where?.id;
      return id ? (store.get(id) ?? null) : null;
    }),
    create: vi.fn((data: Partial<ScheduledTaskEntity>) => (Object.assign(makeEntity(), data))),
    save: vi.fn(async (entity: ScheduledTaskEntity) => {
      store.set(entity.id, entity);
      return entity;
    }),
    update: vi.fn(async (criteria: string | Partial<ScheduledTaskEntity>, data: Partial<ScheduledTaskEntity>) => {
      const matches = typeof criteria === 'string'
        ? [...store.values()].filter(entity => entity.id === criteria)
        : [...store.values()].filter(entity => Object.entries(criteria).every(([key, value]) => entity[key as keyof ScheduledTaskEntity] === value));
      for (const existing of matches) store.set(existing.id, Object.assign({}, existing, data));
    }),
    delete: vi.fn(async (id: string) => {
      store.delete(id);
    }),
  } as unknown as Repository<ScheduledTaskEntity>;
  Object.defineProperty(repository, 'manager', {
    value: {
      getRepository: () => repository,
      transaction: async (operation: (manager: { getRepository: () => Repository<ScheduledTaskEntity> }) => Promise<unknown>) => operation({ getRepository: () => repository }),
    },
  });
  return repository;
}

function makeAgentService(sendMsgMock = vi.fn()): IAgentInstanceService {
  return {
    getAgentMetadata: vi.fn().mockResolvedValue({ agentDefId: 'definition-1', id: 'agent-1', name: 'Test Agent' }),
    executeLocalAgentMessage: sendMsgMock,
  } as unknown as IAgentInstanceService;
}

const localIdentity = async () => ({ peerId: 'peer-desktop', deviceName: 'Test Desktop' });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ScheduledTaskManager', () => {
  let manager: Awaited<ReturnType<typeof importManager>>;

  beforeEach(async () => {
    vi.useFakeTimers();
    manager = await importManager();
    // Reset in-memory state between tests
    manager.stopAllScheduledTasks();
  });

  afterEach(() => {
    manager.stopAllScheduledTasks();
    vi.useRealTimers();
  });

  describe('initScheduledTaskManager', () => {
    it('initialises without error', () => {
      const repo = makeRepo();
      const service = makeAgentService();
      expect(() => {
        manager.initScheduledTaskManager(repo, service, localIdentity);
      }).not.toThrow();
    });
  });

  describe('addTask', () => {
    it('creates a cron task and sets nextRunAt', async () => {
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService(), localIdentity);

      const task = await manager.addTask({
        agentInstanceId: 'agent-1',
        scheduleKind: 'cron',
        schedule: { kind: 'cron', expression: '* * * * *' },
        enabled: true,
      });

      expect(task.id).toBeTruthy();
      expect(task.scheduleKind).toBe('cron');
      expect(task.nextRunAt).toBeTruthy();
      expect(task).toMatchObject({
        executionNodeId: 'peer-desktop',
        executionNodeLabel: 'Test Desktop',
        originNodeId: 'peer-desktop',
      });
    });

    it('fails closed when the stable local PeerId cannot be loaded', async () => {
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService(), async () => {
        throw new Error('keychain unavailable');
      });
      await expect(manager.addTask({
        agentInstanceId: 'agent-no-identity',
        scheduleKind: 'cron',
        schedule: { kind: 'cron', expression: '* * * * *' },
      })).rejects.toThrow('scheduled_task_identity_unavailable');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects a task labelled for another execution node on this manager', async () => {
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService(), localIdentity);
      await expect(manager.addTask({
        agentInstanceId: 'agent-wrong-node',
        scheduleKind: 'cron',
        schedule: { kind: 'cron', expression: '* * * * *' },
        executionNodeId: 'peer-mobile',
      })).rejects.toThrow('scheduled_task_wrong_execution_node:peer-mobile');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects volatile preview conversations even when callers provide definition and name', async () => {
      const repo = makeRepo();
      const service = makeAgentService();
      vi.mocked(service.getAgentMetadata).mockResolvedValue({
        id: 'preview-agent',
        agentDefId: 'definition-1',
        name: 'Preview',
        volatile: true,
      } as never);
      manager.initScheduledTaskManager(repo, service, localIdentity);

      await expect(manager.addTask({
        agentInstanceId: 'preview-agent',
        agentDefinitionId: 'definition-1',
        name: 'Must not survive preview cleanup',
        scheduleKind: 'cron',
        schedule: { kind: 'cron', expression: '* * * * *' },
      })).rejects.toThrow('scheduled_task_volatile_agent');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('does not start a timer for disabled tasks', async () => {
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService(), localIdentity);

      await manager.addTask({
        agentInstanceId: 'agent-2',
        scheduleKind: 'cron',
        schedule: { kind: 'cron', expression: '* * * * *' },
        enabled: false,
      });

      const activeTasks = await manager.getActiveTasksForAgent('agent-2');
      expect(activeTasks).toHaveLength(0);
    });

    it.each([
      [{ kind: 'cron' as const, expression: 'NOT_A_CRON' }, 'scheduled_task_invalid_cron'],
      [{ kind: 'cron' as const, expression: '* * * * *', timezone: 'Mars/Olympus' }, 'scheduled_task_invalid_timezone'],
    ])('rejects an invalid schedule before persistence', async (schedule, expectedError) => {
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService(), localIdentity);
      await expect(manager.addTask({
        agentInstanceId: 'invalid-agent',
        scheduleKind: 'cron',
        schedule,
      })).rejects.toThrow(expectedError);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('segments a one-shot timer beyond the Node 32-bit timeout limit', async () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService(), localIdentity);
      await manager.addTask({
        agentInstanceId: 'far-future-agent',
        scheduleKind: 'at',
        schedule: { kind: 'at', wakeAtISO: '2026-03-01T00:00:00.000Z' },
      });
      const scheduledDelay = timeoutSpy.mock.calls.find(call => typeof call[1] === 'number')?.[1] as number;
      expect(scheduledDelay).toBeLessThanOrEqual(2_147_000_000);
      expect(scheduledDelay).toBeGreaterThan(2_000_000_000);
    });

    it('persists failure and retries a one-shot task without counting or completing it', async () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const sendMessage = vi.fn().mockRejectedValue(new Error('provider unavailable'));
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService(sendMessage), localIdentity);
      const task = await manager.addTask({
        agentInstanceId: 'retry-agent',
        scheduleKind: 'at',
        schedule: { kind: 'at', wakeAtISO: '2026-01-01T00:00:01.000Z' },
        deleteAfterRun: true,
      });
      await vi.advanceTimersByTimeAsync(1_100);
      const persisted = await repo.findOne({ where: { id: task.id } });
      expect(persisted).toMatchObject({
        enabled: true,
        state: 'active',
        runCount: 0,
        lastRunStatus: 'failed',
        lastError: 'provider unavailable',
        consecutiveFailures: 1,
      });
      expect(persisted?.nextRetryAt).toBeInstanceOf(Date);
      expect(sendMessage).toHaveBeenCalledTimes(1);
    });

    it('clears persisted failure metadata after a later successful cron run', async () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const sendMessage = vi.fn()
        .mockRejectedValueOnce(new Error('temporary provider outage'))
        .mockResolvedValue(undefined);
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService(sendMessage), localIdentity);
      const task = await manager.addTask({
        agentInstanceId: 'recovering-agent',
        scheduleKind: 'cron',
        schedule: { kind: 'cron', expression: '* * * * *' },
      });

      await vi.advanceTimersByTimeAsync(61_000);
      expect(await repo.findOne({ where: { id: task.id } })).toMatchObject({
        lastRunStatus: 'failed',
        lastError: 'temporary provider outage',
        consecutiveFailures: 1,
        runCount: 0,
      });

      await vi.advanceTimersByTimeAsync(60_000);
      expect(await repo.findOne({ where: { id: task.id } })).toMatchObject({
        lastRunStatus: 'succeeded',
        lastError: null,
        lastFailureAt: null,
        consecutiveFailures: 0,
        nextRetryAt: null,
        runCount: 1,
      });
    });

    it('does not overlap cron turns while a previous agent run is pending', async () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      let release!: () => void;
      const sendMessage = vi.fn(() =>
        new Promise<void>(resolve => {
          release = resolve;
        })
      );
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService(sendMessage), localIdentity);
      await manager.addTask({
        agentInstanceId: 'slow-agent',
        scheduleKind: 'cron',
        schedule: { kind: 'cron', expression: '* * * * *' },
      });

      await vi.advanceTimersByTimeAsync(121_000);
      expect(sendMessage).toHaveBeenCalledTimes(1);

      release();
      vi.runAllTicks();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(sendMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('removeTask', () => {
    it('stops and removes the timer', async () => {
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService(), localIdentity);

      const task = await manager.addTask({
        agentInstanceId: 'agent-3',
        scheduleKind: 'cron',
        schedule: { kind: 'cron', expression: '* * * * *' },
        enabled: true,
      });

      expect(await manager.getActiveTasksForAgent('agent-3')).toHaveLength(1);
      await manager.removeTask(task.id);
      expect(await manager.getActiveTasksForAgent('agent-3')).toHaveLength(0);
    });
  });

  describe('updateTask', () => {
    it('restarts timer when schedule changes', async () => {
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService(), localIdentity);

      const task = await manager.addTask({
        agentInstanceId: 'agent-4',
        scheduleKind: 'cron',
        schedule: { kind: 'cron', expression: '* * * * *' },
        enabled: true,
      });

      const updated = await manager.updateTask({ id: task.id, enabled: false });
      expect(updated.enabled).toBe(false);
      expect(await manager.getActiveTasksForAgent('agent-4')).toHaveLength(0);
    });

    it('does not mutate or save a task when the replacement cron is invalid', async () => {
      const existing = makeEntity({ id: 'task-update-invalid' });
      const repo = makeRepo([existing]);
      manager.initScheduledTaskManager(repo, makeAgentService(), localIdentity);
      await expect(manager.updateTask({
        id: existing.id,
        schedule: { kind: 'cron', expression: 'invalid' },
      })).rejects.toThrow('scheduled_task_invalid_cron');
      expect(repo.save).not.toHaveBeenCalled();
      expect((await repo.findOne({ where: { id: existing.id } }))?.schedule).toEqual({ kind: 'cron', expression: '* * * * *' });
    });

    it('persists explicit nulls when RPC/editor updates clear optional fields', async () => {
      const existing = makeEntity({
        activeHoursEnd: '17:00',
        activeHoursStart: '09:00',
        executionNodeLabel: 'Old label',
        id: 'task-clear-optionals',
        payload: { message: 'old message' },
      });
      const repo = makeRepo([existing]);
      manager.initScheduledTaskManager(repo, makeAgentService(), localIdentity);

      const updated = await manager.updateTask({
        id: existing.id,
        activeHoursEnd: null,
        activeHoursStart: null,
        executionNodeLabel: null,
        payload: null,
      });

      expect(updated).toMatchObject({
        activeHoursEnd: undefined,
        activeHoursStart: undefined,
        executionNodeLabel: undefined,
        payload: undefined,
      });
      expect(await repo.findOne({ where: { id: existing.id } })).toMatchObject({
        activeHoursEnd: null,
        activeHoursStart: null,
        executionNodeLabel: null,
        payload: null,
      });
    });
  });

  describe('cancelTasksForAgent', () => {
    it('cancels all tasks for a given agent', async () => {
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService(), localIdentity);

      await manager.addTask({ agentInstanceId: 'agent-5', scheduleKind: 'cron', schedule: { kind: 'cron', expression: '* * * * *' }, enabled: true });
      await manager.addTask({ agentInstanceId: 'agent-5', scheduleKind: 'cron', schedule: { kind: 'cron', expression: '*/2 * * * *' }, enabled: true });
      await manager.addTask({ agentInstanceId: 'agent-6', scheduleKind: 'cron', schedule: { kind: 'cron', expression: '* * * * *' }, enabled: true });

      expect(await manager.getActiveTasksForAgent('agent-5')).toHaveLength(2);

      await manager.cancelTasksForAgent('agent-5');

      expect(await manager.getActiveTasksForAgent('agent-5')).toHaveLength(0);
      expect(await manager.getActiveTasksForAgent('agent-6')).toHaveLength(1);
    });
  });

  describe('restoreScheduledTasks', () => {
    it('restores enabled non-volatile tasks', async () => {
      const entities = [
        makeEntity({ id: 'task-restore-1', agentInstanceId: 'agent-7', enabled: true }),
        makeEntity({ id: 'task-restore-2', agentInstanceId: 'agent-8', enabled: false, state: 'paused' }),
      ];
      const repo = makeRepo(entities);
      const agentService = makeAgentService();
      manager.initScheduledTaskManager(repo, agentService, localIdentity);

      // All non-volatile
      const isVolatile = vi.fn(async () => false);
      await manager.restoreScheduledTasks(repo, isVolatile);

      // Only the enabled task should be in the active entries
      expect(await manager.getActiveTasksForAgent('agent-7')).toHaveLength(1);
      expect(await manager.getActiveTasksForAgent('agent-8')).toHaveLength(0);
    });

    it('skips volatile agent instances', async () => {
      const entities = [
        makeEntity({ id: 'task-volatile', agentInstanceId: 'volatile-agent', enabled: true }),
      ];
      const repo = makeRepo(entities);
      const sendMessage = vi.fn().mockResolvedValue(undefined);
      manager.initScheduledTaskManager(repo, makeAgentService(sendMessage), localIdentity);

      const isVolatile = vi.fn(async (id: string) => id === 'volatile-agent');
      await manager.restoreScheduledTasks(repo, isVolatile);

      // It remains queryable as persisted metadata, but no local timer was
      // installed for a volatile preview/sub-agent instance.
      await vi.advanceTimersByTimeAsync(61_000);
      expect(sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('active hours filtering', () => {
    it('fires a cron task when no active-hours restriction is set', async () => {
      const sendMsg = vi.fn().mockResolvedValue(undefined);
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService(sendMsg), localIdentity);

      await manager.addTask({
        agentInstanceId: 'agent-active',
        scheduleKind: 'cron',
        schedule: { kind: 'cron', expression: '* * * * *' },
        enabled: true,
        // No activeHoursStart / activeHoursEnd — always fires
      });

      // Advance timer by 60s to trigger the interval
      await vi.advanceTimersByTimeAsync(61_000);
      expect(sendMsg).toHaveBeenCalled();
    });

    it('skips when outside a narrow active hours window (00:00-00:01)', async () => {
      // Use a window that only covers 00:00-00:01 — nearly always outside.
      // Set mocked time well outside that window (e.g. 06:00 UTC = 06:00 local in any UTC timezone).
      const outside = new Date('2026-03-06T06:00:00.000Z');
      vi.setSystemTime(outside);

      const sendMsg = vi.fn().mockResolvedValue(undefined);
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService(sendMsg), localIdentity);

      await manager.addTask({
        agentInstanceId: 'agent-inactive',
        scheduleKind: 'cron',
        schedule: { kind: 'cron', expression: '* * * * *' },
        enabled: true,
        activeHoursStart: '00:00',
        activeHoursEnd: '00:01',
      });

      await vi.advanceTimersByTimeAsync(61_000);
      // 06:00 is outside 00:00-00:01, so sendMsg should NOT be called
      expect(sendMsg).not.toHaveBeenCalled();
    });

    it('evaluates active hours in the cron timezone rather than the host timezone', async () => {
      vi.setSystemTime(new Date('2026-03-06T06:00:00.000Z')); // 22:00 previous day in Los Angeles
      const sendMsg = vi.fn().mockResolvedValue(undefined);
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService(sendMsg), localIdentity);
      await manager.addTask({
        agentInstanceId: 'timezone-agent',
        scheduleKind: 'cron',
        schedule: { kind: 'cron', expression: '* * * * *', timezone: 'America/Los_Angeles' },
        activeHoursStart: '22:00',
        activeHoursEnd: '22:10',
      });
      await vi.advanceTimersByTimeAsync(61_000);
      expect(sendMsg).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCronPreviewDates', () => {
    it('returns N next run dates for a valid expression', () => {
      const dates = manager.getCronPreviewDates('0 9 * * *', undefined, 3);
      expect(dates).toHaveLength(3);
      for (const date of dates) {
        expect(() => new Date(date)).not.toThrow();
      }
    });

    it('returns empty array for invalid cron expression', () => {
      const dates = manager.getCronPreviewDates('NOT_A_CRON', undefined, 3);
      expect(dates).toHaveLength(0);
    });

    it('returns empty array for an invalid timezone', () => {
      expect(manager.getCronPreviewDates('* * * * *', 'Mars/Olympus', 3)).toEqual([]);
    });
  });
});
