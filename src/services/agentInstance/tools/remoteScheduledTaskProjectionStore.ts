import { RemoteScheduledTaskProjectionEntity } from '@services/database/schema/agent';
import type { Repository } from 'typeorm';

import type { ListRemoteScheduledTaskProjectionPageInput, RemoteScheduledTaskProjectionPage, ScheduledTask } from './scheduledTaskTypes';

const revisionSchemaManagers = new WeakSet<object>();

export async function getRemoteScheduledTaskProjectionPage(
  repository: Repository<RemoteScheduledTaskProjectionEntity>,
  input: ListRemoteScheduledTaskProjectionPageInput,
): Promise<RemoteScheduledTaskProjectionPage> {
  validatePageInput(input);
  await ensureRevisionSchema(repository);
  return repository.manager.transaction(async manager => {
    const revisionRows = await manager.query<Array<{ revision?: number | string }>>(
      'SELECT revision FROM remote_scheduled_task_projection_revision WHERE id = 1',
    );
    const revision = String(revisionRows[0]?.revision ?? 0);
    if (input.expectedRevision !== undefined && input.expectedRevision !== revision) {
      throw new Error('scheduled_task_cursor_stale');
    }
    const query = manager.getRepository(RemoteScheduledTaskProjectionEntity)
      .createQueryBuilder('projection')
      .where('projection.agentInstanceId = :agentInstanceId', { agentInstanceId: input.agentInstanceId })
      .andWhere('projection.state IN (:...states)', { states: input.states })
      .orderBy('projection.observedAt', 'DESC')
      .addOrderBy('projection.id', 'DESC')
      .take(input.limit + 1);
    if (input.executionNodeIds?.length) {
      query.andWhere('projection.executionNodeId IN (:...executionNodeIds)', {
        executionNodeIds: input.executionNodeIds,
      });
    }
    if (input.after) {
      query.andWhere(
        '(projection.observedAt < :afterObservedAt OR (projection.observedAt = :afterObservedAt AND projection.id < :afterId))',
        { afterObservedAt: input.after.observedAt, afterId: input.after.id },
      );
    }
    const rows = await query.getMany();
    const hasMore = rows.length > input.limit;
    const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
    const last = pageRows.at(-1);
    return {
      items: pageRows.map(row => ({ task: row.task, observedAt: row.observedAt })),
      revision,
      ...(hasMore && last ? { next: { observedAt: last.observedAt, id: last.id } } : {}),
    };
  });
}

export async function replaceRemoteScheduledTaskProjections(
  repository: Repository<RemoteScheduledTaskProjectionEntity>,
  agentInstanceId: string,
  executionNodeId: string,
  tasks: readonly ScheduledTask[],
  observedAt: number,
): Promise<void> {
  assertProjectionWrite(agentInstanceId, executionNodeId, tasks, observedAt);
  await repository.manager.transaction(async manager => {
    const transactionRepository = manager.getRepository(RemoteScheduledTaskProjectionEntity);
    await transactionRepository.delete({ agentInstanceId, executionNodeId });
    if (tasks.length === 0) return;
    await transactionRepository.save(tasks.map(task =>
      projectionEntity(
        transactionRepository,
        task,
        observedAt,
      )
    ));
  });
}

export async function upsertRemoteScheduledTaskProjection(
  repository: Repository<RemoteScheduledTaskProjectionEntity>,
  task: ScheduledTask,
  observedAt: number,
): Promise<void> {
  assertProjectionWrite(task.agentInstanceId, task.executionNodeId, [task], observedAt);
  await repository.save(projectionEntity(repository, task, observedAt));
}

export async function deleteRemoteScheduledTaskProjection(
  repository: Repository<RemoteScheduledTaskProjectionEntity>,
  taskId: string,
  executionNodeId: string,
): Promise<void> {
  if (!taskId || !executionNodeId) throw new Error('scheduled_task_invalid_projection_identity');
  await repository.delete({ id: `${executionNodeId}:${taskId}` });
}

function projectionEntity(
  repository: Repository<RemoteScheduledTaskProjectionEntity>,
  task: ScheduledTask,
  observedAt: number,
): RemoteScheduledTaskProjectionEntity {
  return repository.create({
    id: `${task.executionNodeId}:${task.id}`,
    taskId: task.id,
    agentInstanceId: task.agentInstanceId,
    executionNodeId: task.executionNodeId,
    state: task.state,
    task,
    observedAt,
  });
}

function validatePageInput(input: ListRemoteScheduledTaskProjectionPageInput): void {
  if (!input.agentInstanceId) throw new Error('scheduled_task_invalid_agent');
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) {
    throw new Error('scheduled_task_invalid_page_limit');
  }
  if (input.states.length < 1 || input.states.length > 5 || new Set(input.states).size !== input.states.length) {
    throw new Error('scheduled_task_invalid_states');
  }
  if (
    input.executionNodeIds &&
    (input.executionNodeIds.length > 32 ||
      new Set(input.executionNodeIds).size !== input.executionNodeIds.length ||
      input.executionNodeIds.some(nodeId => !nodeId))
  ) throw new Error('scheduled_task_invalid_execution_nodes');
  if (input.after && (!Number.isSafeInteger(input.after.observedAt) || input.after.observedAt < 0 || !input.after.id)) {
    throw new Error('scheduled_task_invalid_cursor');
  }
}

function assertProjectionWrite(
  agentInstanceId: string,
  executionNodeId: string,
  tasks: readonly ScheduledTask[],
  observedAt: number,
): void {
  if (
    !agentInstanceId ||
    !executionNodeId ||
    !Number.isSafeInteger(observedAt) ||
    observedAt < 0 ||
    tasks.length > 100 ||
    new Set(tasks.map(task => task.id)).size !== tasks.length ||
    tasks.some(task => !task.id || task.agentInstanceId !== agentInstanceId || task.executionNodeId !== executionNodeId)
  ) throw new Error('scheduled_task_invalid_projection');
}

async function ensureRevisionSchema(repository: Repository<RemoteScheduledTaskProjectionEntity>): Promise<void> {
  const manager = repository.manager;
  if (revisionSchemaManagers.has(manager)) return;
  await manager.query(
    'CREATE TABLE IF NOT EXISTS remote_scheduled_task_projection_revision (id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL)',
  );
  await manager.query(
    'INSERT OR IGNORE INTO remote_scheduled_task_projection_revision (id, revision) VALUES (1, 0)',
  );
  for (const operation of ['INSERT', 'UPDATE', 'DELETE']) {
    await manager.query(
      `CREATE TRIGGER IF NOT EXISTS remote_scheduled_task_projection_revision_${operation.toLowerCase()} AFTER ${operation} ON remote_scheduled_task_projections BEGIN UPDATE remote_scheduled_task_projection_revision SET revision = revision + 1 WHERE id = 1; END`,
    );
  }
  revisionSchemaManagers.add(manager);
}
