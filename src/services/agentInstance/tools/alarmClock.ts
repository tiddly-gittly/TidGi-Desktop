/**
 * Alarm Clock Tool — terminates the current agent loop and schedules a self-wake at a future time.
 * The agent can use this to "sleep" and resume later.
 */
import { container } from '@services/container';
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
}).meta({
  title: 'alarm-clock',
  description: 'Set a future wake-up time and temporarily exit the conversation loop. At the scheduled time, the agent will receive the reminder message and resume working.',
  examples: [{ wakeAtISO: '2025-12-01T09:00:00Z', reminderMessage: 'Check if the daily note was created successfully.' }],
});

/** Active timers keyed by agentId, so they can be cancelled on agent close */
const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();

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

      // Clear any existing timer for this agent
      const existing = activeTimers.get(agentId);
      if (existing) clearTimeout(existing);

      // Schedule wake-up
      const timer = setTimeout(async () => {
        activeTimers.delete(agentId);
        try {
          const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
          const message = parameters.reminderMessage || `Alarm: You scheduled a wake-up for ${parameters.wakeAtISO}. Continue your previous task.`;
          await agentInstanceService.sendMsgToAgent(agentId, { text: `[Alarm Clock] ${message}` });
          logger.info('Alarm clock fired, sent wake-up message', { agentId, wakeAtISO: parameters.wakeAtISO });
        } catch (error) {
          logger.error('Alarm clock failed to send wake-up message', { error, agentId });
        }
      }, delayMs);

      activeTimers.set(agentId, timer);

      logger.info('Alarm clock set', { agentId, wakeAtISO: parameters.wakeAtISO, delayMs });
      // Do NOT call yieldToSelf — the loop will end, returning control to user
      return {
        success: true,
        data: `Alarm set for ${parameters.wakeAtISO} (in ${Math.round(delayMs / 1000)}s). Exiting loop now. I will resume when the alarm fires.`,
      };
    });
  },
});

/** Cancel an active alarm for an agent (call on agent close/delete) */
export function cancelAlarm(agentId: string): void {
  const timer = activeTimers.get(agentId);
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(agentId);
  }
}

export const alarmClockTool = alarmClockDefinition.tool;
