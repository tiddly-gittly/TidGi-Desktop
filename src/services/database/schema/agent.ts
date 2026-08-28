import type { ScheduleConfig, ScheduleKind } from '@services/agentInstance/tools/scheduledTaskTypes';
import type { ScheduledTask as DesktopScheduledTask } from '@services/agentInstance/tools/scheduledTaskTypes';
import type { ScheduledTaskState } from 'memeloop';
import type { AgentDefinition, AgentHeartbeatConfig, AgentModelConfig, HostAgentToolConfig } from 'memeloop';
import type { AgentInstanceLatestStatus } from 'memeloop';
import type { AgentFrameworkConfig, AttachmentReference, ChatMessage, ChatMessagePart, ChatRole, DetailReference, ToolCall } from 'memeloop';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type { ScheduleConfig, ScheduleKind } from '@services/agentInstance/tools/scheduledTaskTypes';

@Entity('scheduled_tasks')
@Index('IDX_scheduled_task_rpc_page', ['agentInstanceId', 'executionNodeId', 'state', 'updated', 'id'])
export class ScheduledTaskEntity {
  @PrimaryColumn()
  id!: string;

  /** FK to agent instance — required */
  @Column()
  @Index()
  agentInstanceId!: string;

  /** FK to the definition whose grants/model configuration apply to this task. */
  @Column()
  agentDefinitionId!: string;

  /** Human-readable task name */
  @Column()
  name!: string;

  /** Schedule kind discriminator */
  @Column({ type: 'varchar' })
  scheduleKind!: ScheduleKind;

  /** Full schedule config stored as JSON */
  @Column({ type: 'simple-json' })
  schedule!: ScheduleConfig;

  /** Payload: message sent to agent on trigger */
  @Column({ type: 'simple-json', nullable: true })
  payload?: { message: string } | null;

  /** Whether the task is active */
  @Column({ default: true })
  enabled: boolean = true;

  @Column({ type: 'varchar', default: 'active' })
  @Index()
  state: ScheduledTaskState = 'active';

  /** PeerId of the device that owns the timer and executes the turn. */
  @Column()
  @Index()
  executionNodeId!: string;

  @Column({ type: 'varchar', nullable: true })
  executionNodeLabel?: string | null;

  /** PeerId that created the synchronized task metadata. */
  @Column()
  originNodeId!: string;

  /** Delete after first successful run (one-shot alarm) */
  @Column({ default: false })
  deleteAfterRun: boolean = false;

  /** Active hours start in "HH:MM" format — skip runs outside this window */
  @Column({ type: 'varchar', nullable: true })
  activeHoursStart?: string | null;

  /** Active hours end in "HH:MM" format */
  @Column({ type: 'varchar', nullable: true })
  activeHoursEnd?: string | null;

  /** Timestamp of last successful execution */
  @Column({ type: 'datetime', nullable: true })
  lastRunAt?: Date;

  @Column({ type: 'varchar', nullable: true })
  lastRunStatus?: 'succeeded' | 'failed';

  @Column({ type: 'text', nullable: true })
  lastError: string | null = null;

  @Column({ type: 'datetime', nullable: true })
  lastFailureAt: Date | null = null;

  @Column({ default: 0 })
  consecutiveFailures: number = 0;

  @Column({ type: 'datetime', nullable: true })
  nextRetryAt: Date | null = null;

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

/** Durable read-only projection of schedules owned by another device. */
@Entity('remote_scheduled_task_projections')
@Index('IDX_remote_scheduled_task_agent_node', ['agentInstanceId', 'executionNodeId'])
@Index('IDX_remote_scheduled_task_page', ['agentInstanceId', 'state', 'observedAt', 'id'])
export class RemoteScheduledTaskProjectionEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  taskId!: string;

  @Column()
  agentInstanceId!: string;

  @Column()
  executionNodeId!: string;

  /** Denormalized for bounded SQL filtering; never scan the JSON task blob. */
  @Column({ type: 'varchar' })
  state!: ScheduledTaskState;

  @Column({ type: 'simple-json' })
  task!: DesktopScheduledTask;

  @Column({ type: 'integer' })
  observedAt!: number;
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
  agentFrameworkConfig?: AgentFrameworkConfig;

  /** Canonical MemeLoop provider/model override for this definition. */
  @Column({ type: 'simple-json', nullable: true })
  modelConfig?: AgentModelConfig;

