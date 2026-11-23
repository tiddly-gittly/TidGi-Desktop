/**
 * Unit tests for ScheduledTaskManager — cron parsing, restore, active hours, volatile exemption.
 */

import { ScheduledTaskEntity } from '@services/database/schema/agent';
import type { CreateScheduledTaskInput } from 'memeloop';
import { DataSource, type Repository } from 'typeorm';
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
    executionRevision: overrides.executionRevision ?? 0,
    state: overrides.state ?? 'active',
    executionNodeId: overrides.executionNodeId ?? 'local',
    executionNodeLabel: overrides.executionNodeLabel,
    originNodeId: overrides.originNodeId ?? 'local',
  };
}

function makeRepo(entities: ScheduledTaskEntity[] = []): Repository<ScheduledTaskEntity> {
  const store = new Map(entities.map(e => [e.id, structuredClone(e)]));
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
      return structuredClone(results);
    }),
    findOne: vi.fn(async (options?: { where?: { id?: string } }) => {
      const id = options?.where?.id;
      return id ? structuredClone(store.get(id) ?? null) : null;
    }),
    findOneByOrFail: vi.fn(async ({ id }: { id: string }) => {
      const entity = store.get(id);
      if (!entity) throw new Error(`Missing task: ${id}`);
      return structuredClone(entity);
    }),
    create: vi.fn((data: Partial<ScheduledTaskEntity>) => (Object.assign(makeEntity(), data))),
    save: vi.fn(async (entity: ScheduledTaskEntity) => {
      store.set(entity.id, structuredClone(entity));
      return structuredClone(entity);
    }),
    update: vi.fn(async (criteria: string | Partial<ScheduledTaskEntity>, data: Partial<ScheduledTaskEntity>) => {
      const matches = typeof criteria === 'string'
        ? [...store.values()].filter(entity => entity.id === criteria)
        : [...store.values()].filter(entity => Object.entries(criteria).every(([key, value]) => entity[key as keyof ScheduledTaskEntity] === value));
      for (const existing of matches) {
        const values = Object.fromEntries(
          Object.entries(data).map(([key, value]) => [
            key,
            typeof value === 'function'
              ? (key === 'executionRevision' ? existing.executionRevision + 1 : null)
              : value,
          ]),
        );
        store.set(existing.id, structuredClone(Object.assign({}, existing, values)));
      }
      return { affected: matches.length, generatedMaps: [], raw: [] };
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

function createInput(overrides: Partial<CreateScheduledTaskInput> = {}): CreateScheduledTaskInput {
  const schedule = overrides.schedule ?? { kind: 'cron' as const, expression: '* * * * *' };
  return {
    agentInstanceId: 'agent-1',
    agentDefinitionId: 'definition-1',
    name: 'Test task',
    executionNodeId: 'peer-desktop',
    originNodeId: 'peer-desktop',
    ...overrides,
    schedule,
    scheduleKind: schedule.kind,
  };
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
      expect(() => {
        manager.initScheduledTaskManager(repo, service, localIdentity);
      }).not.toThrow();
    });
  });

  describe('addTask', () => {
    it('creates a cron task and sets nextRunAt', async () => {
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService(), localIdentity);

      const task = await manager.addTask(createInput({
        agentInstanceId: 'agent-1',
        schedule: { kind: 'cron', expression: '* * * * *' },
        enabled: true,
      }));

      expect(task.id).toBeTruthy();
      expect(task.schedule.kind).toBe('cron');
      expect(task.nextRunAt).toBeTruthy();
      expect(task).toMatchObject({
        executionNodeId: 'peer-desktop',
        executionNodeLabel: 'Test Desktop',
        originNodeId: 'peer-desktop',
      });
    });

    it('rejects task creation when the stable local PeerId cannot be loaded', async () => {
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService(), async () => {
        throw new Error('keychain unavailable');
      });
      await expect(manager.addTask(createInput({
        agentInstanceId: 'agent-no-identity',
        schedule: { kind: 'cron', expression: '* * * * *' },
      }))).rejects.toThrow('scheduled_task_identity_unavailable');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects a task labelled for another execution node on this manager', async () => {
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService(), localIdentity);
      await expect(manager.addTask(createInput({
        agentInstanceId: 'agent-wrong-node',
        schedule: { kind: 'cron', expression: '* * * * *' },
        executionNodeId: 'peer-mobile',
      }))).rejects.toThrow('scheduled_task_wrong_execution_node:peer-mobile');
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

      await expect(manager.addTask(createInput({
        agentInstanceId: 'preview-agent',
        agentDefinitionId: 'definition-1',
        name: 'Must not survive preview cleanup',
        schedule: { kind: 'cron', expression: '* * * * *' },
      }))).rejects.toThrow('scheduled_task_volatile_agent');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('does not start a timer for disabled tasks', async () => {
      const repo = makeRepo();
      const sendMessage = vi.fn();
      manager.initScheduledTaskManager(repo, makeAgentService(sendMessage), localIdentity);

      await manager.addTask(createInput({
        agentInstanceId: 'agent-2',
        schedule: { kind: 'cron', expression: '* * * * *' },
        enabled: false,
      }));

      const activeTasks = await manager.getActiveTasksForAgent('agent-2', { states: ['active'] });
      expect(activeTasks).toHaveLength(0);
      expect(await manager.getActiveTasksForAgent('agent-2')).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(61_000);
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it.each([
      [{ kind: 'cron' as const, expression: 'NOT_A_CRON' }, 'scheduled_task_invalid_cron'],
      [{ kind: 'cron' as const, expression: '* * * * *', timezone: 'Mars/Olympus' }, 'scheduled_task_invalid_timezone'],
    ])('rejects an invalid schedule before persistence', async (schedule, expectedError) => {
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService(), localIdentity);
      await expect(manager.addTask(createInput({
        agentInstanceId: 'invalid-agent',
        schedule,
      }))).rejects.toThrow(expectedError);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('segments a one-shot timer beyond the Node 32-bit timeout limit', async () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService(), localIdentity);
      await manager.addTask(createInput({
        agentInstanceId: 'far-future-agent',
        schedule: { kind: 'at', wakeAtISO: '2026-03-01T00:00:00.000Z' },
      }));
      const scheduledDelay = timeoutSpy.mock.calls.find(call => typeof call[1] === 'number')?.[1] as number;
      expect(scheduledDelay).toBeLessThanOrEqual(2_147_000_000);
      expect(scheduledDelay).toBeGreaterThan(2_000_000_000);
    });

    it('persists failure and retries a one-shot task without counting or completing it', async () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const sendMessage = vi.fn().mockRejectedValue(new Error('provider unavailable'));
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService(sendMessage), localIdentity);
      const task = await manager.addTask(createInput({
        agentInstanceId: 'retry-agent',
        schedule: { kind: 'at', wakeAtISO: '2026-01-01T00:00:01.000Z' },
      }));
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
      const task = await manager.addTask(createInput({
        agentInstanceId: 'recovering-agent',
        schedule: { kind: 'cron', expression: '* * * * *' },
      }));

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
      await manager.addTask(createInput({
        agentInstanceId: 'slow-agent',
        schedule: { kind: 'cron', expression: '* * * * *' },
      }));

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

      const task = await manager.addTask(createInput({
        agentInstanceId: 'agent-3',
        schedule: { kind: 'cron', expression: '* * * * *' },
        enabled: true,
      }));

      expect(await manager.getActiveTasksForAgent('agent-3')).toHaveLength(1);
      await manager.removeTask(task.id);
      expect(await manager.getActiveTasksForAgent('agent-3')).toHaveLength(0);
    });
  });

  describe('in-flight task invalidation', () => {
    const schedules = [
      { kind: 'at' as const, wakeAtISO: '2026-01-01T00:00:01.000Z' },
      { kind: 'cron' as const, expression: '* * * * *' },
    ];

    beforeEach(() => {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    });

    describe.each(schedules)('$kind provider execution', (schedule) => {
      it.each(
        [
          ['cancel', 'resolve'],
          ['cancel', 'reject'],
          ['pause', 'resolve'],
          ['pause', 'reject'],
        ] as const,
      )('does not change metadata or restart after %s then %s', async (action, outcome) => {
        const pending = Promise.withResolvers<undefined>();
        const send = vi.fn().mockReturnValue(pending.promise);
        const repo = makeRepo();
        manager.initScheduledTaskManager(repo, makeAgentService(send), localIdentity);
        const task = await manager.addTask(createInput({ schedule }));
        await vi.advanceTimersByTimeAsync(schedule.kind === 'at' ? 1_000 : 60_000);
        expect(send).toHaveBeenCalledTimes(1);

        if (action === 'cancel') await manager.removeTask(task.id);
        else await manager.updateTask(task.id, { enabled: false });
        const afterMutation = await repo.findOne({ where: { id: task.id } });
        vi.mocked(repo.update).mockClear();
        if (outcome === 'resolve') pending.resolve(undefined);
        else pending.reject(new Error('late provider failure'));

        await vi.advanceTimersByTimeAsync(180_000);
        expect(send).toHaveBeenCalledTimes(1);
        expect(repo.update).not.toHaveBeenCalled();
        expect(await repo.findOne({ where: { id: task.id } })).toEqual(afterMutation);
        expect(vi.getTimerCount()).toBe(0);
      });

      it.each(['resolve', 'reject'] as const)('preserves the replacement after the previous run settles with %s', async outcome => {
        const pending = Promise.withResolvers<undefined>();
        const send = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(undefined);
        const repo = makeRepo();
        manager.initScheduledTaskManager(repo, makeAgentService(send), localIdentity);
        const task = await manager.addTask(createInput({ schedule }));
        await vi.advanceTimersByTimeAsync(schedule.kind === 'at' ? 1_000 : 60_000);
        const wakeAt = new Date(Date.now() + 300_000);
        await manager.updateTask(task.id, {
          schedule: { kind: 'at', wakeAtISO: wakeAt.toISOString() },
          payload: { message: 'replacement message' },
        });
        const replacement = await repo.findOne({ where: { id: task.id } });
        vi.mocked(repo.update).mockClear();
        if (outcome === 'resolve') pending.resolve(undefined);
        else pending.reject(new Error('obsolete provider failure'));

        await vi.advanceTimersByTimeAsync(299_999);
        expect(send).toHaveBeenCalledTimes(1);
        expect(repo.update).not.toHaveBeenCalled();
        expect(await repo.findOne({ where: { id: task.id } })).toEqual(replacement);
        await vi.advanceTimersByTimeAsync(1);
        expect(send).toHaveBeenCalledTimes(2);
        expect(send.mock.calls[1][0]).toMatchObject({ message: 'replacement message' });
        expect(await repo.findOne({ where: { id: task.id } })).toMatchObject({ state: 'completed', runCount: 1 });
      });

      it('does not invoke the provider if cancelled during the durable-agent lookup', async () => {
        const send = vi.fn();
        const service = makeAgentService(send);
        const repo = makeRepo();
        manager.initScheduledTaskManager(repo, service, localIdentity);
        const task = await manager.addTask(createInput({ schedule }));
        const lookup = Promise.withResolvers<Awaited<ReturnType<IAgentInstanceService['getAgentMetadata']>>>();
        vi.mocked(service.getAgentMetadata).mockReturnValueOnce(lookup.promise);
        await vi.advanceTimersByTimeAsync(schedule.kind === 'at' ? 1_000 : 60_000);
        await manager.removeTask(task.id);
        lookup.resolve({ agentDefId: 'definition-1', id: 'agent-1' } as never);
        await vi.advanceTimersByTimeAsync(180_000);
        expect(send).not.toHaveBeenCalled();
      });
    });

    describe.each(
      [
        ['at retry', schedules[0], 'nextRetryAt', false],
        ['at persisted retry', schedules[0], 'nextRetryAt', true],
        ['at completion', schedules[0], 'runCount', false],
        ['cron failure', schedules[1], 'lastError', false],
        ['cron success', schedules[1], 'runCount', false],
      ] as const,
    )('%s SQL write', (_label, schedule, delayedField, persistBeforeWaiting) => {
      it.each(['cancel', 'pause', 'replace'] as const)('ignores an older revision write and callback after %s', async action => {
        const pendingWrite = Promise.withResolvers<undefined>();
        const send = delayedField === 'runCount'
          ? vi.fn().mockResolvedValue(undefined)
          : vi.fn().mockRejectedValue(new Error('provider failure'));
        const repo = makeRepo();
        manager.initScheduledTaskManager(repo, makeAgentService(send), localIdentity);
        const task = await manager.addTask(createInput({ schedule }));
        const applyUpdate = vi.mocked(repo.update).getMockImplementation()!;
        let delayed = false;
        vi.mocked(repo.update).mockImplementation(async (criteria, patch) => {
          if (!delayed && patch[delayedField] != null) {
            delayed = true;
            const result = persistBeforeWaiting ? await applyUpdate(criteria, patch) : undefined;
            await pendingWrite.promise;
            if (result) return result;
          }
          return await applyUpdate(criteria, patch);
        });
        await vi.advanceTimersByTimeAsync(schedule.kind === 'at' ? 1_000 : 60_000);
        expect(delayed).toBe(true);

        if (action === 'cancel') await manager.removeTask(task.id);
        else if (action === 'pause') await manager.updateTask(task.id, { enabled: false });
        else {
          await manager.updateTask(task.id, {
            schedule: { kind: 'at', wakeAtISO: new Date(Date.now() + 300_000).toISOString() },
            payload: { message: 'replacement message' },
          });
        }
        const afterMutation = await repo.findOne({ where: { id: task.id } });
        expect(afterMutation?.executionRevision).toBe(1);
        pendingWrite.resolve(undefined);
        await vi.advanceTimersByTimeAsync(180_000);
        expect(await repo.findOne({ where: { id: task.id } })).toEqual(afterMutation);
        expect(send).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(action === 'replace' ? 1 : 0);
      });
    });

    describe('scoped mutations with SQLite', () => {
      let database: DataSource;

      beforeEach(async () => {
        database = new DataSource({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [ScheduledTaskEntity],
          synchronize: true,
        });
        await database.initialize();
      });

      afterEach(async () => {
        manager.stopAllScheduledTasks();
        await database.destroy();
      });

      it.each(['cancel', 'pause', 'replace'] as const)('rejects old retry SQL after scoped %s', async action => {
        const repo = database.getRepository(ScheduledTaskEntity);
        const send = vi.fn().mockRejectedValue(new Error('provider failure'));
        manager.initScheduledTaskManager(repo, makeAgentService(send), localIdentity);
        const task = await manager.addTask(createInput({ schedule: schedules[0] }));
        const pendingWrite = Promise.withResolvers<undefined>();
        const applyUpdate = repo.update.bind(repo);
        let delayed = false;
        const update = vi.spyOn(repo, 'update').mockImplementation(async (criteria, patch) => {
          if (!delayed && patch.nextRetryAt instanceof Date) {
            delayed = true;
            await pendingWrite.promise;
          }
          return await applyUpdate(criteria, patch);
        });
        await vi.advanceTimersByTimeAsync(1_000);
        expect(delayed).toBe(true);
        const scope = {
          taskId: task.id,
          agentInstanceId: task.agentInstanceId,
          agentDefinitionId: task.agentDefinitionId,
          executionNodeId: task.executionNodeId,
        };
        if (action === 'cancel') await manager.removeTaskScoped(scope);
        else {
          await manager.updateTaskScoped(
            scope,
            action === 'pause' ? { enabled: false } : {
              schedule: { kind: 'at', wakeAtISO: new Date(Date.now() + 300_000).toISOString() },
            },
          );
        }
        await vi.advanceTimersByTimeAsync(0);
        const afterMutation = await repo.findOneByOrFail({ id: task.id });
        expect(afterMutation.executionRevision).toBe(1);
        pendingWrite.resolve(undefined);
        await vi.advanceTimersByTimeAsync(180_000);
        expect(await repo.findOneByOrFail({ id: task.id })).toEqual(afterMutation);
        expect(send).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(action === 'replace' ? 1 : 0);
        update.mockRestore();
      });
    });
  });

  describe('updateTask', () => {
    it('restarts timer when schedule changes', async () => {
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService(), localIdentity);

      const task = await manager.addTask(createInput({
        agentInstanceId: 'agent-4',
        schedule: { kind: 'cron', expression: '* * * * *' },
        enabled: true,
      }));

      const updated = await manager.updateTask(task.id, { enabled: false });
      expect(updated.enabled).toBe(false);
      expect(await manager.getActiveTasksForAgent('agent-4', { states: ['active'] })).toHaveLength(0);
      expect(await manager.getActiveTasksForAgent('agent-4')).toHaveLength(1);
    });

    it('does not mutate or save a task when the replacement cron is invalid', async () => {
      const existing = makeEntity({ id: 'task-update-invalid' });
      const repo = makeRepo([existing]);
      manager.initScheduledTaskManager(repo, makeAgentService(), localIdentity);
      await expect(manager.updateTask(existing.id, {
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

      const updated = await manager.updateTask(existing.id, {
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

      await manager.addTask(createInput({ agentInstanceId: 'agent-5', schedule: { kind: 'cron', expression: '* * * * *' }, enabled: true }));
      await manager.addTask(createInput({ agentInstanceId: 'agent-5', schedule: { kind: 'cron', expression: '*/2 * * * *' }, enabled: true }));
      await manager.addTask(createInput({ agentInstanceId: 'agent-6', schedule: { kind: 'cron', expression: '* * * * *' }, enabled: true }));

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

      // Paused rows remain visible in the Core default page, but only active
      // rows are eligible for timer restoration.
      expect(await manager.getActiveTasksForAgent('agent-7')).toHaveLength(1);
      expect(await manager.getActiveTasksForAgent('agent-8')).toHaveLength(1);
      expect(await manager.getActiveTasksForAgent('agent-8', { states: ['active'] })).toHaveLength(0);
    });

    it('preserves a future one-shot retry time when restoring an overdue schedule', async () => {
      const now = new Date('2026-11-24T08:00:00.000Z');
      vi.setSystemTime(now);
      const wakeAtISO = new Date(now.getTime() - 60_000).toISOString();
      const nextRetryAt = new Date(now.getTime() + 30_000);
      const task = makeEntity({
        scheduleKind: 'at',
        schedule: { kind: 'at', wakeAtISO },
        lastRunStatus: 'failed',
        consecutiveFailures: 1,
        nextRetryAt,
        nextRunAt: nextRetryAt,
      });
      const repo = makeRepo([task]);
      const sendMessage = vi.fn().mockResolvedValue(undefined);
      manager.initScheduledTaskManager(repo, makeAgentService(sendMessage), localIdentity);

      await manager.restoreScheduledTasks(repo, async () => false);
      await vi.advanceTimersByTimeAsync(29_999);
      expect(sendMessage).not.toHaveBeenCalled();
      expect(await repo.findOneByOrFail({ id: task.id })).toMatchObject({
        schedule: { kind: 'at', wakeAtISO },
        nextRunAt: nextRetryAt,
      });

      await vi.advanceTimersByTimeAsync(1);
      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(await repo.findOneByOrFail({ id: task.id })).toMatchObject({
        state: 'completed',
        runCount: 1,
        nextRetryAt: null,
      });
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

      await manager.addTask(createInput({
        agentInstanceId: 'agent-active',
        schedule: { kind: 'cron', expression: '* * * * *' },
        enabled: true,
        // No activeHoursStart / activeHoursEnd — always fires
      }));

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

      await manager.addTask(createInput({
        agentInstanceId: 'agent-inactive',
        schedule: { kind: 'cron', expression: '* * * * *' },
        enabled: true,
        activeHoursStart: '00:00',
        activeHoursEnd: '00:01',
      }));

      await vi.advanceTimersByTimeAsync(61_000);
      // 06:00 is outside 00:00-00:01, so sendMsg should NOT be called
      expect(sendMsg).not.toHaveBeenCalled();
    });

    it('evaluates active hours in the cron timezone rather than the host timezone', async () => {
      vi.setSystemTime(new Date('2026-03-06T06:00:00.000Z')); // 22:00 previous day in Los Angeles
      const sendMsg = vi.fn().mockResolvedValue(undefined);
      const repo = makeRepo();
      manager.initScheduledTaskManager(repo, makeAgentService(sendMsg), localIdentity);
      await manager.addTask(createInput({
        agentInstanceId: 'timezone-agent',
        schedule: { kind: 'cron', expression: '* * * * *', timezone: 'America/Los_Angeles' },
        activeHoursStart: '22:00',
        activeHoursEnd: '22:10',
      }));
      await vi.advanceTimersByTimeAsync(61_000);
      expect(sendMsg).toHaveBeenCalledTimes(1);
    });
  });

  describe('heartbeat cadence', () => {
    const config = { enabled: true, intervalSeconds: 60, message: 'Review pending work' };

    it('waits for a slow run to finish before starting the next interval', async () => {
      const pending = Promise.withResolvers<undefined>();
      const send = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(undefined);
      manager.startHeartbeat('heartbeat-agent', 'definition-1', config, makeAgentService(send));

      await vi.advanceTimersByTimeAsync(60_000);
      expect(send).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(240_000);
      expect(send).toHaveBeenCalledTimes(1);

      pending.resolve(undefined);
      await vi.advanceTimersByTimeAsync(59_999);
      expect(send).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(send).toHaveBeenCalledTimes(2);
    });

    it.each(['stopHeartbeat', 'stopAllScheduledTasks'] as const)('honors %s while a run is pending', async (stop) => {
      const pending = Promise.withResolvers<undefined>();
      const send = vi.fn().mockReturnValue(pending.promise);
      manager.startHeartbeat('heartbeat-agent', 'definition-1', config, makeAgentService(send));
      await vi.advanceTimersByTimeAsync(60_000);

      if (stop === 'stopHeartbeat') manager.stopHeartbeat('heartbeat-agent');
      else manager.stopAllScheduledTasks();
      pending.resolve(undefined);
      await vi.advanceTimersByTimeAsync(180_000);
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('keeps a restarted heartbeat independent of the previous pending run', async () => {
      const previous = Promise.withResolvers<undefined>();
      const send = vi.fn().mockReturnValueOnce(previous.promise).mockResolvedValue(undefined);
      manager.startHeartbeat('heartbeat-agent', 'definition-1', config, makeAgentService(send));
      await vi.advanceTimersByTimeAsync(60_000);
      manager.startHeartbeat('heartbeat-agent', 'definition-1', config, makeAgentService(send));
      await vi.advanceTimersByTimeAsync(30_000);
      previous.resolve(undefined);

      await vi.advanceTimersByTimeAsync(30_000);
      expect(send).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(send).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(send).toHaveBeenCalledTimes(3);
    });

    it('schedules another interval after an execution failure', async () => {
      const send = vi.fn().mockRejectedValueOnce(new Error('Temporary execution failure')).mockResolvedValue(undefined);
      manager.startHeartbeat('heartbeat-agent', 'definition-1', config, makeAgentService(send));
      await vi.advanceTimersByTimeAsync(120_000);
      expect(send).toHaveBeenCalledTimes(2);
    });

    it('rechecks active hours on later ticks', async () => {
      vi.setSystemTime(new Date(2026, 10, 4, 8, 58, 0));
      const send = vi.fn().mockResolvedValue(undefined);
      manager.startHeartbeat('heartbeat-agent', 'definition-1', {
        ...config,
        activeHoursStart: '09:00',
        activeHoursEnd: '17:00',
      }, makeAgentService(send));
      await vi.advanceTimersByTimeAsync(60_000);
      expect(send).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCronPreviewDates', () => {
    it('returns N next run dates for a valid expression', () => {
      const dates = manager.getCronPreviewDates('0 9 * * *', undefined, 3);
      expect(dates).toHaveLength(3);
      for (const date of dates) {
        expect(() => new Date(date)).not.toThrow();
      }
      expect(new Set(dates).size).toBe(3);
      expect(dates).toEqual([...dates].sort());
    });

    it.each([0, -1, 1.5, 11, Number.NaN])('rejects an invalid preview count (%s)', count => {
      expect(manager.getCronPreviewDates('0 9 * * *', undefined, count)).toEqual([]);
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
