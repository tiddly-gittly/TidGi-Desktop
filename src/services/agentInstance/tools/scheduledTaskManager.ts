/**
 * ScheduledTaskManager — Unified scheduling engine replacing the separate heartbeatManager and alarmClock modules.
 *
 * User-created tasks use one of two explicit schedule kinds:
 *   - "at": run once at a specific ISO datetime
 *   - "cron": recurring schedule with an optional IANA timezone
 *
 * All tasks are persisted to ScheduledTaskEntity so they survive app restarts.
 * Volatile agent instances (sub-agents / preview) are never scheduled.
 * Active-hours filtering skips runs outside the configured window.
 */

import { Cron } from 'croner';
import { previewScheduledTaskCron } from 'memeloop';
import type {
  AgentManagementCallOptions,
  CreateScheduledTaskInput,
  ListScheduledTasksOptions,
  ScheduledTask,
  ScheduledTaskPage,
  ScheduledTaskRpcScopedTaskRequest,
  ScheduledTaskRpcUpdatePatch,
  ScheduledTaskState,
} from 'memeloop';
import { nanoid } from 'nanoid';
import { In, Repository } from 'typeorm';

import { ScheduledTaskEntity } from '@services/database/schema/agent';
import { logger } from '@services/libs/log';
import type { IAgentInstanceService } from '../interface';

interface DurableScheduledTaskPagePosition {
  updatedAt: string;
  id: string;
}

interface DurableScheduledTaskPage {
  items: ScheduledTask[];
  revision: string;
  next?: DurableScheduledTaskPagePosition;
}

export type { CreateScheduledTaskInput, ScheduledTask } from 'memeloop';

// ─── Internal runtime entry ───────────────────────────────────────────────────

interface RuntimeEntry {
  task: Pick<ScheduledTaskEntity, 'id' | 'agentInstanceId'>;
  /** croner Cron instance (only for cron-kind tasks) */
  cronJob?: InstanceType<typeof Cron>;
  /** setInterval handle used only by the internal heartbeat runtime. */
  intervalHandle?: ReturnType<typeof setInterval>;
  /** setTimeout handle (only for at-kind one-shot tasks) */
  timeoutHandle?: ReturnType<typeof setTimeout>;
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

const MAX_TIMER_DELAY_MS = 2_147_000_000;
const SCHEDULE_RETRY_BASE_MS = 60_000;
const SCHEDULE_RETRY_MAX_MS = 60 * 60_000;

function minutesInTimezone(date: Date, timezone?: string): number {
  if (!timezone) return date.getHours() * 60 + date.getMinutes();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find(part => part.type === 'hour')?.value);
  const minute = Number(parts.find(part => part.type === 'minute')?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) throw new Error('scheduled_task_invalid_timezone');
  return hour * 60 + minute;
}

function isWithinActiveHours(task: ScheduledTaskEntity, now = new Date()): boolean {
  if (!task.activeHoursStart || !task.activeHoursEnd) return true;
  const timezone = task.schedule.kind === 'cron' ? task.schedule.timezone : undefined;
  const currentMinutes = minutesInTimezone(now, timezone);

  const parseTime = (t: string): number => {
    const [h, m] = t.split(':').map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  };

  const start = parseTime(task.activeHoursStart);
  const end = parseTime(task.activeHoursEnd);
  if (start <= end) return currentMinutes >= start && currentMinutes <= end;
  return currentMinutes >= start || currentMinutes <= end;
}

function entityToScheduledTask(entity: ScheduledTaskEntity): ScheduledTask {
  return {
    id: entity.id,
    agentInstanceId: entity.agentInstanceId,
    agentDefinitionId: entity.agentDefinitionId,
    name: entity.name,
    schedule: entity.schedule,
    payload: entity.payload ?? undefined,
    enabled: entity.enabled,
    deleteAfterRun: entity.deleteAfterRun,
    activeHoursStart: entity.activeHoursStart ?? undefined,
    activeHoursEnd: entity.activeHoursEnd ?? undefined,
    lastRunAt: entity.lastRunAt?.toISOString(),
    lastRunStatus: entity.lastRunStatus,
    lastError: entity.lastError ?? undefined,
    lastFailureAt: entity.lastFailureAt?.toISOString(),
    consecutiveFailures: entity.consecutiveFailures,
    nextRetryAt: entity.nextRetryAt?.toISOString(),
    nextRunAt: entity.nextRunAt?.toISOString(),
    runCount: entity.runCount,
    maxRuns: entity.maxRuns,
    createdBy: entity.createdBy,
    updatedAt: entity.updated.toISOString(),
    state: entity.state,
    executionNodeId: entity.executionNodeId,
    executionNodeLabel: entity.executionNodeLabel ?? undefined,
    originNodeId: entity.originNodeId,
    executionRevision: entity.executionRevision,
    occurrenceId: entity.occurrenceId ?? undefined,
    occurrenceScheduledFor: entity.occurrenceScheduledFor ?? undefined,
    occurrenceAttempt: entity.occurrenceAttempt,
  };
}

// ─── Manager ─────────────────────────────────────────────────────────────────

