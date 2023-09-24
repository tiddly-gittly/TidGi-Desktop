import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './User';

export enum WorkflowRunningState {
  Idle = 'idle',
  Running = 'running',
  Stopped = 'stopped',
}

@Entity()
export class WorkflowNetwork {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({
    type: 'varchar',
    default: WorkflowRunningState.Idle,
  })
  runningState!: WorkflowRunningState;

  @Column('text') // use text for large JSON string
  serializedState!: string;

  @ManyToOne(() => User, user => user.workflowNetworks)
  user!: User;
}
