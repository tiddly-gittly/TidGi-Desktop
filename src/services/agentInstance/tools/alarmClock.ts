/**
 * Alarm Clock Tool — terminates the current agent loop and schedules a self-wake at a future time.
 * The agent can use this to "sleep" and resume later.
 * Alarms are persisted to the database so they survive app restarts.
 */
import { container } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
import { AgentInstanceEntity } from '@services/database/schema/agent';
import { t } from '@services/libs/i18n/placeholder';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { z } from 'zod/v4';
import type { IAgentInstanceService } from '../interface';
import { registerToolDefinition } from './defineTool';

export const AlarmClockParameterSchema = z.object({
  toolListPosition: z.object({
    targetId: z.string().meta({ title: t('Schema.Common.ToolListPosition.TargetIdTitle'), description: t('Schema.Common.ToolListPosition.TargetId') }),
    position: z.enum(['before', 'after']).meta({ title: t('Schema.Common.ToolListPosition.PositionTitle'), description: t('Schema.Common.ToolListPosition.Position') }),
  }).optional().meta({ title: t('Schema.Common.ToolListPositionTitle'), description: t('Schema.Common.ToolListPosition.Description') }),
}).meta({ title: 'Alarm Clock Config', description: 'Configuration for the alarm clock / self-wake tool' });

export type AlarmClockParameter = z.infer<typeof AlarmClockParameterSchema>;

const AlarmClockToolSchema = z.object({
  wakeAtISO: z.string().meta({
    title: 'Wake time (ISO 8601)',
    description: 'The ISO 8601 datetime string for when to wake the agent. e.g. "2025-12-01T09:00:00Z"',
  }),
  reminderMessage: z.string().optional().meta({
    title: 'Reminder message',
    description: 'A message to send to yourself when you wake up, to remind you what to do next.',
  }),
  repeatIntervalMinutes: z.number().optional().meta({
    title: 'Repeat interval (minutes)',
    description: 'If set, the alarm repeats at this interval after the initial wake time. 0 or omitted = one-shot.',
  }),
}).meta({
  title: 'alarm-clock',
  description:
    'Set a future wake-up time and temporarily exit the conversation loop. At the scheduled time, the agent will receive the reminder message and resume working. Optionally set a repeat interval for recurring wake-ups.',
  examples: [
    { wakeAtISO: '2025-12-01T09:00:00Z', reminderMessage: 'Check if the daily note was created successfully.' },
    { wakeAtISO: '2025-12-01T09:00:00Z', reminderMessage: 'Hourly check-in', repeatIntervalMinutes: 60 },
  ],
});

/** Active timers keyed by agentId, so they can be cancelled on agent close */
interface ActiveAlarmTimer {
  agentId: string;
  timerId: ReturnType<typeof setTimeout>;
  wakeAtISO: string;
  reminderMessage?: string;
  repeatIntervalMinutes?: number;
  nextWakeAtISO: string;
  createdBy?: string;
  lastRunAtISO?: string;
  runCount: number;
}

const activeTimers = new Map<string, ActiveAlarmTimer>();

/** Persist alarm data to DB so it survives app restarts */
async function persistAlarm(
  agentId: string,
  data: {
    wakeAtISO: string;
    reminderMessage?: string;
    repeatIntervalMinutes?: number;
    createdBy?: string;
    lastRunAtISO?: string;
    runCount?: number;
  } | null,
): Promise<void> {
  try {
    const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
    const dataSource = await databaseService.getDatabase('agent');
    const repository = dataSource.getRepository(AgentInstanceEntity);
    await repository.update(agentId, { scheduledAlarm: data });
  } catch (error) {
    logger.warn('Failed to persist alarm data', { agentId, error });
  }
}

/**
 * Schedule alarm timer (used both during tool execution and on app restart restore).
 * Returns the timer handle.
 */
