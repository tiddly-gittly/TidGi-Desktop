export type ScheduleKind = 'interval' | 'at' | 'cron';

export interface IntervalSchedule {
  kind: 'interval';
  intervalSeconds: number;
}

export interface AtSchedule {
  kind: 'at';
  wakeAtISO: string;
  repeatIntervalMinutes?: number;
}

export interface CronSchedule {
  kind: 'cron';
  expression: string;
  timezone?: string;
}

export type ScheduleConfig = IntervalSchedule | AtSchedule | CronSchedule;

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