  /** Tools available to this agent */
  @Column({ type: 'simple-json', nullable: true })
  agentTools?: HostAgentToolConfig[];

  /** Heartbeat configuration for periodic auto-wake */
  @Column({ type: 'simple-json', nullable: true })
  heartbeat?: AgentHeartbeatConfig;

  /** Last bundled profile version applied to this row. Null identifies a legacy row. */
  @Column({ nullable: true })
  builtinVersion?: string;

  /**
   * Whether the user changed this definition. Null identifies a legacy row,
   * whose timestamps are used once to infer whether it is safe to refresh.
   */
  @Column({ type: 'boolean', nullable: true })
  isCustomized?: boolean;

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
@Index('IDX_agent_instance_directory_order', ['volatile', 'closed', 'modified', 'id'])
export class AgentInstanceEntity {
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
  modelConfig?: AgentModelConfig;

  @Column({ nullable: true })
  avatarUrl?: string;

  /** Agent handler configuration parameters, inherited from AgentDefinition */
  @Column({ type: 'simple-json', nullable: true })
  agentFrameworkConfig?: AgentFrameworkConfig;

  @Column({ default: false })
  closed: boolean = false;

  /** Indicate this agent instance is temporary, like forked instance to do sub-jobs, or for preview when editing agent definitions. */
  @Column({ default: false })
  volatile: boolean = false;

  /** Renderer-created preview marker. Volatile sub-agents are not previews and cannot use the destructive preview purge path. */
  @Column({ default: false })
  preview: boolean = false;

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
 * Database entity — implements ChatMessage directly so the runtime uses canonical fields.
 * Saved/queried through AgentInstanceService which handles the runtime ↔ DB mapping.
 */
@Entity('agent_instance_messages')
@Index('IDX_agent_message_conversation_order', ['conversationId', 'timestamp', 'lamportClock', 'originNodeId', 'messageId'])
@Index('IDX_agent_message_conversation_role_order', ['conversationId', 'role', 'timestamp', 'lamportClock', 'originNodeId', 'messageId'])
@Index('IDX_agent_message_conversation_compaction_order', ['conversationId', 'isContextCompaction', 'timestamp', 'lamportClock', 'originNodeId', 'messageId'])
@Index('UQ_agent_message_origin_sequence', ['conversationId', 'originNodeId', 'originSequence'], { unique: true })
@Index('IDX_agent_message_conversation_turn', ['conversationId', 'turnId'])
export class AgentInstanceMessageEntity implements ChatMessage {
  @PrimaryColumn()
  messageId!: string;

  @Column()
  @Index()
  conversationId!: string;

  @Column({ default: 'tidgi-desktop' })
  originNodeId!: string;

  /** Monotonic append coordinate allocated atomically per origin. */
  @Column({ type: 'integer' })
  originSequence!: number;

  /** Stable turn identity shared by user/assistant/tool/control events. */
  @Column()
  turnId!: string;

  @Column({ type: 'integer' })
  timestamp!: number;

  @Column({ type: 'integer' })
  lamportClock!: number;

  @Column({
    type: 'varchar',
    enum: ['user', 'assistant', 'agent', 'tool', 'error'],
    default: 'user',
  })
  role!: ChatRole;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'simple-json', nullable: true })
  parts?: ChatMessagePart[];

  @Column({ type: 'simple-json', nullable: true })
  toolCalls?: ToolCall[];

  @Column({ type: 'simple-json', nullable: true })
  attachments?: AttachmentReference[];

  @Column({ type: 'simple-json', nullable: true })
  detailRef?: DetailReference;

  @Column({ type: 'text', nullable: true })
  reasoning_content?: string;

  @Column({
    type: 'varchar',
    nullable: true,
    default: 'text/plain',
  })
  contentType?: string;

  @Column({ default: false })
  hidden?: boolean;

  @Column({ type: 'simple-json', nullable: true, name: 'meta_data' })
  metadata?: Record<string, unknown>;

  /** Indexed projection flag; avoids scanning all JSON metadata for the rail. */
  @Column({ default: false })
  isContextCompaction: boolean = false;

  @Column({ type: 'integer', nullable: true })
  duration?: number;

  // Relation to AgentInstance
  @ManyToOne(() => AgentInstanceEntity, instance => instance.messages)
  @JoinColumn({ name: 'conversationId' })
  agentInstance?: AgentInstanceEntity;
}
