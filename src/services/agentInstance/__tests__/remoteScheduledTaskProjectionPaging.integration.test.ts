import { RemoteScheduledTaskProjectionEntity } from '@services/database/schema/agent';
import { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getRemoteScheduledTaskProjectionPage, replaceRemoteScheduledTaskProjections } from '../tools/remoteScheduledTaskProjectionStore';
import type { ScheduledTask } from '../tools/scheduledTaskTypes';

const AGENT_ID = 'agent-projection-page';
const NODE_ID = 'peer-projection-page';

function task(index: number): ScheduledTask {
  const time = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
  return {
    id: `task-${String(index).padStart(6, '0')}`,
    agentInstanceId: AGENT_ID,
    agentDefinitionId: 'definition-page',
    name: `Task ${index}`,
    scheduleKind: 'cron',
    schedule: { kind: 'cron', expression: '0 9 * * *' },
    enabled: true,
    deleteAfterRun: false,
    consecutiveFailures: 0,
    runCount: 0,
    createdBy: 'integration-test',
    created: time,
    updated: time,
    state: 'active',
    executionNodeId: NODE_ID,
    originNodeId: 'peer-local',
  };
}

describe('remote scheduled-task projection keyset paging', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [RemoteScheduledTaskProjectionEntity],
      synchronize: true,
    });
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('keeps a 10k-row cached projection read bounded and indexed', async () => {
    const repository = dataSource.getRepository(RemoteScheduledTaskProjectionEntity);
    for (let start = 0; start < 10_000; start += 500) {
      await repository.insert(Array.from({ length: 500 }, (_, offset) => {
        const value = task(start + offset);
        return {
          id: `${NODE_ID}:${value.id}`,
          taskId: value.id,
          agentInstanceId: AGENT_ID,
          executionNodeId: NODE_ID,
          state: value.state,
          task: value,
          observedAt: start + offset,
        };
      }));
    }
    const page = await getRemoteScheduledTaskProjectionPage(repository, {
      agentInstanceId: AGENT_ID,
      states: ['active'],
      executionNodeIds: [NODE_ID],
      limit: 64,
    });
    expect(page.items).toHaveLength(64);
    expect(page.next).toBeDefined();
    const plan = await dataSource.query<Array<{ detail?: string }>>(
      'EXPLAIN QUERY PLAN SELECT * FROM remote_scheduled_task_projections WHERE agentInstanceId = ? AND state IN (?) ORDER BY observedAt DESC, id DESC LIMIT 65',
      [AGENT_ID, 'active'],
    );
    expect(plan.some(entry => entry.detail?.includes('IDX_remote_scheduled_task_page'))).toBe(true);
  }, 30_000);

  it('rejects stale continuations after a concurrent projection replacement', async () => {
    const repository = dataSource.getRepository(RemoteScheduledTaskProjectionEntity);
    await replaceRemoteScheduledTaskProjections(repository, AGENT_ID, NODE_ID, [task(1), task(2)], 100);
    const first = await getRemoteScheduledTaskProjectionPage(repository, {
      agentInstanceId: AGENT_ID,
      states: ['active'],
      limit: 1,
    });
    await replaceRemoteScheduledTaskProjections(repository, AGENT_ID, NODE_ID, [task(3)], 200);
    await expect(getRemoteScheduledTaskProjectionPage(repository, {
      agentInstanceId: AGENT_ID,
      states: ['active'],
      limit: 1,
      after: first.next,
      expectedRevision: first.revision,
    })).rejects.toThrow('scheduled_task_cursor_stale');
  });

  it('fails closed instead of silently persisting a mixed-owner snapshot', async () => {
    const repository = dataSource.getRepository(RemoteScheduledTaskProjectionEntity);
    await expect(replaceRemoteScheduledTaskProjections(
      repository,
      AGENT_ID,
      NODE_ID,
      [task(1), { ...task(2), executionNodeId: 'peer-other' }],
      100,
    )).rejects.toThrow('scheduled_task_invalid_projection');
    await expect(repository.count()).resolves.toBe(0);
  });
});