const activeEntries = new Map<string, RuntimeEntry>();

let scheduledTaskRepo: Repository<ScheduledTaskEntity> | null = null;
let agentInstanceServiceReference: IAgentInstanceService | null = null;
let getLocalSchedulingIdentity: (() => Promise<{ peerId: string; deviceName?: string }>) | null = null;

async function requireDurableAgentInstance(agentInstanceId: string, expectedDefinitionId?: string): Promise<Awaited<ReturnType<IAgentInstanceService['getAgentMetadata']>>> {
  const agent = await agentInstanceServiceReference?.getAgentMetadata(agentInstanceId);
  if (!agent) throw new Error('scheduled_task_agent_unavailable');
  if (agent.volatile) throw new Error('scheduled_task_volatile_agent');
  if (expectedDefinitionId !== undefined && agent.agentDefId !== expectedDefinitionId) {
    throw new Error('scheduled_task_definition_mismatch');
  }
  return agent;
}

export function initScheduledTaskManager(
  repo: Repository<ScheduledTaskEntity>,
  agentInstanceService: IAgentInstanceService,
  identityProvider: () => Promise<{ peerId: string; deviceName?: string }>,
): void {
  scheduledTaskRepo = repo;
  agentInstanceServiceReference = agentInstanceService;
  getLocalSchedulingIdentity = identityProvider;
}

// ─── Fire a task ─────────────────────────────────────────────────────────────

type TaskFireOutcome = 'succeeded' | 'failed' | 'skipped';

async function fireTask(task: ScheduledTaskEntity): Promise<TaskFireOutcome> {
  if (!isWithinActiveHours(task)) {
    logger.debug('ScheduledTaskManager: skipped outside active hours', { taskId: task.id });
    return 'skipped';
  }

  const service = agentInstanceServiceReference;
  if (!service) {
    logger.warn('ScheduledTaskManager: agentInstanceService not ready', { taskId: task.id });
    return 'failed';
  }

  const message = task.payload?.message || `[Scheduled] Task "${task.name ?? task.id}" triggered.`;

  try {
    await requireDurableAgentInstance(task.agentInstanceId, task.agentDefinitionId);
    const scheduledFor = (task.nextRetryAt ?? task.nextRunAt ?? new Date()).getTime();
    await service.executeLocalAgentMessage({
      target: { kind: 'local' },
      provenance: {
        conversationId: task.agentInstanceId,
        definitionId: task.agentDefinitionId,
        requestId: `scheduled-task:${task.id}:${scheduledFor}:request`,
        turnId: `scheduled-task:${task.id}:${scheduledFor}:turn`,
      },
      message,
    });
    logger.info('ScheduledTaskManager: task fired', { taskId: task.id, agentInstanceId: task.agentInstanceId });
  } catch (error) {
    logger.error('ScheduledTaskManager: failed to send message', { taskId: task.id, error });
    const now = new Date();
    const lastError = error instanceof Error ? error.message : String(error);
    task.lastRunStatus = 'failed';
    task.lastError = lastError;
    task.lastFailureAt = now;
    task.consecutiveFailures = (task.consecutiveFailures ?? 0) + 1;
    if (scheduledTaskRepo) {
      await scheduledTaskRepo.update(task.id, {
        lastRunStatus: 'failed',
        lastError,
        lastFailureAt: now,
        consecutiveFailures: task.consecutiveFailures,
      });
    }
    return 'failed';
  }

  // Update DB counters
  if (scheduledTaskRepo) {
    const newRunCount = task.runCount + 1;
    const now = new Date();

    const update: Partial<ScheduledTaskEntity> = {
      runCount: newRunCount,
      lastRunAt: now,
      lastRunStatus: 'succeeded',
      // TypeORM intentionally ignores `undefined` update values. Persist NULL
      // so a task which succeeds after a transient failure no longer exposes
      // stale failure metadata in the scheduler UI or synchronized projection.
      lastError: null,
      lastFailureAt: null,
      consecutiveFailures: 0,
      nextRetryAt: null,
    };

    const maxRunsReached = task.maxRuns != null && newRunCount >= task.maxRuns;
    if (task.deleteAfterRun || maxRunsReached) {
      await completeTask(task.id);
      return 'succeeded';
    }

    task.runCount = newRunCount;
    task.lastRunAt = now;
    task.lastRunStatus = 'succeeded';
    task.lastError = null;
    task.lastFailureAt = null;
    task.consecutiveFailures = 0;
    task.nextRetryAt = null;
    await scheduledTaskRepo.update(task.id, update);
  }
  return 'succeeded';
}

// ─── Schedule a runtime entry ─────────────────────────────────────────────────

function retryDelay(task: ScheduledTaskEntity): number {
  return Math.min(
    SCHEDULE_RETRY_MAX_MS,
    SCHEDULE_RETRY_BASE_MS * 2 ** Math.max(0, (task.consecutiveFailures ?? 1) - 1),
  );
}

