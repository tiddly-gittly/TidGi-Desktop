import { ScheduledTaskEntity } from '@services/database/schema/agent';
import { DataSource, type Repository } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IAgentInstanceService } from '../interface';
import { getScheduledTasksPageForAgent, getTaskByScope, initScheduledTaskManager, removeTaskScoped, stopAllScheduledTasks, updateTaskScoped } from '../tools/scheduledTaskManager';

const AGENT_ID = 'agent-page';
const NODE_ID = 'peer-page';

function row(index: number, state: ScheduledTaskEntity['state'] = 'active'): Partial<ScheduledTaskEntity> {
  const updated = new Date(Date.UTC(2026, 0, 1, 0, 0, index));
  return {
    id: `task-${String(index).padStart(6, '0')}`,
    agentInstanceId: AGENT_ID,
    agentDefinitionId: 'definition-page',
    name: `Task ${index}`,
    scheduleKind: 'cron',
    schedule: { kind: 'cron', expression: '0 9 * * *' },
    enabled: state === 'active',
    state,
    executionNodeId: NODE_ID,
    originNodeId: NODE_ID,
    deleteAfterRun: false,
    consecutiveFailures: 0,
    runCount: 0,
    createdBy: 'integration-test',
    created: updated,
    updated,
  };
}

describe('scheduled-task bounded keyset paging', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [ScheduledTaskEntity],
      synchronize: true,
    });
    await dataSource.initialize();
    initScheduledTaskManager(
      dataSource.getRepository(ScheduledTaskEntity),
      {} as IAgentInstanceService,
      async () => ({ peerId: NODE_ID }),
    );
  });

  afterEach(async () => {
    stopAllScheduledTasks();
    await dataSource.destroy();
  });

  it('keeps a 10k-row query page bounded and uses the composite paging index', async () => {
    const repository = dataSource.getRepository(ScheduledTaskEntity);
    for (let start = 0; start < 10_000; start += 500) {
      await repository.insert(Array.from({ length: 500 }, (_, offset) => row(start + offset)));
    }

    const page = await getScheduledTasksPageForAgent({
      agentInstanceId: AGENT_ID,
      executionNodeId: NODE_ID,
      states: ['active'],
      limit: 64,
    });
    expect(page.items).toHaveLength(64);
    expect(page.next).toBeDefined();
    expect(new Set(page.items.map(task => task.id)).size).toBe(64);

    const plan = await dataSource.query<Array<{ detail?: string }>>(
      'EXPLAIN QUERY PLAN SELECT * FROM scheduled_tasks WHERE agentInstanceId = ? AND executionNodeId = ? AND state IN (?) ORDER BY updated DESC, id DESC LIMIT 65',
      [AGENT_ID, NODE_ID, 'active'],
    );
    expect(plan.some(entry => entry.detail?.includes('IDX_scheduled_task_rpc_page'))).toBe(true);
  }, 30_000);

  it('continues by stable updated/id keyset without duplicates', async () => {
    const repository = dataSource.getRepository(ScheduledTaskEntity);
    await repository.insert(Array.from({ length: 6 }, (_, index) => row(index)));
    const first = await getScheduledTasksPageForAgent({
      agentInstanceId: AGENT_ID,
      executionNodeId: NODE_ID,
      states: ['active'],
      limit: 3,
    });
    const second = await getScheduledTasksPageForAgent({
      agentInstanceId: AGENT_ID,
      executionNodeId: NODE_ID,
      states: ['active'],
      limit: 3,
      after: first.next,
      expectedRevision: first.revision,
    });
    expect(new Set([...first.items, ...second.items].map(task => task.id)).size).toBe(6);
  });

  it.each([
    ['concurrent insert', async (repository: Repository<ScheduledTaskEntity>) => {
      await repository.insert(row(99));
    }],
    ['archive', async (repository: Repository<ScheduledTaskEntity>) => {
      await repository.update('task-000001', { state: 'archived', enabled: false, updated: new Date(Date.UTC(2027, 0, 1)) });
    }],
  ])('rejects a stale cursor after %s', async (_label, mutate) => {
    const repository = dataSource.getRepository(ScheduledTaskEntity);
    await repository.insert(Array.from({ length: 4 }, (_, index) => row(index)));
    const first = await getScheduledTasksPageForAgent({
      agentInstanceId: AGENT_ID,
      executionNodeId: NODE_ID,
      states: ['active'],
      limit: 2,
    });
    await mutate(repository);
    await expect(getScheduledTasksPageForAgent({
      agentInstanceId: AGENT_ID,
      executionNodeId: NODE_ID,
      states: ['active'],
      limit: 2,
      after: first.next,
      expectedRevision: first.revision,
    })).rejects.toThrow('scheduled_task_cursor_stale');
  });

  it('does not start a database read after cancellation', async () => {
    const repository = dataSource.getRepository(ScheduledTaskEntity);
    const querySpy = vi.spyOn(repository, 'createQueryBuilder');
    const abortController = new AbortController();
    abortController.abort(new Error('superseded'));
    await expect(getScheduledTasksPageForAgent({
      agentInstanceId: AGENT_ID,
      executionNodeId: NODE_ID,
      states: ['active'],
      limit: 10,
      signal: abortController.signal,
    })).rejects.toThrow('superseded');
    expect(querySpy).not.toHaveBeenCalled();
  });

  it('matches the complete resource tuple for atomic updates and deletes', async () => {
    const repository = dataSource.getRepository(ScheduledTaskEntity);
    await repository.insert(row(1));
    const scope = {
      taskId: 'task-000001',
      agentInstanceId: AGENT_ID,
      agentDefinitionId: 'definition-page',
      executionNodeId: NODE_ID,
    };

    await expect(updateTaskScoped(
      { ...scope, agentDefinitionId: 'definition-other' },
      { id: scope.taskId, enabled: false },
    )).rejects.toThrow('scheduled_task_scope_unavailable');
    await expect(updateTaskScoped(scope, {
      id: 'task-other',
      enabled: false,
    })).rejects.toThrow('scheduled_task_scope_unavailable');
    await expect(updateTaskScoped(scope, {
      id: scope.taskId,
      agentDefinitionId: 'definition-other',
      enabled: false,
    })).rejects.toThrow('scheduled_task_scope_unavailable');
    await expect(updateTaskScoped(scope, {
      id: scope.taskId,
      executionNodeId: 'peer-other',
      enabled: false,
    })).rejects.toThrow('scheduled_task_scope_unavailable');
    expect((await repository.findOneByOrFail({ id: scope.taskId })).enabled).toBe(true);

    const updated = await updateTaskScoped(scope, {
      id: scope.taskId,
      name: 'Updated atomically',
      enabled: false,
    });
    expect(updated).toMatchObject({ name: 'Updated atomically', enabled: false, state: 'paused' });
    await expect(getTaskByScope(scope)).resolves.toMatchObject({ id: scope.taskId });

    await expect(removeTaskScoped({ ...scope, executionNodeId: 'peer-other' }))
      .rejects.toThrow('scheduled_task_scope_unavailable');
    await removeTaskScoped(scope);
    expect(await repository.findOneByOrFail({ id: scope.taskId })).toMatchObject({
      enabled: false,
      state: 'cancelled',
    });
  });

  it('rolls scoped mutations back when cancellation wins during the transaction', async () => {
    const repository = dataSource.getRepository(ScheduledTaskEntity);
    await repository.insert(row(2));
    const scope = {
      taskId: 'task-000002',
      agentInstanceId: AGENT_ID,
      agentDefinitionId: 'definition-page',
      executionNodeId: NODE_ID,
    };
    const controller = new AbortController();
    controller.abort(new Error('superseded'));

    await expect(updateTaskScoped(scope, {
      id: scope.taskId,
      name: 'must not persist',
    }, { signal: controller.signal })).rejects.toThrow('superseded');
    expect((await repository.findOneByOrFail({ id: scope.taskId })).name).toBe('Task 2');
  });
});
