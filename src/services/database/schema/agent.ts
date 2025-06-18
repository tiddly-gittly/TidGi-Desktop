import { AgentDefinition, AgentToolConfig } from '@services/agentDefinition/interface';
import { AgentInstance, AgentInstanceLatestStatus, AgentInstanceMessage } from '@services/agentInstance/interface';
import { AiAPIConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';

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
  handlerID?: string;

  /** Agent handler configuration parameters, stored as JSON */
  @Column({ type: 'simple-json', nullable: true })
  handlerConfig?: Record<string, unknown>;

  /** Agent's AI API configuration, can override global default config */
  @Column({ type: 'simple-json', nullable: true })
  aiApiConfig?: Partial<AiAPIConfig>;

  /** Tools available to this agent */
  @Column({ type: 'simple-json', nullable: true })
  agentTools?: AgentToolConfig[];

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
  handlerConfig?: Record<string, unknown>;

  @Column({ default: false })
  closed: boolean = false;

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
    enum: ['user', 'assistant', 'agent'],
    default: 'user',
  })
  role!: 'user' | 'assistant' | 'agent';

  @Column({ type: 'text' })
  content!: string;

  @Column({
    type: 'varchar',
    nullable: true,
    default: 'text/plain',
  })
  contentType?: string;

  @UpdateDateColumn()
  modified?: Date;

  @Column({ type: 'simple-json', nullable: true, name: 'meta_data' })
  metadata?: Record<string, unknown>;

  // Relation to AgentInstance
  @ManyToOne(() => AgentInstanceEntity, instance => instance.messages)
  @JoinColumn({ name: 'agentId' })
  agentInstance?: AgentInstanceEntity;
}