function scheduleAtEntry(task: ScheduledTaskEntity, wakeAt: Date): void {
  cancelEntry(task.id);
  task.nextRunAt = wakeAt;
  const remaining = Math.max(0, wakeAt.getTime() - Date.now());
  const delay = Math.min(remaining, MAX_TIMER_DELAY_MS);
  const handle = setTimeout(() => {
    if (remaining > MAX_TIMER_DELAY_MS) {
      scheduleAtEntry(task, wakeAt);
      return;
    }
    void fireTask(task).then(async outcome => {
      if (outcome === 'succeeded') {
        if (activeEntries.has(task.id)) await completeTask(task.id);
        return;
      }
      const nextRetryAt = new Date(Date.now() + (outcome === 'failed' ? retryDelay(task) : SCHEDULE_RETRY_BASE_MS));
      task.nextRetryAt = nextRetryAt;
      task.nextRunAt = nextRetryAt;
      if (scheduledTaskRepo) await scheduledTaskRepo.update(task.id, { nextRetryAt, nextRunAt: nextRetryAt });
      scheduleAtEntry(task, nextRetryAt);
    });
  }, delay);
  handle.unref?.();
  activeEntries.set(task.id, { task, timeoutHandle: handle });
}

function scheduleEntry(task: ScheduledTaskEntity): void {
  cancelEntry(task.id);

  if (!task.enabled || task.state !== 'active') return;

  const schedule = task.schedule;

  if (schedule.kind === 'at') {
    const atSchedule = schedule;
    const wakeAt = new Date(atSchedule.wakeAtISO);
    scheduleAtEntry(task, wakeAt);
  } else if (schedule.kind === 'cron') {
    const cronSchedule = schedule;
    try {
      const cronJob = new Cron(cronSchedule.expression, {
        timezone: cronSchedule.timezone,
        protect: true,
      }, async () => {
        // Return the promise to Croner. `protect: true` can prevent overlapping
        // agent turns only while it can observe that the previous callback is
        // still pending; a fire-and-forget callback defeats that guarantee.
        await fireTask(task);
        if (!activeEntries.has(task.id)) return;
        task.nextRunAt = cronJob.nextRun() ?? undefined;
        if (scheduledTaskRepo && task.nextRunAt) await scheduledTaskRepo.update(task.id, { nextRunAt: task.nextRunAt });
      });
      task.nextRunAt = cronJob.nextRun() ?? undefined;
      activeEntries.set(task.id, { task, cronJob });
    } catch (error) {
      logger.error('ScheduledTaskManager: invalid cron expression', { expression: cronSchedule.expression, error });
    }
  }

  if (scheduledTaskRepo && task.nextRunAt) {
    void scheduledTaskRepo.update(task.id, { nextRunAt: task.nextRunAt });
  }
}

function validateActiveHours(start?: string | null, end?: string | null): void {
  if ((start && !end) || (!start && end)) throw new Error('scheduled_task_invalid_active_hours');
  for (const value of [start, end]) {
    if (!value) continue;
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
      throw new Error('scheduled_task_invalid_active_hours');
    }
  }
}

function validateSchedule(task: Pick<ScheduledTaskEntity, 'schedule' | 'scheduleKind' | 'activeHoursStart' | 'activeHoursEnd'>): void {
  if (task.schedule.kind !== task.scheduleKind) throw new Error('scheduled_task_schedule_kind_mismatch');
  validateActiveHours(task.activeHoursStart, task.activeHoursEnd);
  if (task.schedule.kind === 'at') {
    if (!Number.isFinite(new Date(task.schedule.wakeAtISO).getTime())) throw new Error('scheduled_task_invalid_at');
    return;
  }
  if (task.schedule.timezone) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: task.schedule.timezone }).format(new Date());
    } catch (error) {
      throw new Error('scheduled_task_invalid_timezone', { cause: error });
    }
  }
  try {
    const cron = new Cron(task.schedule.expression, { timezone: task.schedule.timezone });
    const next = cron.nextRun();
    cron.stop();
    if (!next) throw new Error('no_next_run');
  } catch (error) {
    throw new Error('scheduled_task_invalid_cron', { cause: error });
  }
}

// ─── Cancel an active entry ───────────────────────────────────────────────────

