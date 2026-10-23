import type { ChatMessage } from 'memeloop';
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('conversation_edit_drafts')
export class ConversationEditDraftEntity {
  @PrimaryColumn()
  conversationId!: string;
  @PrimaryColumn()
  messageId!: string;
  @Column({ type: 'text', nullable: true })
  text!: string | null;
  @Column({ type: 'integer' })
  revision!: number;
}

@Entity('conversation_branches')
@Index('IDX_conversation_branch_root', ['rootConversationId', 'rootMessageId', 'createdAt'])
export class ConversationBranchEntity {
  @PrimaryColumn()
  variantConversationId!: string;
  @PrimaryColumn()
  variantMessageId!: string;
  @Column()
  rootConversationId!: string;
  @Column()
  rootMessageId!: string;
  @Column({ type: 'integer' })
  createdAt!: number;
}

@Entity('conversation_forks')
export class ConversationForkEntity {
  @PrimaryColumn()
  requestId!: string;
  @Column({ unique: true })
  targetConversationId!: string;
  @Column()
  replacementMessageId!: string;
  @Column()
  payloadDigest!: string;
  @Column({ type: 'text' })
  replacementText!: string;
  /** Full source user message retains authorized attachments for the new run. */
  @Column({ type: 'simple-json' })
  source!: ChatMessage;
}

@Entity('conversation_workspace_choices')
export class ConversationWorkspaceChoiceEntity {
  @PrimaryColumn()
  conversationId!: string;
  @Column({ type: 'varchar', nullable: true })
  workspaceId!: string | null;
}
