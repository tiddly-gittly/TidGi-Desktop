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

  /**
   * Serialized state of the network. Containing:
   *
   * - chat history
   * - the node that is running
   * - packets in the edges
   *
   * use text for large JSON string of `SingleChatState` in `src/pages/Workflow/libs/ui/debugUIEffects/store.ts`
   */
  @Column('text')
  serializedState!: string;
}
