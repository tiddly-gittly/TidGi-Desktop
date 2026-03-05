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
const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Persist alarm data to DB so it survives app restarts */
async function persistAlarm(agentId: string, data: { wakeAtISO: string; reminderMessage?: string; repeatIntervalMinutes?: number } | null): Promise<void> {
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
): void {
  const wakeAt = new Date(wakeAtISO);
  const now = new Date();
  const delayMs = Math.max(0, wakeAt.getTime() - now.getTime());
  const repeatMs = repeatIntervalMinutes ? Math.max(repeatIntervalMinutes, 1) * 60_000 : 0;

  // Clear existing timer
  const existing = activeTimers.get(agentId);
  if (existing) {
    clearTimeout(existing);
    clearInterval(existing);
  }

  const sendWakeMessage = async () => {
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
        void sendWakeMessage();
      }, repeatMs);
      activeTimers.set(agentId, interval);
    }, delayMs);
    activeTimers.set(agentId, firstTimer);
  } else {
    const timer = setTimeout(async () => {
      activeTimers.delete(agentId);
      // Clear persisted alarm after one-shot fires
      void persistAlarm(agentId, null);
      await sendWakeMessage();
    }, delayMs);
    activeTimers.set(agentId, timer);
  }

  logger.info('Alarm scheduled', { agentId, wakeAtISO, delayMs, repeatIntervalMinutes });
}

const alarmClockDefinition = registerToolDefinition({
  toolId: 'alarmClock',
  displayName: 'Alarm Clock',
  description: 'Schedule a self-wake at a future time and temporarily exit',
  configSchema: AlarmClockParameterSchema,
  llmToolSchemas: { 'alarm-clock': AlarmClockToolSchema },

  onProcessPrompts({ config, injectToolList }) {
    const pos = config.toolListPosition;
    if (!pos?.targetId) return;
    injectToolList({ targetId: pos.targetId, position: pos.position || 'after' });
  },

  async onResponseComplete({ toolCall, executeToolCall, agentFrameworkContext }) {
    if (!toolCall || toolCall.toolId !== 'alarm-clock') return;

    await executeToolCall('alarm-clock', async (parameters) => {
      const wakeAt = new Date(parameters.wakeAtISO);
      const now = new Date();
      const delayMs = Math.max(0, wakeAt.getTime() - now.getTime());
      const agentId = agentFrameworkContext.agent.id;
      const repeatMs = parameters.repeatIntervalMinutes ? Math.max(parameters.repeatIntervalMinutes, 1) * 60_000 : 0;

      // Schedule the timer
      scheduleAlarmTimer(agentId, parameters.wakeAtISO, parameters.reminderMessage, parameters.repeatIntervalMinutes);

      // Persist to DB so it survives restarts
      void persistAlarm(agentId, {
        wakeAtISO: parameters.wakeAtISO,
        reminderMessage: parameters.reminderMessage,
        repeatIntervalMinutes: parameters.repeatIntervalMinutes,
      });

      const repeatInfo = repeatMs > 0 ? ` Repeats every ${parameters.repeatIntervalMinutes} minutes.` : '';
      return {
        success: true,
        data: `Alarm set for ${parameters.wakeAtISO} (in ${Math.round(delayMs / 1000)}s).${repeatInfo} Exiting loop now. I will resume when the alarm fires.`,
      };
    });
  },
});

/** Cancel an active alarm for an agent (call on agent close/delete) */
export function cancelAlarm(agentId: string): void {
  const timer = activeTimers.get(agentId);
  if (timer) {
    clearTimeout(timer);
    clearInterval(timer);
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

export const alarmClockTool = alarmClockDefinition.tool;
