import type { AgentGoal } from 'memeloop';
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('agent_goals')
@Index('IDX_agent_goals_active', ['executionNodeId', 'status', 'conversationId'])
export class AgentGoalEntity {
  @PrimaryColumn()
  conversationId!: string;

  @Column()
  executionNodeId!: string;

  @Column({ type: 'varchar' })
  status!: AgentGoal['status'];

  @Column({ type: 'integer' })
  revision!: number;

  @Column({ type: 'text' })
  goalJson!: string;
}
