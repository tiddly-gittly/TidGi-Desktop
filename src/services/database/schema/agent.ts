import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Agent entity - stores information about available agents
 */
@Entity({ name: 'agents' })
export class AgentEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ nullable: true })
  avatarUrl?: string;

  /**
   * Agent card configuration (JSON)
   */
  @Column({ type: 'text', nullable: true })
  card?: string;

  /**
   * AI configuration for this agent (JSON)
   * Contains provider, model, and model parameters (temperature, topP, etc.)
   */
  @Column({ type: 'text', nullable: true })
  aiConfig?: string;

  /**
   * Creation timestamp
   */
  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  /**
   * Last update timestamp
   */
  @UpdateDateColumn({ type: 'datetime' })
  updatedAt!: Date;

  /**
   * Tasks belonging to this agent
   */
  @OneToMany(() => TaskEntity, task => task.agent)
  tasks!: TaskEntity[];
}

/**
 * Task entity - stores information about agent tasks (formerly sessions)
 */
@Entity({ name: 'tasks' })
export class TaskEntity {
  @PrimaryColumn()
  id!: string;

  /**
   * Reference to the agent that owns this task
   */
  @Column()
  @Index()
  agentId!: string;

  /**
   * Task state
   */
  @Column()
  state!: string;

  /**
   * Task status (JSON)
   */
  @Column({ type: 'text' })
  status!: string;

  /**
   * Task artifacts (JSON)
   */
  @Column({ type: 'text', nullable: true })
  artifacts?: string;

  /**
   * Task metadata (JSON)
   */
  @Column({ type: 'text', nullable: true })
  metadata?: string;

  /**
   * Task-specific AI configuration (JSON)
   * Overrides agent-level configuration
   */
  @Column({ type: 'text', nullable: true })
  aiConfig?: string;

  /**
   * Creation timestamp
   */
  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  /**
   * Last update timestamp
   */
  @UpdateDateColumn({ type: 'datetime' })
  updatedAt!: Date;

  /**
   * Agent this task belongs to
   */
  @ManyToOne(() => AgentEntity, agent => agent.tasks)
  @JoinColumn({ name: 'agentId' })
  agent!: AgentEntity;

  /**
   * Messages in this task
   */
  @OneToMany(() => TaskMessageEntity, message => message.task)
  messages!: TaskMessageEntity[];
}

/**
 * Task Message entity - stores message history
 */
@Entity({ name: 'task_messages' })
export class TaskMessageEntity {
  @PrimaryColumn()
  id!: string;

  /**
   * Reference to the task this message belongs to
   */
  @Column()
  @Index()
  taskId!: string;

  /**
   * Message role (user/agent)
   */
  @Column()
  role!: string;

  /**
   * Message parts (JSON)
   */
  @Column({ type: 'text' })
  parts!: string;

  /**
   * Message metadata (JSON)
   */
  @Column({ type: 'text', nullable: true })
  metadata?: string;

  /**
   * Creation timestamp
   */
  @CreateDateColumn({ type: 'datetime' })
  timestamp!: Date;

  /**
   * Task this message belongs to
   */
  @ManyToOne(() => TaskEntity, task => task.messages)
  @JoinColumn({ name: 'taskId' })
  task!: TaskEntity;
}

// Alias for backward compatibility
export const SessionEntity = TaskEntity;
export const SessionMessageEntity = TaskMessageEntity;
