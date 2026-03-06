/**
 * ScheduledTaskManager — Unified scheduling engine replacing the separate heartbeatManager and alarmClock modules.
 *
 * Supports three schedule kinds:
 *   - "interval": run every N seconds (replaces heartbeat)
 *   - "at": run at a specific ISO datetime, optionally repeating every M minutes (replaces alarm)
 *   - "cron": run on a cron expression with optional IANA timezone (new)
 *
 * All tasks are persisted to ScheduledTaskEntity so they survive app restarts.
 * Volatile agent instances (sub-agents / preview) are never scheduled.
 * Active-hours filtering skips runs outside the configured window.
 */

import { Cron } from 'croner';
import { nanoid } from 'nanoid';
import { Repository } from 'typeorm';

import { type AtSchedule, type CronSchedule, type IntervalSchedule, type ScheduleConfig, ScheduledTaskEntity, type ScheduleKind } from '@services/database/schema/agent';
import { logger } from '@services/libs/log';
import type { IAgentInstanceService } from './interface';

// ─── Public data shape exposed to UI ─────────────────────────────────────────

export interface ScheduledTask {
  id: string;
  agentInstanceId: string;
  agentDefinitionId?: string;
  name?: string;
  scheduleKind: ScheduleKind;
  schedule: ScheduleConfig;
  payload?: { message: string };
  enabled: boolean;
  deleteAfterRun: boolean;
  activeHoursStart?: string;
  activeHoursEnd?: string;
  lastRunAt?: string;
  nextRunAt?: string;
  runCount: number;
  maxRuns?: number;
  createdBy: string;
  created: string;
  updated: string;
}

export interface CreateScheduledTaskInput {
  agentInstanceId: string;
  agentDefinitionId?: string;
  name?: string;
  scheduleKind: ScheduleKind;
  schedule: ScheduleConfig;
  payload?: { message: string };
  enabled?: boolean;
  deleteAfterRun?: boolean;
  activeHoursStart?: string;
  activeHoursEnd?: string;
  maxRuns?: number;
  createdBy?: string;
}

export type UpdateScheduledTaskInput = Partial<Omit<CreateScheduledTaskInput, 'agentInstanceId'>> & { id: string };

// ─── Internal runtime entry ───────────────────────────────────────────────────

