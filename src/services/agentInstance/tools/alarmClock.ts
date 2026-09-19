/**
 * Alarm Clock Tool — terminates the current agent loop and schedules a self-wake at a future time.
 * The agent can use this to "sleep" and resume later.
 *
 * Timer-management delegated to scheduledTaskManager; this file only holds the tool definition.
 */
import { i18n } from '@services/libs/i18n';
import { t } from '@services/libs/i18n/placeholder';
import { z } from 'zod/v4';
import { defineDesktopTool } from './defineToolDefinition';
import { addTask, getActiveTasksForAgent, removeTask, updateTask } from './scheduledTaskManager';

export const AlarmClockParameterSchema = z.object({
  toolListPosition: z.object({
    targetId: z.string().meta({ title: t('Schema.Common.ToolListPosition.TargetIdTitle'), description: t('Schema.Common.ToolListPosition.TargetId') }),
    position: z.enum(['before', 'after']).meta({ title: t('Schema.Common.ToolListPosition.PositionTitle'), description: t('Schema.Common.ToolListPosition.Position') }),
  }).optional().meta({ title: t('Schema.Common.ToolListPositionTitle'), description: t('Schema.Common.ToolListPosition.Description') }),
}).meta({ title: t('EditAgent.ScheduledWakeup'), description: t('EditAgent.ScheduledWakeupDescription') });

export type AlarmClockParameter = z.infer<typeof AlarmClockParameterSchema>;

// ─── schedule-task / list-schedules / remove-schedule / update-schedule ──────

const ScheduleTaskToolSchema = z.object({
  kind: z.enum(['at', 'cron']).meta({
    title: t('EditAgent.ScheduleMode'),
    description: t('Schema.AlarmClock.KindDescription'),
  }),
  wakeAtISO: z.string().optional().meta({
    title: t('EditAgent.ScheduleDailyTime'),
    description: t('Schema.AlarmClock.WakeAtDescription'),
  }),
  cronExpression: z.string().optional().meta({
    title: t('EditAgent.ScheduleCronExpr'),
    description: t('EditAgent.ScheduleCronHelp'),
  }),
  timezone: z.string().optional().meta({
    title: t('EditAgent.ScheduleTimezone'),
    description: t('Schema.AlarmClock.TimezoneDescription'),
  }),
  message: z.string().optional().meta({
    title: t('EditAgent.ScheduleMessage'),
    description: t('Schema.AlarmClock.MessageDescription'),
  }),
  activeHoursStart: z.string().optional().meta({
    title: t('EditAgent.ActiveHoursStart'),
    description: t('Schema.AlarmClock.ActiveHoursStartDescription'),
  }),
  activeHoursEnd: z.string().optional().meta({
    title: t('EditAgent.ActiveHoursEnd'),
    description: t('Schema.AlarmClock.ActiveHoursEndDescription'),
  }),
  name: z.string().optional().meta({
    title: t('Schema.AlarmClock.TaskNameTitle'),
    description: t('Schema.AlarmClock.TaskNameDescription'),
  }),
}).meta({
  title: 'schedule-task',
  description: t('EditAgent.ScheduledWakeupDescription'),
});

const ListSchedulesToolSchema = z.object({}).meta({
  title: 'list-schedules',
  description: t('Schema.AlarmClock.ListDescription'),
});

const RemoveScheduleToolSchema = z.object({
  taskId: z.string().meta({
    title: t('Schema.AlarmClock.TaskIdTitle'),
    description: t('Schema.AlarmClock.TaskIdDescription'),
  }),
}).meta({
  title: 'remove-schedule',
  description: t('Schema.AlarmClock.RemoveDescription'),
});

const UpdateScheduleToolSchema = z.object({
  taskId: z.string().meta({
    title: t('Schema.AlarmClock.TaskIdTitle'),
    description: t('Schema.AlarmClock.TaskIdDescription'),
  }),
  enabled: z.boolean().optional().meta({
    title: t('Schema.AlarmClock.EnabledTitle'),
    description: t('Schema.AlarmClock.EnabledDescription'),
  }),
  message: z.string().optional().meta({
    title: t('EditAgent.ScheduleMessage'),
    description: t('Schema.AlarmClock.MessageDescription'),
  }),
  activeHoursStart: z.string().optional().meta({ title: t('EditAgent.ActiveHoursStart'), description: t('Schema.AlarmClock.ActiveHoursStartDescription') }),
  activeHoursEnd: z.string().optional().meta({ title: t('EditAgent.ActiveHoursEnd'), description: t('Schema.AlarmClock.ActiveHoursEndDescription') }),
}).meta({
  title: 'update-schedule',
  description: t('Schema.AlarmClock.UpdateDescription'),
});

