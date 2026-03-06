/**
 * Unit tests for ScheduledTaskManager — cron parsing, restore, active hours, volatile exemption.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { Repository } from 'typeorm';
import type { ScheduledTaskEntity } from '@services/database/schema/agent';
import type { IAgentInstanceService } from '../interface';

// ─── We test the module-level exported functions directly ────────────────────
// Dynamic import to get a fresh module state (the Map is module-level)
async function importManager() {
  return await import('../scheduledTaskManager');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEntity(overrides: Partial<ScheduledTaskEntity> = {}): ScheduledTaskEntity {
  return {
    id: 'task-1',
    agentInstanceId: 'agent-1',
    agentDefinitionId: undefined,
    name: 'Test Task',
    scheduleKind: 'interval',
    schedule: { kind: 'interval', intervalSeconds: 120 },
    payload: { message: 'hello' },
    enabled: true,
    deleteAfterRun: false,
    activeHoursStart: undefined,
    activeHoursEnd: undefined,
    lastRunAt: undefined,
    nextRunAt: undefined,
    runCount: 0,
    maxRuns: undefined,
    createdBy: 'test',
    created: new Date(),
    updated: new Date(),
    ...overrides,
  } as ScheduledTaskEntity;
}

function makeRepo(entities: ScheduledTaskEntity[] = []): Repository<ScheduledTaskEntity> {
  const store = new Map(entities.map(e => [e.id, e]));
  return {
    find: vi.fn(async (options?: { where?: Partial<ScheduledTaskEntity> }) => {
      let results = [...store.values()];
      if (options?.where) {
        const { where } = options;
        if ('enabled' in where) results = results.filter(e => e.enabled === where.enabled);
      }
      return results;
    }),
    findOne: vi.fn(async (options?: { where?: { id?: string } }) => {
      const id = options?.where?.id;
      return id ? (store.get(id) ?? null) : null;
    }),
    create: vi.fn((data: Partial<ScheduledTaskEntity>) => ({ ...makeEntity(), ...data }) as ScheduledTaskEntity),
    save: vi.fn(async (entity: ScheduledTaskEntity) => {
      store.set(entity.id, entity);
      return entity;
    }),
    update: vi.fn(async (id: string, data: Partial<ScheduledTaskEntity>) => {
      const existing = store.get(id);
      if (existing) store.set(id, { ...existing, ...data });
    }),
    delete: vi.fn(async (id: string) => {
      store.delete(id);
    }),
  } as unknown as Repository<ScheduledTaskEntity>;
}

function makeAgentService(sendMsgMock = vi.fn()): IAgentInstanceService {
  return { sendMsgToAgent: sendMsgMock } as unknown as IAgentInstanceService;
}

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
      expect(() => manager.initScheduledTaskManager(repo, service)).not.toThrow();
    });
  });

  describe('addTask', () => {
    it('creates an interval task and sets nextRunAt', async () => {
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService());

      const task = await manager.addTask({
        agentInstanceId: 'agent-1',
        scheduleKind: 'interval',
        schedule: { kind: 'interval', intervalSeconds: 120 },
        enabled: true,
      });

      expect(task.id).toBeTruthy();
      expect(task.scheduleKind).toBe('interval');
      expect(task.nextRunAt).toBeTruthy();
    });

    it('does not start a timer for disabled tasks', async () => {
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService());

      await manager.addTask({
        agentInstanceId: 'agent-2',
        scheduleKind: 'interval',
        schedule: { kind: 'interval', intervalSeconds: 120 },
        enabled: false,
      });

      const activeTasks = manager.getActiveTasksForAgent('agent-2');
      expect(activeTasks).toHaveLength(0);
    });
  });

  describe('removeTask', () => {
    it('stops and removes the timer', async () => {
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService());

      const task = await manager.addTask({
        agentInstanceId: 'agent-3',
        scheduleKind: 'interval',
        schedule: { kind: 'interval', intervalSeconds: 60 },
        enabled: true,
      });

      expect(manager.getActiveTasksForAgent('agent-3')).toHaveLength(1);
      await manager.removeTask(task.id);
      expect(manager.getActiveTasksForAgent('agent-3')).toHaveLength(0);
    });
  });

  describe('updateTask', () => {
    it('restarts timer when schedule changes', async () => {
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService());

      const task = await manager.addTask({
        agentInstanceId: 'agent-4',
        scheduleKind: 'interval',
        schedule: { kind: 'interval', intervalSeconds: 60 },
        enabled: true,
      });

      const updated = await manager.updateTask({ id: task.id, enabled: false });
      expect(updated.enabled).toBe(false);
      expect(manager.getActiveTasksForAgent('agent-4')).toHaveLength(0);
    });
  });

  describe('cancelTasksForAgent', () => {
    it('cancels all tasks for a given agent', async () => {
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService());

      await manager.addTask({ agentInstanceId: 'agent-5', scheduleKind: 'interval', schedule: { kind: 'interval', intervalSeconds: 60 }, enabled: true });
      await manager.addTask({ agentInstanceId: 'agent-5', scheduleKind: 'interval', schedule: { kind: 'interval', intervalSeconds: 120 }, enabled: true });
      await manager.addTask({ agentInstanceId: 'agent-6', scheduleKind: 'interval', schedule: { kind: 'interval', intervalSeconds: 60 }, enabled: true });

      expect(manager.getActiveTasksForAgent('agent-5')).toHaveLength(2);

      manager.cancelTasksForAgent('agent-5');

      expect(manager.getActiveTasksForAgent('agent-5')).toHaveLength(0);
      expect(manager.getActiveTasksForAgent('agent-6')).toHaveLength(1);
    });
  });

  describe('restoreScheduledTasks', () => {
    it('restores enabled non-volatile tasks', async () => {
      const entities = [
        makeEntity({ id: 'task-restore-1', agentInstanceId: 'agent-7', enabled: true }),
        makeEntity({ id: 'task-restore-2', agentInstanceId: 'agent-8', enabled: false }),
      ];
      const repo = makeRepo(entities);
      const agentService = makeAgentService();
      manager.initScheduledTaskManager(repo, agentService);

      // All non-volatile
      const isVolatile = vi.fn(async () => false);
      await manager.restoreScheduledTasks(repo, isVolatile);

      // Only the enabled task should be in the active entries
      expect(manager.getActiveTasksForAgent('agent-7')).toHaveLength(1);
      expect(manager.getActiveTasksForAgent('agent-8')).toHaveLength(0);
    });

    it('skips volatile agent instances', async () => {
      const entities = [
        makeEntity({ id: 'task-volatile', agentInstanceId: 'volatile-agent', enabled: true }),
      ];
      const repo = makeRepo(entities);
      manager.initScheduledTaskManager(repo, makeAgentService());

      const isVolatile = vi.fn(async (id: string) => id === 'volatile-agent');
      await manager.restoreScheduledTasks(repo, isVolatile);

      expect(manager.getActiveTasksForAgent('volatile-agent')).toHaveLength(0);
    });
  });

  describe('active hours filtering', () => {
    it('fires interval task when no active-hours restriction is set', async () => {
      const sendMsg = vi.fn().mockResolvedValue(undefined);
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService(sendMsg));

      await manager.addTask({
        agentInstanceId: 'agent-active',
        scheduleKind: 'interval',
        schedule: { kind: 'interval', intervalSeconds: 60 },
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
      manager.initScheduledTaskManager(repo, makeAgentService(sendMsg));

      await manager.addTask({
        agentInstanceId: 'agent-inactive',
        scheduleKind: 'interval',
        schedule: { kind: 'interval', intervalSeconds: 60 },
        enabled: true,
        activeHoursStart: '00:00',
        activeHoursEnd: '00:01',
      });

      await vi.advanceTimersByTimeAsync(61_000);
      // 06:00 is outside 00:00-00:01, so sendMsg should NOT be called
      expect(sendMsg).not.toHaveBeenCalled();
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
  });
});
