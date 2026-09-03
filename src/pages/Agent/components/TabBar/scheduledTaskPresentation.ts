import type { ScheduledTask } from 'memeloop';

/** Presentation helpers retain the exact Core task object and derive only display values. */
export function getScheduledTaskWakeAt(task: Readonly<ScheduledTask>): string | undefined {
  return task.nextRunAt ?? (task.schedule.kind === 'at' ? task.schedule.wakeAtISO : undefined);
}

export function sortScheduledTasksByNextRun(tasks: readonly ScheduledTask[]): ScheduledTask[] {
  return [...tasks].sort((left, right) => {
    const leftWakeAt = getScheduledTaskWakeAt(left);
    const rightWakeAt = getScheduledTaskWakeAt(right);
    const leftTime = leftWakeAt ? new Date(leftWakeAt).getTime() : Number.MAX_SAFE_INTEGER;
    const rightTime = rightWakeAt ? new Date(rightWakeAt).getTime() : Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime;
  });
}

export function groupScheduledTasksByAgentInstanceId(
  tasks: readonly ScheduledTask[],
): ReadonlyMap<string, readonly ScheduledTask[]> {
  const tasksByAgent = new Map<string, ScheduledTask[]>();
  for (const task of tasks) {
    const existing = tasksByAgent.get(task.agentInstanceId) ?? [];
    existing.push(task);
    tasksByAgent.set(task.agentInstanceId, existing);
  }
  return tasksByAgent;
}

export function formatScheduledTaskWakeTime(
  value: string | undefined,
  locale: string | readonly string[] | undefined,
  unknownLabel: string,
): string {
  if (!value) return unknownLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
