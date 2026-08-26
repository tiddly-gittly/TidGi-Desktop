export type ScheduleKind = 'at' | 'cron';

export interface AtSchedule {
  kind: 'at';
  wakeAtISO: string;
}

export interface CronSchedule {
  kind: 'cron';
  expression: string;
  timezone?: string;
}

export type ScheduleConfig = AtSchedule | CronSchedule;

import type { ScheduledTaskState } from 'memeloop';

export interface ScheduledTask {
  id: string;
  agentInstanceId: string;
  agentDefinitionId: string;
  name: string;
  scheduleKind: ScheduleKind;
  schedule: ScheduleConfig;
  payload?: { message: string };
  enabled: boolean;
  deleteAfterRun: boolean;
  activeHoursStart?: string;
  activeHoursEnd?: string;
  lastRunAt?: string;
  lastRunStatus?: 'succeeded' | 'failed';
  lastError?: string;
  lastFailureAt?: string;
  consecutiveFailures: number;
  nextRetryAt?: string;
  nextRunAt?: string;
  runCount: number;
  maxRuns?: number;
  createdBy: string;
  created: string;
  updated: string;
  state: ScheduledTaskState;
  executionNodeId: string;
  executionNodeLabel?: string;
  originNodeId: string;
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
  state?: ScheduledTaskState;
  executionNodeId?: string;
  executionNodeLabel?: string;
  originNodeId?: string;
}

export interface ListScheduledTasksOptions {
  states?: ScheduledTaskState[];
  executionNodeIds?: string[];
}

export interface ScheduledTaskPagePosition {
  updatedAt: string;
  id: string;
}

export interface ListScheduledTasksPageForAgentInput {
  agentInstanceId: string;
  executionNodeId: string;
  states: ScheduledTaskState[];
  limit: number;
  after?: ScheduledTaskPagePosition;
  expectedRevision?: string;
  signal?: AbortSignal;
}

export interface ScheduledTaskPage {
  items: ScheduledTask[];
  revision: string;
  next?: ScheduledTaskPagePosition;
}

export interface ScheduledTaskScope {
  taskId: string;
  agentInstanceId: string;
  agentDefinitionId: string;
  executionNodeId: string;
}

export interface ScheduledTaskCallOptions {
  signal?: AbortSignal;
}

export interface RemoteScheduledTaskProjection {
  task: ScheduledTask;
  observedAt: number;
}

export interface RemoteScheduledTaskProjectionPagePosition {
  observedAt: number;
  id: string;
}

export interface ListRemoteScheduledTaskProjectionPageInput {
  agentInstanceId: string;
  states: ScheduledTaskState[];
  executionNodeIds?: string[];
  limit: number;
  after?: RemoteScheduledTaskProjectionPagePosition;
  expectedRevision?: string;
}

export interface RemoteScheduledTaskProjectionPage {
  items: RemoteScheduledTaskProjection[];
  revision: string;
  next?: RemoteScheduledTaskProjectionPagePosition;
}

export type UpdateScheduledTaskInput =
  & Partial<
    Omit<
      CreateScheduledTaskInput,
      'agentInstanceId' | 'payload' | 'activeHoursStart' | 'activeHoursEnd' | 'executionNodeLabel'
    >
  >
  & {
    id: string;
    payload?: { message: string } | null;
    activeHoursStart?: string | null;
    activeHoursEnd?: string | null;
    executionNodeLabel?: string | null;
  };
