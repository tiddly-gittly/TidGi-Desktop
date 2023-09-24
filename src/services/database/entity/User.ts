import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { WorkflowNetwork } from './WorkflowNetwork';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('text')
  username!: string;

  @OneToMany(() => WorkflowNetwork, workflowNetwork => workflowNetwork.user)
  workflowNetworks!: WorkflowNetwork[];
}
