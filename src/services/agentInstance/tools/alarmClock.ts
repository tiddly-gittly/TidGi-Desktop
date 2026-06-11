/**
 * Alarm Clock Tool — terminates the current agent loop and schedules a self-wake at a future time.
 * The agent can use this to "sleep" and resume later.
 * 
 * Timer-management delegated to scheduledTaskManager; this file only holds the tool definition.
 */
import { t } from '@services/libs/i18n/placeholder';
import { logger } from '@services/libs/log';
import { z } from 'zod/v4';
import { addTask, removeTask, updateTask, getActiveTasksForAgent } from './scheduledTaskManager';
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

/**
 * Delegate alarm timer management to scheduledTaskManager.
 * Kept as a separate export so AgentInstanceService can still call them without import changes.
 */
export async function scheduleAlarmTimer(
  agentId: string,
  wakeAtISO: string,
  reminderMessage?: string,
  repeatIntervalMinutes?: number,
  options?: {
    createdBy?: string;
    runCount?: number;
    lastRunAtISO?: string;
  },
): Promise<void> {
  await addTask({
    agentInstanceId: agentId,
    name: `alarm-${wakeAtISO.slice(0, 10)}`,
    scheduleKind: 'at',
    schedule: { kind: 'at', wakeAtISO, repeatIntervalMinutes },
    payload: reminderMessage ? { message: reminderMessage } : undefined,
    createdBy: options?.createdBy ?? 'agent-tool',
    enabled: true,
  });
}

/** Cancel all alarm tasks for an agent. */
export function cancelAlarm(agentId: string): void {
  for (const task of getActiveTasksForAgent(agentId)) {
    if (task.scheduleKind === 'at') {
      void removeTask(task.id);
    }
  }
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

        await scheduleAlarmTimer(agentId, parameters.wakeAtISO, parameters.reminderMessage, parameters.repeatIntervalMinutes, {
          createdBy: 'agent-tool',
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
        const schedule = parameters.kind === 'interval'
          ? { kind: 'interval' as const, intervalSeconds: Math.max(60, parameters.intervalSeconds ?? 300) }
          : parameters.kind === 'at'
            ? { kind: 'at' as const, wakeAtISO: parameters.wakeAtISO!, repeatIntervalMinutes: parameters.repeatIntervalMinutes }
            : { kind: 'cron' as const, expression: parameters.cronExpression!, timezone: parameters.timezone };

        const task = await addTask({
          agentInstanceId: agentId,
          name: parameters.name,
          scheduleKind: parameters.kind,
          schedule,
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
        await removeTask(parameters.taskId);
        return { success: true, data: `Scheduled task ${parameters.taskId} removed.` };
      });
      return;
    }

    // ── update-schedule ───────────────────────────────────────────────────
    if (toolCall.toolId === 'update-schedule') {
      await executeToolCall('update-schedule', async (parameters) => {
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

export const alarmClockTool = alarmClockDefinition.tool;
