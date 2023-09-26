import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum WorkflowRunningState {
  Idle = 'idle',
  Running = 'running',
  Stopped = 'stopped',
}

@Entity()
export class WorkflowNetwork {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'varchar',
    default: WorkflowRunningState.Idle,
  })
  runningState!: WorkflowRunningState;

  @Column('text')
  /**
   * Uri with format `tidgi://workspaceID/graphTiddlerTitle`
   *
   * Used to fetch fbp graph JSON from wiki
   */
  graphURI!: string;

  @Column('text') // use text for large JSON string
  serializedState!: string;
}