interface RuntimeEntry {
  task: ScheduledTaskEntity;
  /** croner Cron instance (only for cron-kind tasks) */
  cronJob?: InstanceType<typeof Cron>;
  /** setInterval handle (only for interval-kind tasks) */
  intervalHandle?: ReturnType<typeof setInterval>;
  /** setTimeout handle (only for at-kind one-shot tasks) */
  timeoutHandle?: ReturnType<typeof setTimeout>;
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

function isWithinActiveHours(task: ScheduledTaskEntity): boolean {
  if (!task.activeHoursStart || !task.activeHoursEnd) return true;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const parseTime = (t: string): number => {
    const [h, m] = t.split(':').map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  };

  const start = parseTime(task.activeHoursStart);
  const end = parseTime(task.activeHoursEnd);
  if (start <= end) return currentMinutes >= start && currentMinutes <= end;
  return currentMinutes >= start || currentMinutes <= end;
}

function entityToDto(entity: ScheduledTaskEntity): ScheduledTask {
  return {
    id: entity.id,
    agentInstanceId: entity.agentInstanceId,
    agentDefinitionId: entity.agentDefinitionId,
    name: entity.name,
    scheduleKind: entity.scheduleKind,
    schedule: entity.schedule,
    payload: entity.payload,
    enabled: entity.enabled,
    deleteAfterRun: entity.deleteAfterRun,
    activeHoursStart: entity.activeHoursStart,
    activeHoursEnd: entity.activeHoursEnd,
    lastRunAt: entity.lastRunAt?.toISOString(),
    nextRunAt: entity.nextRunAt?.toISOString(),
    runCount: entity.runCount,
    maxRuns: entity.maxRuns,
    createdBy: entity.createdBy,
    created: entity.created?.toISOString() ?? new Date().toISOString(),
    updated: entity.updated?.toISOString() ?? new Date().toISOString(),
  };
}

// ─── Manager ─────────────────────────────────────────────────────────────────

const activeEntries = new Map<string, RuntimeEntry>();

let scheduledTaskRepo: Repository<ScheduledTaskEntity> | null = null;
let agentInstanceServiceReference: IAgentInstanceService | null = null;

export function initScheduledTaskManager(
  repo: Repository<ScheduledTaskEntity>,
  agentInstanceService: IAgentInstanceService,
): void {
  scheduledTaskRepo = repo;
  agentInstanceServiceReference = agentInstanceService;
}

// ─── Fire a task ─────────────────────────────────────────────────────────────

async function fireTask(task: ScheduledTaskEntity): Promise<void> {
  if (!isWithinActiveHours(task)) {
    logger.debug('ScheduledTaskManager: skipped outside active hours', { taskId: task.id });
    return;
  }

  const service = agentInstanceServiceReference;
  if (!service) {
    logger.warn('ScheduledTaskManager: agentInstanceService not ready', { taskId: task.id });
    return;
  }

  const message = task.payload?.message || `[Scheduled] Task "${task.name ?? task.id}" triggered.`;

  try {
    await service.sendMsgToAgent(task.agentInstanceId, { text: message });
    logger.info('ScheduledTaskManager: task fired', { taskId: task.id, agentInstanceId: task.agentInstanceId });
  } catch (error) {
    logger.error('ScheduledTaskManager: failed to send message', { taskId: task.id, error });
  }

  // Update DB counters
  if (scheduledTaskRepo) {
    const newRunCount = task.runCount + 1;
    const now = new Date();

    const update: Partial<ScheduledTaskEntity> = {
      runCount: newRunCount,
      lastRunAt: now,
    };

    const maxRunsReached = task.maxRuns != null && newRunCount >= task.maxRuns;
    if (task.deleteAfterRun || maxRunsReached) {
      await removeTask(task.id);
      return;
    }

    task.runCount = newRunCount;
    task.lastRunAt = now;
    await scheduledTaskRepo.update(task.id, update);
  }
}

// ─── Schedule a runtime entry ─────────────────────────────────────────────────

function scheduleEntry(task: ScheduledTaskEntity): void {
  cancelEntry(task.id);

  if (!task.enabled) return;

  const schedule = task.schedule;

  if (schedule.kind === 'interval') {
    const intervalMs = Math.max(60, (schedule as IntervalSchedule).intervalSeconds) * 1000;
    const handle = setInterval(() => {
      void fireTask(task);
      // Update nextRunAt in task object
      task.nextRunAt = new Date(Date.now() + intervalMs);
      if (scheduledTaskRepo) void scheduledTaskRepo.update(task.id, { nextRunAt: task.nextRunAt });
    }, intervalMs);
    handle.unref?.();
    task.nextRunAt = new Date(Date.now() + intervalMs);
    activeEntries.set(task.id, { task, intervalHandle: handle });
  } else if (schedule.kind === 'at') {
    const atSchedule = schedule as AtSchedule;
    const wakeAt = new Date(atSchedule.wakeAtISO);
    const delayMs = Math.max(0, wakeAt.getTime() - Date.now());
    task.nextRunAt = wakeAt;

    const handle = setTimeout(() => {
      void fireTask(task).then(async () => {
        const entry = activeEntries.get(task.id);
        if (!entry) return;

        if (atSchedule.repeatIntervalMinutes && atSchedule.repeatIntervalMinutes > 0) {
          // Convert to interval
          const repeatMs = atSchedule.repeatIntervalMinutes * 60_000;
          const repeatHandle = setInterval(() => {
            void fireTask(task);
            task.nextRunAt = new Date(Date.now() + repeatMs);
            if (scheduledTaskRepo) void scheduledTaskRepo.update(task.id, { nextRunAt: task.nextRunAt });
          }, repeatMs);
          repeatHandle.unref?.();
          task.nextRunAt = new Date(Date.now() + repeatMs);
          activeEntries.set(task.id, { task, intervalHandle: repeatHandle });
          if (scheduledTaskRepo) await scheduledTaskRepo.update(task.id, { nextRunAt: task.nextRunAt });
        } else {
          activeEntries.delete(task.id);
        }
      });
    }, delayMs);
    handle.unref?.();
    activeEntries.set(task.id, { task, timeoutHandle: handle });
  } else if (schedule.kind === 'cron') {
    const cronSchedule = schedule as CronSchedule;
    try {
      const cronJob = new Cron(cronSchedule.expression, {
        timezone: cronSchedule.timezone,
        protect: true,
      }, () => {
        void fireTask(task).then(() => {
          task.nextRunAt = cronJob.nextRun() ?? undefined;
          if (scheduledTaskRepo && task.nextRunAt) void scheduledTaskRepo.update(task.id, { nextRunAt: task.nextRunAt });
        });
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
  const tasks = await repo.find({ where: { enabled: true } });
  let restored = 0;

  for (const task of tasks) {
    if (await isVolatile(task.agentInstanceId)) continue;

    // For 'at' tasks that are in the past and not repeating, fire immediately
    if (task.schedule.kind === 'at') {
      const atSchedule = task.schedule as AtSchedule;
      const wakeAt = new Date(atSchedule.wakeAtISO);
      if (wakeAt.getTime() <= Date.now() && !atSchedule.repeatIntervalMinutes) {
        scheduleEntry({ ...task, schedule: { ...atSchedule, wakeAtISO: new Date().toISOString() } });
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
export async function addTask(input: CreateScheduledTaskInput): Promise<ScheduledTask> {
  if (!scheduledTaskRepo) throw new Error('ScheduledTaskManager not initialized');

  const entity = scheduledTaskRepo.create({
    id: nanoid(),
    agentInstanceId: input.agentInstanceId,
    agentDefinitionId: input.agentDefinitionId,
    name: input.name,
    scheduleKind: input.scheduleKind,
    schedule: input.schedule,
    payload: input.payload,
    enabled: input.enabled ?? true,
    deleteAfterRun: input.deleteAfterRun ?? false,
    activeHoursStart: input.activeHoursStart,
    activeHoursEnd: input.activeHoursEnd,
    maxRuns: input.maxRuns,
    createdBy: input.createdBy ?? 'settings-ui',
    runCount: 0,
  });

  await scheduledTaskRepo.save(entity);

  if (entity.enabled) {
    scheduleEntry(entity);
  }

  logger.info('ScheduledTaskManager: task added', { taskId: entity.id, kind: entity.scheduleKind });
  return entityToDto(entity);
}

/** Update an existing task (restarts timer). */
export async function updateTask(input: UpdateScheduledTaskInput): Promise<ScheduledTask> {
  if (!scheduledTaskRepo) throw new Error('ScheduledTaskManager not initialized');

  const entity = await scheduledTaskRepo.findOne({ where: { id: input.id } });
  if (!entity) throw new Error(`ScheduledTask not found: ${input.id}`);

  if (input.schedule !== undefined) {
    entity.schedule = input.schedule;
    entity.scheduleKind = input.schedule.kind;
  }
  if (input.name !== undefined) entity.name = input.name;
  if (input.payload !== undefined) entity.payload = input.payload;
  if (input.enabled !== undefined) entity.enabled = input.enabled;
  if (input.deleteAfterRun !== undefined) entity.deleteAfterRun = input.deleteAfterRun;
  if (input.activeHoursStart !== undefined) entity.activeHoursStart = input.activeHoursStart;
  if (input.activeHoursEnd !== undefined) entity.activeHoursEnd = input.activeHoursEnd;
  if (input.maxRuns !== undefined) entity.maxRuns = input.maxRuns;
  if (input.agentDefinitionId !== undefined) entity.agentDefinitionId = input.agentDefinitionId;

  await scheduledTaskRepo.save(entity);

  cancelEntry(entity.id);
  if (entity.enabled) scheduleEntry(entity);

  logger.info('ScheduledTaskManager: task updated', { taskId: entity.id });
  return entityToDto(entity);
}

/** Remove a task (stops timer and deletes from DB). */
export async function removeTask(taskId: string): Promise<void> {
  cancelEntry(taskId);
  if (scheduledTaskRepo) {
    await scheduledTaskRepo.delete(taskId);
  }
  logger.info('ScheduledTaskManager: task removed', { taskId });
}

/** List all active in-memory tasks. */
export function getActiveTasks(): ScheduledTask[] {
  return [...activeEntries.values()].map(e => entityToDto(e.task));
}

/** List tasks for a specific agent instance. */
export function getActiveTasksForAgent(agentInstanceId: string): ScheduledTask[] {
  return [...activeEntries.values()]
    .filter(e => e.task.agentInstanceId === agentInstanceId)
    .map(e => entityToDto(e.task));
}

/** Stop all timers (for app shutdown). */
export function stopAllScheduledTasks(): void {
  for (const [id] of activeEntries) cancelEntry(id);
  logger.info('ScheduledTaskManager: all tasks stopped');
}

/** Get next N run times for a cron expression (for UI preview). */
export function getCronPreviewDates(expression: string, timezone?: string, count = 3): string[] {
  try {
    const dates: string[] = [];
    const cron = new Cron(expression, { timezone, maxRuns: count });
    let next = cron.nextRun();
    while (next && dates.length < count) {
      dates.push(next.toISOString());
      next = cron.nextRun();
    }
    cron.stop();
    return dates;
  } catch {
    return [];
  }
}

/**
 * Cancel all tasks for an agent instance (used on closeAgent / deleteAgent).
 */
export function cancelTasksForAgent(agentInstanceId: string): void {
  for (const [id, entry] of activeEntries) {
    if (entry.task.agentInstanceId === agentInstanceId) {
      cancelEntry(id);
    }
  }
}
