/**
 * Heartbeat Manager — Periodically wakes agents that have heartbeat configured.
 *
 * Each agent definition can have a `heartbeat` config specifying an interval and message.
 * The manager runs timers per agent-instance and sends automated messages to trigger the agent loop.
 * Active hours filtering is supported to restrict heartbeats to certain times of day.
 */
import type { AgentHeartbeatConfig } from '@services/agentDefinition/interface';
import { logger } from '@services/libs/log';
import type { IAgentInstanceService } from './interface';

interface HeartbeatEntry {
  timerId: ReturnType<typeof setInterval>;
  config: AgentHeartbeatConfig;
  agentId: string;
  nextWakeAtISO?: string;
  createdBy?: string;
  lastRunAtISO?: string;
  runCount: number;
}

const activeHeartbeats = new Map<string, HeartbeatEntry>();

function isWithinActiveHours(config: AgentHeartbeatConfig): boolean {
  if (!config.activeHoursStart || !config.activeHoursEnd) return true;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const parseTime = (t: string): number => {
    const [h, m] = t.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };

  const start = parseTime(config.activeHoursStart);
  const end = parseTime(config.activeHoursEnd);

  // Handle overnight ranges (e.g. 22:00 - 06:00)
  if (start <= end) {
    return currentMinutes >= start && currentMinutes <= end;
  }
  return currentMinutes >= start || currentMinutes <= end;
}

/**
 * Start a heartbeat timer for an agent instance.
 * If one already exists for this agent, it's replaced.
 */
export function startHeartbeat(
  agentId: string,
  config: AgentHeartbeatConfig,
  agentInstanceService: IAgentInstanceService,
  options?: { createdBy?: string },
): void {
  // Clean up existing heartbeat for this agent
  stopHeartbeat(agentId);

  if (!config.enabled) return;

  const intervalMs = Math.max(config.intervalSeconds, 60) * 1000;
  const message = config.message || '[Heartbeat] Periodic check-in. Review your tasks and take any pending actions.';

  const updateNextWake = () => {
    const entry = activeHeartbeats.get(agentId);
    if (!entry) return;
    entry.nextWakeAtISO = new Date(Date.now() + intervalMs).toISOString();
  };

  const initialNextWakeAtISO = new Date(Date.now() + intervalMs).toISOString();

  const timerId = setInterval(async () => {
    updateNextWake();

    const currentEntry = activeHeartbeats.get(agentId);
    if (currentEntry) {
      currentEntry.lastRunAtISO = new Date().toISOString();
      currentEntry.runCount += 1;
    }

    if (!isWithinActiveHours(config)) {
      logger.debug('Heartbeat skipped — outside active hours', { agentId });
      return;
    }

    try {
      await agentInstanceService.sendMsgToAgent(agentId, {
        text: `[Heartbeat] ${message}`,
      });
      logger.info('Heartbeat triggered', { agentId, intervalSeconds: config.intervalSeconds });
    } catch (error) {
      logger.error('Heartbeat failed to send message', { error, agentId });
    }
  }, intervalMs);

  timerId.unref?.();

  activeHeartbeats.set(agentId, {
    timerId,
    config,
    agentId,
    nextWakeAtISO: initialNextWakeAtISO,
    createdBy: options?.createdBy ?? 'agent-definition',
    runCount: 0,
  });
  logger.info('Heartbeat started', { agentId, intervalMs, activeHoursStart: config.activeHoursStart, activeHoursEnd: config.activeHoursEnd });
}

/**
 * Stop a heartbeat timer for an agent instance.
 */
export function stopHeartbeat(agentId: string): void {
  const entry = activeHeartbeats.get(agentId);
  if (entry) {
    clearInterval(entry.timerId);
    activeHeartbeats.delete(agentId);
    logger.debug('Heartbeat stopped', { agentId });
  }
}

/**
 * Stop all active heartbeats (for shutdown).
 */
export function stopAllHeartbeats(): void {
  for (const [agentId, entry] of activeHeartbeats) {
    clearInterval(entry.timerId);
    logger.debug('Heartbeat stopped during shutdown', { agentId });
  }
  activeHeartbeats.clear();
}

/**
 * Get all active heartbeat agent IDs.
 */
export function getActiveHeartbeats(): string[] {
  return [...activeHeartbeats.keys()];
}

export function getActiveHeartbeatEntries(): Array<HeartbeatEntry> {
  return [...activeHeartbeats.values()];
}