export function scheduleAlarmTimer(
  agentId: string,
  wakeAtISO: string,
  reminderMessage?: string,
  repeatIntervalMinutes?: number,
  options?: {
    createdBy?: string;
    runCount?: number;
    lastRunAtISO?: string;
  },
): void {
  const wakeAt = new Date(wakeAtISO);
  const now = new Date();
  const delayMs = Math.max(0, wakeAt.getTime() - now.getTime());
  const repeatMs = repeatIntervalMinutes ? Math.max(repeatIntervalMinutes, 1) * 60_000 : 0;

  // Clear existing timer
  const existing = activeTimers.get(agentId);
  if (existing) {
    clearTimeout(existing.timerId);
    clearInterval(existing.timerId);
  }

  const sendWakeMessage = async () => {
    const existingEntry = activeTimers.get(agentId);
    if (existingEntry) {
      existingEntry.lastRunAtISO = new Date().toISOString();
      existingEntry.runCount += 1;
    }

    try {
      const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
      const message = reminderMessage || `Alarm: You scheduled a wake-up for ${wakeAtISO}. Continue your previous task.`;
      await agentInstanceService.sendMsgToAgent(agentId, { text: `[Alarm Clock] ${message}` });
      logger.info('Alarm clock fired', { agentId, wakeAtISO, repeat: repeatMs > 0 });
    } catch (error) {
      logger.error('Alarm clock failed to send wake-up message', { error, agentId });
    }
  };

  if (repeatMs > 0) {
    const firstTimer = setTimeout(() => {
      void sendWakeMessage();
      const interval = setInterval(() => {
        const nextWakeAtISO = new Date(Date.now() + repeatMs).toISOString();
        const existingEntry = activeTimers.get(agentId);
        if (existingEntry) {
          existingEntry.nextWakeAtISO = nextWakeAtISO;
        }
        void sendWakeMessage();
      }, repeatMs);
      interval.unref?.();
      activeTimers.set(agentId, {
        agentId,
        timerId: interval,
        wakeAtISO,
        reminderMessage,
        repeatIntervalMinutes,
        nextWakeAtISO: new Date(Date.now() + repeatMs).toISOString(),
        createdBy: options?.createdBy ?? 'agent-tool',
        lastRunAtISO: options?.lastRunAtISO,
        runCount: options?.runCount ?? 0,
      });
    }, delayMs);
    firstTimer.unref?.();
    activeTimers.set(agentId, {
      agentId,
      timerId: firstTimer,
      wakeAtISO,
      reminderMessage,
      repeatIntervalMinutes,
      nextWakeAtISO: wakeAt.toISOString(),
      createdBy: options?.createdBy ?? 'agent-tool',
      lastRunAtISO: options?.lastRunAtISO,
      runCount: options?.runCount ?? 0,
    });
  } else {
    const timer = setTimeout(async () => {
      activeTimers.delete(agentId);
      // Clear persisted alarm after one-shot fires
      void persistAlarm(agentId, null);
      await sendWakeMessage();
    }, delayMs);
    timer.unref?.();
    activeTimers.set(agentId, {
      agentId,
      timerId: timer,
      wakeAtISO,
      reminderMessage,
      repeatIntervalMinutes,
      nextWakeAtISO: wakeAt.toISOString(),
      createdBy: options?.createdBy ?? 'agent-tool',
      lastRunAtISO: options?.lastRunAtISO,
      runCount: options?.runCount ?? 0,
    });
  }

  logger.info('Alarm scheduled', { agentId, wakeAtISO, delayMs, repeatIntervalMinutes });
}

// ─── schedule-task / list-schedules / remove-schedule / update-schedule ──────

const ScheduleTaskToolSchema = z.object({
  kind: z.enum(['interval', 'at', 'cron']).meta({
    title: 'Schedule kind',
    description: '"interval" (repeat every N seconds), "at" (run at ISO datetime, optionally repeating), "cron" (cron expression)',
  }),
  intervalSeconds: z.number().optional().meta({
    title: 'Interval (seconds)',
    description: 'Required when kind="interval". Minimum 60.',
  }),
  wakeAtISO: z.string().optional().meta({
    title: 'Wake time (ISO 8601)',
    description: 'Required when kind="at". The datetime to wake at.',
  }),
  repeatIntervalMinutes: z.number().optional().meta({
    title: 'Repeat (minutes)',
    description: 'When kind="at": repeat every N minutes after first fire.',
  }),
  cronExpression: z.string().optional().meta({
    title: 'Cron expression',
    description: 'Required when kind="cron". 5-field cron: min hour day month weekday',
  }),
  timezone: z.string().optional().meta({
    title: 'Timezone',
    description: 'IANA timezone for cron expressions, e.g. "Asia/Shanghai".',
  }),
  message: z.string().optional().meta({
    title: 'Message',
    description: 'Message sent to this agent when the schedule fires.',
  }),
  activeHoursStart: z.string().optional().meta({
    title: 'Active hours start',
    description: 'HH:MM — skip runs before this time.',
  }),
  activeHoursEnd: z.string().optional().meta({
    title: 'Active hours end',
    description: 'HH:MM — skip runs after this time.',
  }),
  name: z.string().optional().meta({
    title: 'Task name',
    description: 'Human-readable label for this schedule.',
  }),
}).meta({
  title: 'schedule-task',
  description: 'Create a new scheduled task that will periodically wake this agent.',
});

