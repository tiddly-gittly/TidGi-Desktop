import type { AgentDefinition, AgentHeartbeatConfig, AgentToolConfig } from '@services/agentDefinition/interface';
import type { AgentInstance, AgentInstanceLatestStatus, AgentInstanceMessage } from '@services/agentInstance/interface';
import type { AiAPIConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Persisted scheduled task — unified replacement for AgentDefinition.heartbeat and AgentInstanceEntity.scheduledAlarm.
 * Supports interval, one-shot ("at"), and cron expression ("cron") scheduling.
 */
export type ScheduleKind = 'interval' | 'at' | 'cron';

export interface IntervalSchedule {
  kind: 'interval';
  /** Seconds between runs */
  intervalSeconds: number;
}

export interface AtSchedule {
  kind: 'at';
  /** ISO 8601 datetime */
  wakeAtISO: string;
  /** Optional: repeat every N minutes after first fire */
  repeatIntervalMinutes?: number;
}

export interface CronSchedule {
  kind: 'cron';
  /** Cron expression (croner-compatible, 5 or 6 fields) */
  expression: string;
  /** IANA timezone, e.g. "Asia/Shanghai". Defaults to local. */
  timezone?: string;
}

export type ScheduleConfig = IntervalSchedule | AtSchedule | CronSchedule;

@Entity('scheduled_tasks')
export class ScheduledTaskEntity {
  @PrimaryColumn()
  id!: string;

  /** FK to agent instance — required */
  @Column()
  @Index()
  agentInstanceId!: string;

  /** FK to agent definition — optional, filled for definition-level heartbeats */
  @Column({ nullable: true })
  agentDefinitionId?: string;

  /** Human-readable task name */
  @Column({ nullable: true })
  name?: string;

  /** Schedule kind discriminator */
  @Column({ type: 'varchar' })
  scheduleKind!: ScheduleKind;

  /** Full schedule config stored as JSON */
  @Column({ type: 'simple-json' })
  schedule!: ScheduleConfig;

  /** Payload: message sent to agent on trigger */
  @Column({ type: 'simple-json', nullable: true })
  payload?: { message: string };

  /** Whether the task is active */
  @Column({ default: true })
  enabled: boolean = true;

  /** Delete after first successful run (one-shot alarm) */
  @Column({ default: false })
  deleteAfterRun: boolean = false;

  /** Active hours start in "HH:MM" format — skip runs outside this window */
  @Column({ nullable: true })
  activeHoursStart?: string;

  /** Active hours end in "HH:MM" format */
  @Column({ nullable: true })
  activeHoursEnd?: string;

  /** Timestamp of last successful execution */
  @Column({ type: 'datetime', nullable: true })
  lastRunAt?: Date;

  /** Pre-computed next run time (updated after each schedule calculation) */
  @Column({ type: 'datetime', nullable: true })
  nextRunAt?: Date;

  /** Total number of times this task has fired */
  @Column({ default: 0 })
  runCount: number = 0;

  /** Stop firing after this many runs (null = unlimited) */
  @Column({ type: 'integer', nullable: true })
  maxRuns?: number;

  /** Who created this task: "agent-tool", "settings-ui", "agent-definition", "restore" */
  @Column({ default: 'settings-ui' })
  createdBy: string = 'settings-ui';

  @CreateDateColumn()
  created!: Date;

  @UpdateDateColumn()
  updated!: Date;
}

/**
 * Database entity: Stores user modifications to predefined Agents
 * Note: AgentDefinition typically comes from downloaded JSON or app-defined templates,
 * we only store the user's customizations, not the complete definition
 * This saves space and makes it easier to track user personalization
 */
@Entity('agent_definitions')
export class AgentDefinitionEntity implements Partial<AgentDefinition> {
  /** Unique identifier for the agent */
  @PrimaryColumn()
  id!: string;

  /** Agent name, nullable indicates using default name */
  @Column({ nullable: true })
  name?: string;

  /** Detailed agent description, nullable indicates using default description */
  @Column({ type: 'text', nullable: true })
  description?: string;

  /** Agent avatar or icon URL, nullable indicates using default avatar */
  @Column({ nullable: true })
  avatarUrl?: string;

  /** Agent handler function ID, nullable indicates using default handler */
  @Column({ nullable: true })
  agentFrameworkID?: string;

  /** Agent handler configuration parameters, stored as JSON */
  @Column({ type: 'simple-json', nullable: true })
  agentFrameworkConfig?: Record<string, unknown>;

  /** Agent's AI API configuration, can override global default config */
  @Column({ type: 'simple-json', nullable: true })
  aiApiConfig?: Partial<AiAPIConfig>;

  /** Tools available to this agent */
  @Column({ type: 'simple-json', nullable: true })
  agentTools?: AgentToolConfig[];

  /** Heartbeat configuration for periodic auto-wake */
  @Column({ type: 'simple-json', nullable: true })
  heartbeat?: AgentHeartbeatConfig;

  /** Creation timestamp */
  @CreateDateColumn()
  createdAt!: Date;

  /** Last update timestamp */
  @UpdateDateColumn()
  updatedAt!: Date;

  // One AgentDefinition can have multiple AgentInstances
  @OneToMany(() => AgentInstanceEntity, instance => instance.agentDefinition)
  instances?: AgentInstanceEntity[];
}

/**
 * Stores user chat sessions with Agents
 */
@Entity('agent_instances')
export class AgentInstanceEntity implements Partial<AgentInstance> {
  @PrimaryColumn()
  id!: string;

  @Column()
  @Index()
  agentDefId!: string;

  @Column({ nullable: true })
  name?: string;

  @Column({ type: 'simple-json' })
  status!: AgentInstanceLatestStatus;

  @CreateDateColumn()
  created!: Date;

  @UpdateDateColumn()
  modified?: Date;

  @Column({ type: 'simple-json', nullable: true })
  aiApiConfig?: Partial<AiAPIConfig>;

  @Column({ nullable: true })
  avatarUrl?: string;

  /** Agent handler configuration parameters, inherited from AgentDefinition */
  @Column({ type: 'simple-json', nullable: true })
  agentFrameworkConfig?: Record<string, unknown>;

  @Column({ default: false })
  closed: boolean = false;

  /** Indicate this agent instance is temporary, like forked instance to do sub-jobs, or for preview when editing agent definitions. */
  @Column({ default: false })
  volatile: boolean = false;

  /** Persisted alarm data — survives app restart. Null when no alarm is active. */
  @Column({ type: 'simple-json', nullable: true })
  scheduledAlarm?: {
    wakeAtISO: string;
    reminderMessage?: string;
    repeatIntervalMinutes?: number;
    createdBy?: string;
    lastRunAtISO?: string;
    runCount?: number;
  } | null;

  // Relation to AgentDefinition
  @ManyToOne(() => AgentDefinitionEntity, definition => definition.instances)
  @JoinColumn({ name: 'agentDefId' })
  agentDefinition?: AgentDefinitionEntity;

  // One AgentInstance can have multiple Messages
  @OneToMany(() => AgentInstanceMessageEntity, message => message.agentInstance, {
    cascade: ['insert', 'update'],
  })
  messages?: AgentInstanceMessageEntity[];
}

/**
 * Stores conversation messages between users and Agents
 */
@Entity('agent_instance_messages')
export class AgentInstanceMessageEntity implements AgentInstanceMessage {
  @PrimaryColumn()
  id!: string;

  @Column()
  @Index()
  agentId!: string;

  @Column({
    type: 'varchar',
    enum: ['user', 'assistant', 'agent', 'tool', 'error'],
    default: 'user',
  })
  role!: 'user' | 'assistant' | 'agent' | 'tool' | 'error';

  @Column({ type: 'text' })
  content!: string;

  @Column({
    type: 'varchar',
    nullable: true,
    default: 'text/plain',
  })
  contentType?: string;

  @CreateDateColumn({ type: 'datetime' })
  created!: Date;

  @UpdateDateColumn()
  modified?: Date;

  @Column({ type: 'simple-json', nullable: true, name: 'meta_data' })
  metadata?: Record<string, unknown>;

  @Column({ type: 'integer', nullable: true })
  duration?: number;

  // Relation to AgentInstance
  @ManyToOne(() => AgentInstanceEntity, instance => instance.messages)
  @JoinColumn({ name: 'agentId' })
  agentInstance?: AgentInstanceEntity;
}