// ─── Tool definition ──────────────────────────────────────────────────────────

export const alarmClockDefinition = defineDesktopTool({
  toolId: 'alarmClock',
  displayName: t('EditAgent.ScheduledWakeup'),
  description: t('EditAgent.ScheduledWakeupDescription'),
  configSchema: AlarmClockParameterSchema,
  llmToolSchemas: {
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
    if (!toolCall.found) return;
    const agentId = agentFrameworkContext.agent.id;
    const agentDefinitionId = agentFrameworkContext.agent.agentDefId;
    const localNodeId = agentFrameworkContext.localNodeId;
    if (!localNodeId) throw new Error('local device identity is unavailable');

    // ── schedule-task ─────────────────────────────────────────────────────
    if (toolCall.toolId === 'schedule-task') {
      await executeToolCall('schedule-task', async (parameters) => {
        const schedule = parameters.kind === 'at'
          ? { kind: 'at' as const, wakeAtISO: parameters.wakeAtISO! }
          : { kind: 'cron' as const, expression: parameters.cronExpression!, timezone: parameters.timezone };

        const task = await addTask({
          agentInstanceId: agentId,
          agentDefinitionId,
          name: parameters.name ?? i18n.t('EditAgent.ScheduledWakeup'),
          scheduleKind: parameters.kind,
          schedule,
          payload: parameters.message ? { message: parameters.message } : undefined,
          activeHoursStart: parameters.activeHoursStart,
          activeHoursEnd: parameters.activeHoursEnd,
          createdBy: 'agent-tool',
          enabled: true,
          executionNodeId: localNodeId,
          originNodeId: localNodeId,
        });

        return {
          success: true,
          data: i18n.t('Tool.AlarmClock.TaskCreated', {
            taskId: task.id,
            nextRun: task.nextRunAt ?? i18n.t('Tool.AlarmClock.Unknown'),
          }),
        };
      });
      return;
    }

    // ── list-schedules ────────────────────────────────────────────────────
    if (toolCall.toolId === 'list-schedules') {
      await executeToolCall('list-schedules', async () => {
        const tasks = await getActiveTasksForAgent(agentId);
        if (tasks.length === 0) {
          return { success: true, data: i18n.t('Tool.AlarmClock.NoActiveTasks') };
        }
        const summary = tasks.map(task =>
          i18n.t('Tool.AlarmClock.TaskSummary', {
            taskId: task.id,
            name: task.name,
            nextRun: task.nextRunAt ?? i18n.t('Tool.AlarmClock.Unknown'),
            runCount: task.runCount,
          })
        ).join('\n');
        return { success: true, data: i18n.t('Tool.AlarmClock.ActiveTasks', { summary }) };
      });
      return;
    }

    // ── remove-schedule ───────────────────────────────────────────────────
    if (toolCall.toolId === 'remove-schedule') {
      await executeToolCall('remove-schedule', async (parameters) => {
        await removeTask(parameters.taskId);
        return { success: true, data: i18n.t('Tool.AlarmClock.TaskRemoved', { taskId: parameters.taskId }) };
      });
      return;
    }

    // ── update-schedule ───────────────────────────────────────────────────
    if (toolCall.toolId === 'update-schedule') {
      await executeToolCall('update-schedule', async (parameters) => {
        await updateTask(parameters.taskId, {
          enabled: parameters.enabled,
          payload: parameters.message ? { message: parameters.message } : undefined,
          activeHoursStart: parameters.activeHoursStart,
          activeHoursEnd: parameters.activeHoursEnd,
        });
        return { success: true, data: i18n.t('Tool.AlarmClock.TaskUpdated', { taskId: parameters.taskId }) };
      });
    }
  },
});