function cancelEntry(taskId: string): void {
  const entry = activeEntries.get(taskId);
  if (!entry) return;
  if (entry.cronJob) entry.cronJob.stop();
  if (entry.intervalHandle) clearInterval(entry.intervalHandle);
  if (entry.timeoutHandle) clearTimeout(entry.timeoutHandle);
  activeEntries.delete(taskId);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Restore all persisted tasks for non-volatile instances on app startup.
 * Called from AgentInstanceService.initialize().
 */
export async function restoreScheduledTasks(
  repo: Repository<ScheduledTaskEntity>,
  isVolatile: (agentInstanceId: string) => Promise<boolean>,
): Promise<void> {
  const tasks = await repo.find({ where: { enabled: true, state: 'active' } });
  let restored = 0;

  for (const task of tasks) {
    if (await isVolatile(task.agentInstanceId)) continue;
    try {
      validateSchedule(task);
    } catch (error) {
      cancelEntry(task.id);
      await repo.update(task.id, {
        enabled: false,
        state: 'paused',
        lastRunStatus: 'failed',
        lastError: error instanceof Error ? error.message : String(error),
        lastFailureAt: new Date(),
      });
      logger.warn('ScheduledTaskManager: disabled invalid persisted task', { taskId: task.id, error });
      continue;
    }

    // For 'at' tasks that are in the past and not repeating, fire immediately
    if (task.schedule.kind === 'at') {
      const atSchedule = task.schedule;
      const wakeAt = new Date(atSchedule.wakeAtISO);
      if (wakeAt.getTime() <= Date.now()) {
        scheduleEntry(Object.assign(new ScheduledTaskEntity(), task, { schedule: { ...atSchedule, wakeAtISO: new Date().toISOString() } }));
      } else {
        scheduleEntry(task);
      }
    } else {
      scheduleEntry(task);
    }
    restored++;
  }

  if (restored > 0) {
    logger.info('ScheduledTaskManager: restored tasks', { count: restored });
  }
}

/** Add a new task (persists to DB + starts timer). */
export async function addTask(input: CreateScheduledTaskInput, options: AgentManagementCallOptions = {}): Promise<ScheduledTask> {
  if (!scheduledTaskRepo) throw new Error('ScheduledTaskManager not initialized');
  options.signal?.throwIfAborted();
  if (!getLocalSchedulingIdentity) throw new Error('scheduled_task_identity_unavailable');
  const identity = await getLocalSchedulingIdentity().catch((error: unknown) => {
    throw new Error('scheduled_task_identity_unavailable', { cause: error });
  });
  if (!identity.peerId) throw new Error('scheduled_task_identity_unavailable');
  await requireDurableAgentInstance(input.agentInstanceId, input.agentDefinitionId);
  const agentDefinitionId = input.agentDefinitionId;
  const name = input.name;
  const executionNodeId = input.executionNodeId;
  // A manager owns timers only for its own stable PeerId. Remote creation is
  // routed to that peer's manager; accepting a third-party target here would
  // make the task appear remotely owned while executing on this process.
  if (executionNodeId !== identity.peerId) {
    throw new Error(`scheduled_task_wrong_execution_node:${executionNodeId}`);
  }

  const entity = scheduledTaskRepo.create({
    id: nanoid(),
    agentInstanceId: input.agentInstanceId,
    agentDefinitionId,
    name,
    scheduleKind: input.scheduleKind,
    schedule: input.schedule,
    payload: input.payload ?? null,
    enabled: input.enabled ?? true,
    state: input.enabled === false ? 'paused' : 'active',
    executionNodeId,
    executionNodeLabel: input.executionNodeLabel ?? identity.deviceName ?? null,
    originNodeId: input.originNodeId,
    deleteAfterRun: false,
    activeHoursStart: input.activeHoursStart ?? null,
    activeHoursEnd: input.activeHoursEnd ?? null,
    createdBy: input.createdBy ?? 'settings-ui',
    runCount: 0,
    consecutiveFailures: 0,
  });

  validateSchedule(entity);

  const saved = await scheduledTaskRepo.manager.transaction(async manager => {
    options.signal?.throwIfAborted();
    const result = await manager.getRepository(ScheduledTaskEntity).save(entity);
    options.signal?.throwIfAborted();
    return result;
  });

  if (saved.enabled) {
    scheduleEntry(saved);
  }

  logger.info('ScheduledTaskManager: task added', { taskId: saved.id, kind: saved.scheduleKind });
  return entityToScheduledTask(saved);
}

/** Update an existing task (restarts timer). */
export async function updateTask(
  taskId: string,
  patch: ScheduledTaskRpcUpdatePatch,
  options: AgentManagementCallOptions = {},
): Promise<ScheduledTask> {
  if (!scheduledTaskRepo) throw new Error('ScheduledTaskManager not initialized');
  options.signal?.throwIfAborted();
  const persisted = await scheduledTaskRepo.findOne({ where: { id: taskId } });
  if (!persisted) throw new Error(`ScheduledTask not found: ${taskId}`);
  await requireDurableAgentInstance(persisted.agentInstanceId, persisted.agentDefinitionId);
  // Validate a detached candidate so a rejected update cannot mutate the
  // repository-managed entity before save.
  const entity = scheduledTaskRepo.create();
  Object.assign(entity, persisted);

  applyTaskUpdate(entity, persisted, patch);

  validateSchedule(entity);

  options.signal?.throwIfAborted();
  await scheduledTaskRepo.save(entity);
  options.signal?.throwIfAborted();

  cancelEntry(entity.id);
  if (entity.enabled) scheduleEntry(entity);

  logger.info('ScheduledTaskManager: task updated', { taskId: entity.id });
  return entityToScheduledTask(entity);
}

/** Atomically validate the complete RPC resource tuple and update one task. */
export async function updateTaskScoped(
  scope: ScheduledTaskRpcScopedTaskRequest,
  patch: ScheduledTaskRpcUpdatePatch,
  options: AgentManagementCallOptions = {},
): Promise<ScheduledTask> {
  if (!scheduledTaskRepo) throw new Error('ScheduledTaskManager not initialized');
  options.signal?.throwIfAborted();
  assertScopedUpdateIdentity(scope, patch);
  const entity = await scheduledTaskRepo.manager.transaction(async manager => {
    const repository = manager.getRepository(ScheduledTaskEntity);
    const where = scopeWhere(scope);
    const persisted = await repository.findOne({ where });
    options.signal?.throwIfAborted();
    if (!persisted) throw new Error('scheduled_task_scope_unavailable');
    const candidate = applyTaskUpdate(repository.create(), persisted, patch);
    validateSchedule(candidate);
    options.signal?.throwIfAborted();
    const result = await repository.createQueryBuilder()
      .update(ScheduledTaskEntity)
      .set(mutableTaskFields(candidate))
      .where('id = :id', { id: where.id })
      .andWhere('agentInstanceId = :agentInstanceId', { agentInstanceId: where.agentInstanceId })
      .andWhere('agentDefinitionId = :agentDefinitionId', { agentDefinitionId: where.agentDefinitionId })
      .andWhere('executionNodeId = :executionNodeId', { executionNodeId: where.executionNodeId })
      .execute();
    options.signal?.throwIfAborted();
    if (result.affected !== 1) throw new Error('scheduled_task_scope_unavailable');
    const updated = await repository.findOne({ where });
    options.signal?.throwIfAborted();
    if (!updated) throw new Error('scheduled_task_scope_unavailable');
    return updated;
  });
  cancelEntry(entity.id);
  if (entity.enabled) scheduleEntry(entity);
  logger.info('ScheduledTaskManager: task updated', { taskId: entity.id });
  return entityToScheduledTask(entity);
}

/** Read one task by the same complete scope used for mutations. */
export async function getTaskByScope(
  scope: ScheduledTaskRpcScopedTaskRequest,
  options: AgentManagementCallOptions = {},
): Promise<ScheduledTask | undefined> {
  if (!scheduledTaskRepo) throw new Error('ScheduledTaskManager not initialized');
  options.signal?.throwIfAborted();
  const entity = await scheduledTaskRepo.findOne({ where: scopeWhere(scope) });
  options.signal?.throwIfAborted();
  return entity ? entityToScheduledTask(entity) : undefined;
}

/** Atomically match the full scope before soft-deleting a task. */
export async function removeTaskScoped(
  scope: ScheduledTaskRpcScopedTaskRequest,
  options: AgentManagementCallOptions = {},
): Promise<void> {
  if (!scheduledTaskRepo) throw new Error('ScheduledTaskManager not initialized');
  options.signal?.throwIfAborted();
  await scheduledTaskRepo.manager.transaction(async manager => {
    const where = scopeWhere(scope);
    const result = await manager.getRepository(ScheduledTaskEntity).createQueryBuilder()
      .update(ScheduledTaskEntity)
      .set({ enabled: false, state: 'cancelled' })
      .where('id = :id', { id: where.id })
      .andWhere('agentInstanceId = :agentInstanceId', { agentInstanceId: where.agentInstanceId })
      .andWhere('agentDefinitionId = :agentDefinitionId', { agentDefinitionId: where.agentDefinitionId })
      .andWhere('executionNodeId = :executionNodeId', { executionNodeId: where.executionNodeId })
      .execute();
    options.signal?.throwIfAborted();
    if (result.affected !== 1) throw new Error('scheduled_task_scope_unavailable');
  });
  cancelEntry(scope.taskId);
  logger.info('ScheduledTaskManager: task removed', { taskId: scope.taskId });
}

function scopeWhere(scope: ScheduledTaskRpcScopedTaskRequest): Pick<ScheduledTaskEntity, 'id' | 'agentInstanceId' | 'agentDefinitionId' | 'executionNodeId'> {
  return {
    id: scope.taskId,
    agentInstanceId: scope.agentInstanceId,
    agentDefinitionId: scope.agentDefinitionId,
    executionNodeId: scope.executionNodeId,
  };
}

/**
 * A scoped mutation may change task configuration, never its resource identity.
 * Keep this check independent from agent metadata: the authenticated RPC grant
 * and the conditional SQL write are the authorization boundary for an existing
 * task, while a metadata lookup would be a separate, racy existence oracle.
 */
function assertScopedUpdateIdentity(scope: ScheduledTaskRpcScopedTaskRequest, patch: ScheduledTaskRpcUpdatePatch): void {
  if (
    patch.executionNodeId !== undefined && patch.executionNodeId !== scope.executionNodeId
  ) {
    throw new Error('scheduled_task_scope_unavailable');
  }
}

function applyTaskUpdate(
  entity: ScheduledTaskEntity,
  persisted: ScheduledTaskEntity,
  input: ScheduledTaskRpcUpdatePatch,
): ScheduledTaskEntity {
  Object.assign(entity, persisted);
  if (input.schedule !== undefined) {
    entity.schedule = input.schedule;
    entity.scheduleKind = input.schedule.kind;
  }
  if (input.name !== undefined) entity.name = input.name;
  if (Object.hasOwn(input, 'payload')) entity.payload = input.payload ?? null;
  if (input.enabled !== undefined) entity.enabled = input.enabled;
  if (input.enabled !== undefined) entity.state = input.enabled ? 'active' : 'paused';
  if (Object.hasOwn(input, 'executionNodeLabel')) entity.executionNodeLabel = input.executionNodeLabel ?? null;
  if (Object.hasOwn(input, 'activeHoursStart')) entity.activeHoursStart = input.activeHoursStart ?? null;
  if (Object.hasOwn(input, 'activeHoursEnd')) entity.activeHoursEnd = input.activeHoursEnd ?? null;
  return entity;
}

function mutableTaskFields(entity: ScheduledTaskEntity): Partial<ScheduledTaskEntity> {
  return {
    name: entity.name,
    scheduleKind: entity.scheduleKind,
    schedule: entity.schedule,
    payload: entity.payload,
    enabled: entity.enabled,
    state: entity.state,
    executionNodeLabel: entity.executionNodeLabel,
    deleteAfterRun: entity.deleteAfterRun,
    activeHoursStart: entity.activeHoursStart,
    activeHoursEnd: entity.activeHoursEnd,
    maxRuns: entity.maxRuns,
  };
}

/** Remove a task (stops timer and deletes from DB). */
export async function removeTask(taskId: string): Promise<void> {
  cancelEntry(taskId);
  if (scheduledTaskRepo) {
    await scheduledTaskRepo.update(taskId, { enabled: false, state: 'cancelled' });
  }
  logger.info('ScheduledTaskManager: task removed', { taskId });
}

async function completeTask(taskId: string): Promise<void> {
  cancelEntry(taskId);
  if (scheduledTaskRepo) {
    await scheduledTaskRepo.update(taskId, { enabled: false, state: 'completed' });
  }
}

/** List all active in-memory tasks. */
export async function getActiveTasks(options: ListScheduledTasksOptions = {}): Promise<ScheduledTask[]> {
  if (!scheduledTaskRepo) return [];
  const states = options.states?.length ? options.states : ['active', 'paused'];
  return (await scheduledTaskRepo.find({
    where: {
      state: In(states),
      ...(options.executionNodeIds?.length ? { executionNodeId: In(options.executionNodeIds) } : {}),
    },
    order: { updated: 'DESC' },
  })).map(entityToScheduledTask);
}

/** List tasks for a specific agent instance. */
export async function getActiveTasksForAgent(
  agentInstanceId: string,
  options: ListScheduledTasksOptions = {},
): Promise<ScheduledTask[]> {
  if (!scheduledTaskRepo) return [];
  const states = options.states?.length ? options.states : ['active', 'paused'];
  return (await scheduledTaskRepo.find({
    where: {
      agentInstanceId,
      state: In(states),
      ...(options.executionNodeIds?.length ? { executionNodeId: In(options.executionNodeIds) } : {}),
    },
    order: { updated: 'DESC' },
  })).map(entityToScheduledTask);
}

interface LocalScheduledTaskCursor {
  version: 1;
  agentInstanceId: string;
  executionNodeId: string;
  states: ScheduledTask['state'][];
  revision: string;
  after: { updatedAt: string; id: string };
}

/** Exact Core management page backed by the private SQLite keyset below. */
export async function getScheduledTaskPageForAgent(
  agentInstanceId: string,
  options: ListScheduledTasksOptions = {},
): Promise<ScheduledTaskPage> {
  if (!getLocalSchedulingIdentity) throw new Error('scheduled_task_identity_unavailable');
  options.signal?.throwIfAborted();
  const identity = await getLocalSchedulingIdentity();
  options.signal?.throwIfAborted();
  const defaultStates: ScheduledTaskState[] = ['active', 'paused'];
  const states: ScheduledTaskState[] = [...(options.states?.length ? options.states : defaultStates)].sort();
  const cursor = options.cursor === undefined
    ? undefined
    : decodeLocalScheduledTaskCursor(options.cursor, agentInstanceId, identity.peerId, states);
  const page = await getDurableScheduledTasksPageForAgent({
    agentInstanceId,
    executionNodeId: identity.peerId,
    states,
    limit: options.limit ?? 100,
    ...(cursor === undefined ? {} : { after: cursor.after, expectedRevision: cursor.revision }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  const maxBytes = options.maxBytes ?? 256 * 1024;
  const items: ScheduledTask[] = [];
  let nextCursor: string | undefined;
  for (let index = 0; index < page.items.length; index += 1) {
    const item = page.items[index];
    if (!item?.updatedAt) throw new Error('scheduled_task_page_missing_updated_at');
    const hasMoreAfter = index + 1 < page.items.length || page.next !== undefined;
    const candidateCursor = hasMoreAfter
      ? encodeLocalScheduledTaskCursor({
        version: 1,
        agentInstanceId,
        executionNodeId: identity.peerId,
        states,
        revision: page.revision,
        after: { updatedAt: item.updatedAt, id: item.id },
      })
      : undefined;
    const candidate: ScheduledTaskPage = {
      items: [...items, item],
      ...(candidateCursor === undefined ? {} : { nextCursor: candidateCursor }),
      hasMoreAfter,
      partial: false,
      sources: [{ executionNodeId: identity.peerId, state: 'online', fromCache: false }],
    };
    if (Buffer.byteLength(JSON.stringify(candidate), 'utf8') > maxBytes) break;
    items.push(item);
    nextCursor = candidateCursor;
  }
  if (page.items.length > 0 && items.length === 0) throw new Error('scheduled_task_page_item_exceeds_byte_budget');
  return {
    items,
    ...(nextCursor === undefined ? {} : { nextCursor }),
    hasMoreAfter: nextCursor !== undefined,
    partial: false,
    sources: [{ executionNodeId: identity.peerId, state: 'online', fromCache: false }],
  };
}

function encodeLocalScheduledTaskCursor(cursor: LocalScheduledTaskCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeLocalScheduledTaskCursor(
  value: string,
  agentInstanceId: string,
  executionNodeId: string,
  states: ScheduledTask['state'][],
): LocalScheduledTaskCursor {
  if (!/^[A-Za-z0-9_-]{1,2048}$/u.test(value)) throw new TypeError('invalid scheduled task cursor');
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new TypeError('invalid scheduled task cursor');
  }
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new TypeError('invalid scheduled task cursor');
  const cursor = decoded as LocalScheduledTaskCursor;
  if (
    Object.keys(cursor).some(key => !['version', 'agentInstanceId', 'executionNodeId', 'states', 'revision', 'after'].includes(key)) ||
    cursor.version !== 1 || cursor.agentInstanceId !== agentInstanceId || cursor.executionNodeId !== executionNodeId ||
    !Array.isArray(cursor.states) || cursor.states.length !== states.length || cursor.states.some((state, index) => state !== states[index]) ||
    typeof cursor.revision !== 'string' || !cursor.revision || !cursor.after || typeof cursor.after.id !== 'string' ||
    typeof cursor.after.updatedAt !== 'string'
  ) throw new TypeError('invalid scheduled task cursor');
  return cursor;
}

/**
 * Read one stable, bounded RPC page directly from SQLite. The revision covers
 * every state in the scoped agent/device set, so an archive or other mutation
 * invalidates an older cursor instead of silently skipping or duplicating a
 * row. Concurrent inserts are handled the same way.
 */
async function getDurableScheduledTasksPageForAgent(
  input: {
    agentInstanceId: string;
    executionNodeId: string;
    states: ScheduledTask['state'][];
    limit: number;
    after?: DurableScheduledTaskPagePosition;
    expectedRevision?: string;
    signal?: AbortSignal;
  },
): Promise<DurableScheduledTaskPage> {
  if (!scheduledTaskRepo) throw new Error('ScheduledTaskManager not initialized');
  input.signal?.throwIfAborted();
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) {
    throw new Error('scheduled_task_invalid_page_limit');
  }
  if (input.states.length < 1 || input.states.length > 5 || new Set(input.states).size !== input.states.length) {
    throw new Error('scheduled_task_invalid_states');
  }
  if (input.after && (!input.after.id || !Number.isFinite(new Date(input.after.updatedAt).getTime()))) {
    throw new Error('scheduled_task_invalid_cursor');
  }

  await ensureScheduledTaskRevisionSchema(scheduledTaskRepo);
  input.signal?.throwIfAborted();
  return scheduledTaskRepo.manager.transaction(async manager => {
    input.signal?.throwIfAborted();
    const repository = manager.getRepository(ScheduledTaskEntity);
    const revisionRows = await manager.query<Array<{ revision?: number | string }>>(
      'SELECT revision FROM scheduled_task_revision WHERE id = 1',
    );
    input.signal?.throwIfAborted();
    const revisionValue = revisionRows[0]?.revision;
    const revision = typeof revisionValue === 'number' || typeof revisionValue === 'string'
      ? String(revisionValue)
      : '0';
    if (input.expectedRevision !== undefined && input.expectedRevision !== revision) {
      throw new Error('scheduled_task_cursor_stale');
    }

    const query = repository.createQueryBuilder('task')
      .where('task.agentInstanceId = :agentInstanceId', { agentInstanceId: input.agentInstanceId })
      .andWhere('task.executionNodeId = :executionNodeId', { executionNodeId: input.executionNodeId })
      .andWhere('task.state IN (:...states)', { states: input.states })
      .orderBy('task.updated', 'DESC')
      .addOrderBy('task.id', 'DESC')
      .take(input.limit + 1);
    if (input.after) {
      query.andWhere(
        '(task.updated < :afterUpdated OR (task.updated = :afterUpdated AND task.id < :afterId))',
        { afterUpdated: new Date(input.after.updatedAt), afterId: input.after.id },
      );
    }
    const rows = await query.getMany();
    input.signal?.throwIfAborted();
    const hasMore = rows.length > input.limit;
    const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
    const last = pageRows.at(-1);
    return {
      items: pageRows.map(entityToScheduledTask),
      revision,
      ...(hasMore && last
        ? { next: { updatedAt: last.updated.toISOString(), id: last.id } }
        : {}),
    };
  });
}

const revisionSchemaManagers = new WeakSet<object>();

async function ensureScheduledTaskRevisionSchema(repository: Repository<ScheduledTaskEntity>): Promise<void> {
  const manager = repository.manager;
  if (revisionSchemaManagers.has(manager)) return;
  await manager.query(
    'CREATE TABLE IF NOT EXISTS scheduled_task_revision (id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL)',
  );
  await manager.query('INSERT OR IGNORE INTO scheduled_task_revision (id, revision) VALUES (1, 0)');
  for (const operation of ['INSERT', 'UPDATE', 'DELETE']) {
    await manager.query(
      `CREATE TRIGGER IF NOT EXISTS scheduled_task_revision_${operation.toLowerCase()} AFTER ${operation} ON scheduled_tasks BEGIN UPDATE scheduled_task_revision SET revision = revision + 1 WHERE id = 1; END`,
    );
  }
  revisionSchemaManagers.add(manager);
}

/** Stop all timers (for app shutdown). */
export function stopAllScheduledTasks(): void {
  for (const [id] of activeEntries) cancelEntry(id);
  logger.info('ScheduledTaskManager: all tasks stopped');
}

/** Get next N run times for a cron expression (for UI preview). */
export function getCronPreviewDates(expression: string, timezone?: string, count = 3): string[] {
  try {
    return previewScheduledTaskCron(expression, { count, ...(timezone === undefined ? {} : { timezone }) });
  } catch {
    return [];
  }
}

/**
 * Cancel all tasks for an agent instance (used on closeAgent / deleteAgent).
 */
export async function cancelTasksForAgent(agentInstanceId: string): Promise<void> {
  for (const [id, entry] of activeEntries) {
    if (entry.task.agentInstanceId === agentInstanceId) {
      cancelEntry(id);
    }
  }
  if (scheduledTaskRepo) {
    await scheduledTaskRepo.update(
      { agentInstanceId, state: 'active' },
      { enabled: false, state: 'cancelled' },
    );
  }
}

// ── Heartbeat (in-memory only, not persisted) ──────────────────────────────
// Heartbeats are derived from AgentDefinition config and do NOT create DB rows.
// They use the same internal timer infrastructure but with a separate namespace.

import type { AgentHeartbeatConfig } from 'memeloop';

interface HeartbeatState {
  nextWakeAtISO?: string;
  createdBy?: string;
  lastRunAtISO?: string;
  runCount: number;
}

const heartbeatStates = new Map<string, HeartbeatState>();

/**
 * Start a heartbeat for an agent instance. Not persisted — derived from definition config.
 */
export function startHeartbeat(
  agentId: string,
  agentDefinitionId: string,
  config: AgentHeartbeatConfig,
  agentInstanceService: IAgentInstanceService,
  options?: { createdBy?: string },
): void {
  stopHeartbeat(agentId);
  if (!config.enabled) return;

  const intervalMs = Math.max(config.intervalSeconds, 60) * 1000;
  const message = config.message || '[Heartbeat] Periodic check-in. Review your tasks and take any pending actions.';

  const state: HeartbeatState = {
    nextWakeAtISO: new Date(Date.now() + intervalMs).toISOString(),
    createdBy: options?.createdBy ?? 'agent-definition',
    runCount: 0,
  };
  heartbeatStates.set(agentId, state);

  const handle = setInterval(() => {
    const s = heartbeatStates.get(agentId);
    if (!s) return;
    s.lastRunAtISO = new Date().toISOString();
    s.runCount += 1;
    s.nextWakeAtISO = new Date(Date.now() + intervalMs).toISOString();

    // Active hours check
    if (config.activeHoursStart && config.activeHoursEnd) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const [sh, sm] = config.activeHoursStart.split(':').map(Number);
      const [eh, em] = config.activeHoursEnd.split(':').map(Number);
      const start = (sh ?? 0) * 60 + (sm ?? 0);
      const end = (eh ?? 0) * 60 + (em ?? 0);
      if (start <= end ? !(currentMinutes >= start && currentMinutes <= end) : !(currentMinutes >= start || currentMinutes <= end)) {
        return;
      }
    }

    const fireIdentity = s.lastRunAtISO ?? new Date().toISOString();
    void agentInstanceService.executeLocalAgentMessage({
      target: { kind: 'local' },
      provenance: {
        conversationId: agentId,
        definitionId: agentDefinitionId,
        requestId: `heartbeat:${agentId}:${fireIdentity}:request`,
        turnId: `heartbeat:${agentId}:${fireIdentity}:turn`,
      },
      message: `[Heartbeat] ${message}`,
    }).catch((error: unknown) => {
      logger.error('Heartbeat failed to send message', { error, agentId });
    });
  }, intervalMs);

  handle.unref?.();
  // Store handle under a heartbeat-specific key to avoid conflicting with scheduled tasks
  activeEntries.set(`__heartbeat:${agentId}`, {
    task: { id: `__heartbeat:${agentId}`, agentInstanceId: agentId },
    intervalHandle: handle,
  });
  logger.info('Heartbeat started', { agentId, intervalMs });
}

/** Stop heartbeat for an agent instance. */
export function stopHeartbeat(agentId: string): void {
  cancelEntry(`__heartbeat:${agentId}`);
  heartbeatStates.delete(agentId);
}
