import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { TabState, TabType } from '../../../pages/Agent/types/tab';

/**
 * Entity for all browser tabs (both open and closed)
 * Contains properties for all tab types with a field to indicate open/closed status
 */
@Entity('agent_browser_tabs')
export class AgentBrowserTabEntity {
  /** Unique tab identifier */
  @PrimaryColumn()
  id!: string;

  /** Tab type: web, chat, new_tab, split_view, create_new_agent */
  @Column({
    type: 'varchar',
    enum: [TabType.WEB, TabType.CHAT, TabType.NEW_TAB, TabType.SPLIT_VIEW, TabType.CREATE_NEW_AGENT],
    name: 'tab_type',
  })
  tabType!: TabType;

  /** Tab title */
  @Column()
  title!: string;

  /** Tab state: active, inactive, loading, error */
  @Column({
    type: 'varchar',
    enum: [TabState.ACTIVE, TabState.INACTIVE, TabState.LOADING, TabState.ERROR],
    default: TabState.INACTIVE,
  })
  state!: TabState;

  /** Whether tab is pinned */
  @Column({ default: false })
  isPinned!: boolean;

  /** Whether tab is open (true) or closed (false) */
  @Column({ default: true })
  opened!: boolean;

  /** Position index for tab ordering */
  @Column({ default: 0 })
  position!: number;

  /** Creation timestamp */
  @CreateDateColumn({ name: 'created_at' })
  created!: Date;

  /** Last update timestamp */
  @UpdateDateColumn({ name: 'modified_at' })
  modified!: Date;

  /**
   * Timestamp when the tab was closed, useful for sorting closed tabs
   * Will be null for open tabs
   */
  @Column({ nullable: true, name: 'closed_at' })
  @Index()
  closedAt?: Date;

  /**
   * Additional type-specific data stored as JSON
   * For web tabs: url, favicon
   * For chat tabs: agentId, agentDefId
   * For new tabs: favorites
   */
  @Column({ type: 'simple-json', nullable: true })
  data?: Record<string, unknown>;
}
