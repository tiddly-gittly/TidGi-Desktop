import { Column, CreateDateColumn, Entity, ManyToOne, OneToMany, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Agent entity, represents a chat agent.
 */
@Entity('agents')
export class AgentEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ nullable: true })
  avatarUrl?: string;

  @Column({ type: 'simple-json', nullable: true })
  card?: object;

  @OneToMany(() => TaskEntity, task => task.agent)
  tasks!: TaskEntity[];
}

/**
 * Task entity, represents a task in the A2A protocol.
 * Each task acts as a session in the conversation.
 */
@Entity('agent_tasks')
export class TaskEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  agentId!: string;

  @ManyToOne(() => AgentEntity, agent => agent.tasks)
  agent!: AgentEntity;

  @Column('text')
  state!: string; // TaskState

  @Column({ type: 'text' })
  status!: string; // JSON string of TaskStatus

  @Column({ type: 'text', nullable: true })
  artifacts?: string; // JSON string of Artifact[]

  @Column({ type: 'text', nullable: true })
  metadata?: string; // JSON string of metadata

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => TaskMessageEntity, message => message.task)
  messages!: TaskMessageEntity[];
}

/**
 * Task message entity, represents a message in a task's history.
 * Each message is part of the conversation in a task.
 */
@Entity('agent_task_messages')
export class TaskMessageEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  taskId!: string;

  @ManyToOne(() => TaskEntity, task => task.messages)
  task!: TaskEntity;

  @Column('text')
  role!: string; // 'user' | 'agent'

  @Column('text')
  parts!: string; // JSON string of message parts

  @Column({ type: 'text', nullable: true })
  metadata?: string; // JSON string of metadata

  @CreateDateColumn()
  timestamp!: Date;
}