const ListSchedulesToolSchema = z.object({}).meta({
  title: 'list-schedules',
  description: 'List all active scheduled tasks for this agent.',
});

const RemoveScheduleToolSchema = z.object({
  taskId: z.string().meta({
    title: 'Task ID',
    description: 'ID of the scheduled task to remove (from list-schedules).',
  }),
}).meta({
  title: 'remove-schedule',
  description: 'Remove an active scheduled task by ID.',
});

const UpdateScheduleToolSchema = z.object({
  taskId: z.string().meta({
    title: 'Task ID',
    description: 'ID of the scheduled task to update (from list-schedules).',
  }),
  enabled: z.boolean().optional().meta({
    title: 'Enabled',
    description: 'Enable or disable the task without deleting it.',
  }),
  message: z.string().optional().meta({
    title: 'Message',
    description: 'New wake-up message.',
  }),
  activeHoursStart: z.string().optional().meta({ title: 'Active hours start', description: 'HH:MM' }),
  activeHoursEnd: z.string().optional().meta({ title: 'Active hours end', description: 'HH:MM' }),
}).meta({
  title: 'update-schedule',
  description: 'Update an existing scheduled task — change enabled state, message, or active hours.',
});

// ─── Tool definition ──────────────────────────────────────────────────────────

const alarmClockDefinition = registerToolDefinition({
  toolId: 'alarmClock',
  displayName: 'Alarm Clock',
  description: 'Schedule a self-wake at a future time and temporarily exit',
  configSchema: AlarmClockParameterSchema,
  llmToolSchemas: {
    'alarm-clock': AlarmClockToolSchema,
    'schedule-task': ScheduleTaskToolSchema,
    'list-schedules': ListSchedulesToolSchema,
    'remove-schedule': RemoveScheduleToolSchema,
    'update-schedule': UpdateScheduleToolSchema,
  },

  onProcessPrompts({ config, injectToolList }) {
    const pos = config.toolListPosition;
    if (!pos?.targetId) return;
    injectToolList({ targetId: pos.targetId, position: pos.position || 'after' });
  },

  async onResponseComplete({ toolCall, executeToolCall, agentFrameworkContext }) {
    if (!toolCall) return;
    const agentId = agentFrameworkContext.agent.id;

    // ── legacy alarm-clock ────────────────────────────────────────────────
    if (toolCall.toolId === 'alarm-clock') {
      await executeToolCall('alarm-clock', async (parameters) => {
        const wakeAt = new Date(parameters.wakeAtISO);
        const now = new Date();
        const delayMs = Math.max(0, wakeAt.getTime() - now.getTime());
        const repeatMs = parameters.repeatIntervalMinutes ? Math.max(parameters.repeatIntervalMinutes, 1) * 60_000 : 0;

        scheduleAlarmTimer(agentId, parameters.wakeAtISO, parameters.reminderMessage, parameters.repeatIntervalMinutes, {
          createdBy: 'agent-tool',
        });

        void persistAlarm(agentId, {
          wakeAtISO: parameters.wakeAtISO,
          reminderMessage: parameters.reminderMessage,
          repeatIntervalMinutes: parameters.repeatIntervalMinutes,
          createdBy: 'agent-tool',
          runCount: 0,
        });

        const repeatInfo = repeatMs > 0 ? ` Repeats every ${parameters.repeatIntervalMinutes} minutes.` : '';
        return {
          success: true,
          data: `Alarm set for ${parameters.wakeAtISO} (in ${Math.round(delayMs / 1000)}s).${repeatInfo} Exiting loop now. I will resume when the alarm fires.`,
        };
      });
      return;
    }

    // ── schedule-task ─────────────────────────────────────────────────────
    if (toolCall.toolId === 'schedule-task') {
      await executeToolCall('schedule-task', async (parameters) => {
        const { addTask } = await import('../scheduledTaskManager');
        let schedule: import('@services/database/schema/agent').ScheduleConfig;

        if (parameters.kind === 'interval') {
          const intervalSeconds = Math.max(60, parameters.intervalSeconds ?? 300);
          schedule = { kind: 'interval', intervalSeconds };
        } else if (parameters.kind === 'at') {
          if (!parameters.wakeAtISO) throw new Error('wakeAtISO is required for kind="at"');
          schedule = { kind: 'at', wakeAtISO: parameters.wakeAtISO, repeatIntervalMinutes: parameters.repeatIntervalMinutes };
        } else {
          if (!parameters.cronExpression) throw new Error('cronExpression is required for kind="cron"');
          schedule = { kind: 'cron', expression: parameters.cronExpression, timezone: parameters.timezone };
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const task = await addTask({
          agentInstanceId: agentId,
          name: parameters.name,
          scheduleKind: parameters.kind,
          schedule: schedule as any,
          payload: parameters.message ? { message: parameters.message } : undefined,
          activeHoursStart: parameters.activeHoursStart,
          activeHoursEnd: parameters.activeHoursEnd,
          createdBy: 'agent-tool',
          enabled: true,
        });

        return {
          success: true,
          data: `Scheduled task created (id: ${task.id}). Next run: ${task.nextRunAt ?? 'unknown'}.`,
        };
      });
      return;
    }

    // ── list-schedules ────────────────────────────────────────────────────
    if (toolCall.toolId === 'list-schedules') {
      await executeToolCall('list-schedules', async () => {
        const { getActiveTasksForAgent } = await import('../scheduledTaskManager');
        const tasks = getActiveTasksForAgent(agentId);
        if (tasks.length === 0) {
          return { success: true, data: 'No active scheduled tasks.' };
        }
        const summary = tasks.map(t => `[${t.id}] ${t.name ?? t.scheduleKind} — next: ${t.nextRunAt ?? '?'} — runs: ${t.runCount}`).join('\n');
        return { success: true, data: `Active scheduled tasks:\n${summary}` };
      });
      return;
    }

    // ── remove-schedule ───────────────────────────────────────────────────
    if (toolCall.toolId === 'remove-schedule') {
      await executeToolCall('remove-schedule', async (parameters) => {
        const { removeTask } = await import('../scheduledTaskManager');
        await removeTask(parameters.taskId);
        return { success: true, data: `Scheduled task ${parameters.taskId} removed.` };
      });
      return;
    }

    // ── update-schedule ───────────────────────────────────────────────────
    if (toolCall.toolId === 'update-schedule') {
      await executeToolCall('update-schedule', async (parameters) => {
        const { updateTask } = await import('../scheduledTaskManager');
        await updateTask({
          id: parameters.taskId,
          enabled: parameters.enabled,
          payload: parameters.message ? { message: parameters.message } : undefined,
          activeHoursStart: parameters.activeHoursStart,
          activeHoursEnd: parameters.activeHoursEnd,
        });
        return { success: true, data: `Scheduled task ${parameters.taskId} updated.` };
      });
    }
  },
});

/** Cancel an active alarm for an agent (call on agent close/delete) */
export function cancelAlarm(agentId: string): void {
  const alarm = activeTimers.get(agentId);
  if (alarm) {
    clearTimeout(alarm.timerId);
    clearInterval(alarm.timerId);
    activeTimers.delete(agentId);
  }
  // Also clear persisted alarm
  void persistAlarm(agentId, null);
}

/** Check if an alarm is active for an agent */
export function hasActiveAlarm(agentId: string): boolean {
  return activeTimers.has(agentId);
}

/** Get all agent IDs with active alarms */
export function getActiveAlarmAgentIds(): string[] {
  return [...activeTimers.keys()];
}

export function getActiveAlarmEntries(): ActiveAlarmTimer[] {
  return [...activeTimers.values()];
}

export const alarmClockTool = alarmClockDefinition.tool;
