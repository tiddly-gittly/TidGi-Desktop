import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

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
  card?: string;

  @OneToMany(() => SessionEntity, session => session.agent)
  sessions!: SessionEntity[];
}

/**
 * Session entity, represents a session in the A2A protocol.
 */
@Entity('agent_sessions')
export class SessionEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  agentId!: string;

  @ManyToOne(() => AgentEntity, agent => agent.sessions)
  @JoinColumn({ name: 'agentId' })
  agent!: AgentEntity;

  @Column('text')
  state!: string; // 等价于 TaskState (保持与A2A协议兼容)

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

  @OneToMany(() => SessionMessageEntity, message => message.session)
  messages!: SessionMessageEntity[];
}

/**
 * Session message entity, represents a message in a session's history.
 */
@Entity('agent_session_messages')
export class SessionMessageEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  sessionId!: string;

  @ManyToOne(() => SessionEntity, session => session.messages)
  @JoinColumn({ name: 'sessionId' })
  session!: SessionEntity;

  @Column('text')
  role!: string; // 'user' | 'agent'

  @Column('text')
  parts!: string; // JSON string of message parts

  @Column({ type: 'text', nullable: true })
  metadata?: string; // JSON string of metadata

  @CreateDateColumn()
  timestamp!: Date;
}
