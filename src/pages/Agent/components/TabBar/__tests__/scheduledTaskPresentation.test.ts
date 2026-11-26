import type { ScheduledTask } from 'memeloop';
import { describe, expect, it } from 'vitest';

import { formatScheduledTaskWakeTime, getScheduledTaskWakeAt, groupScheduledTasksByAgentInstanceId, sortScheduledTasksByNextRun } from '../scheduledTaskPresentation';

const task = (overrides: Partial<ScheduledTask> = {}): ScheduledTask => ({
  id: 'task-1',
  agentInstanceId: 'conversation-1',
  agentDefinitionId: 'definition-1',
  name: 'Wake up',
  schedule: { kind: 'cron', expression: '0 9 * * *' },
  enabled: true,
  state: 'active',
  executionNodeId: 'peer-local',
  originNodeId: 'peer-local',
  occurrenceId: 'occurrence-1',
  occurrenceAttempt: 3,
  executionRevision: 9,
  ...overrides,
});

describe('scheduled-task tab presentation', () => {
  it('groups the exact Core task objects without creating a local projection', () => {
    const first = task();
    const second = task({ id: 'task-2', agentInstanceId: 'conversation-2' });

    const grouped = groupScheduledTasksByAgentInstanceId([first, second]);

    expect(grouped.get('conversation-1')?.[0]).toBe(first);
    expect(grouped.get('conversation-2')?.[0]).toBe(second);
    expect(grouped.get('conversation-1')?.[0]).toMatchObject({
      occurrenceId: 'occurrence-1',
      occurrenceAttempt: 3,
      executionRevision: 9,
    });
  });

  it('uses the durable next-run projection and only falls back to an exact one-shot schedule', () => {
    const projected = task({
      nextRunAt: '2026-09-02T00:00:00.000Z',
      schedule: { kind: 'at', wakeAtISO: '2026-09-01T00:00:00.000Z' },
    });
    const oneShot = task({
      id: 'task-2',
      nextRunAt: undefined,
      schedule: { kind: 'at', wakeAtISO: '2026-09-03T00:00:00.000Z' },
    });
    const unprojectedCron = task({ id: 'task-3', nextRunAt: undefined });

    expect(getScheduledTaskWakeAt(projected)).toBe('2026-09-02T00:00:00.000Z');
    expect(getScheduledTaskWakeAt(oneShot)).toBe('2026-09-03T00:00:00.000Z');
    expect(getScheduledTaskWakeAt(unprojectedCron)).toBeUndefined();
    expect(sortScheduledTasksByNextRun([unprojectedCron, oneShot, projected])).toEqual([
      projected,
      oneShot,
      unprojectedCron,
    ]);
  });

  it('localizes valid dates and uses the translated unknown label when no projection exists', () => {
    expect(formatScheduledTaskWakeTime(undefined, 'zh-Hans', '未知')).toBe('未知');
    expect(formatScheduledTaskWakeTime('not-a-date', 'en', 'Unknown')).toBe('not-a-date');
    expect(formatScheduledTaskWakeTime('2026-09-01T00:00:00.000Z', 'en-US', 'Unknown')).not.toBe('Unknown');
  });
});
