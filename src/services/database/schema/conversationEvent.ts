import type { AgentRunError, AgentRunState, ConversationEvent } from 'memeloop';
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Canonical, append-only MemeLoop conversation log.
 *
 * `eventJson` is bounded canonical JSON. Every other conversation table is a
 * disposable projection that can be rebuilt from these rows.
 */
@Entity('conversation_events')
@Index('IDX_conversation_event_origin_sequence', ['conversationId', 'originNodeId', 'originSequence'], { unique: true })
@Index('IDX_conversation_event_sync_cursor', ['conversationId', 'originNodeId', 'originSequence', 'eventId'])
@Index('IDX_conversation_event_origin_lamport', ['conversationId', 'originNodeId', 'lamportClock'])
export class ConversationEventEntity {
  @PrimaryColumn()
  eventId!: string;

  @Column()
  conversationId!: string;

  @Column()
  originNodeId!: string;

  @Column({ type: 'integer' })
  originSequence!: number;

  @Column({ type: 'integer' })
  lamportClock!: number;

  @Column({ type: 'integer' })
  timestamp!: number;

  @Column({ type: 'varchar' })
  kind!: ConversationEvent['kind'];

  @Column({ nullable: true })
  turnId?: string;

  @Column({ type: 'text' })
  eventJson!: string;
}

/** Durable allocator and exact contiguous frontier for one origin. */
@Entity('conversation_event_sequences')
export class ConversationEventSequenceEntity {
  @PrimaryColumn()
  conversationId!: string;

  @PrimaryColumn()
  originNodeId!: string;

  @Column({ type: 'integer' })
  lastSequence!: number;

  @Column({ type: 'integer' })
  contiguousFrontier!: number;
}

/** Indexed authorization projection for content-addressed conversation blobs. */
@Entity('conversation_attachment_references')
export class ConversationAttachmentReferenceEntity {
  @PrimaryColumn()
  conversationId!: string;

  @PrimaryColumn()
  contentHash!: string;

  @PrimaryColumn()
  filename!: string;

  @PrimaryColumn()
  mimeType!: string;

  @PrimaryColumn({ type: 'integer' })
  size!: number;
}

/**
 * Immutable canonical ChatMessage bytes for bounded detail/export reads.
 *
 * Keeping this payload in a BLOB side table lets SQLite serve `substr` ranges
 * without TypeORM materializing a multi-megabyte message in the main process.
 */
@Entity('conversation_message_details')
export class ConversationMessageDetailEntity {
  @PrimaryColumn()
  conversationId!: string;

  @PrimaryColumn()
  messageId!: string;

  @Column()
  turnId!: string;

  @Column({ type: 'integer' })
  byteLength!: number;

  @Column({ type: 'blob' })
  canonicalJson!: Buffer;

  /** Precomputed bounded list/live projection; opening chat never reads the full BLOB. */
  @Column({ type: 'integer' })
  listProjectionByteLength!: number;

  @Column({ type: 'blob' })
  listProjectionJson!: Buffer;
}

/** Durable, idempotent lifecycle state for accepted local or remote Agent runs. */
@Entity('agent_run_states')
@Index('UQ_agent_run_request', ['requestPeerId', 'requestId'], { unique: true })
@Index('IDX_agent_run_turn_owner', ['conversationId', 'turnId', 'requestPeerId'])
@Index('IDX_agent_run_active', ['state', 'updatedAt'])
export class AgentRunStateEntity {
  @PrimaryColumn()
  runId!: string;

  @Column()
  conversationId!: string;

  @Column()
  definitionId!: string;

  @Column()
  turnId!: string;

  @Column({ nullable: true })
  retrySourceTurnId?: string;

  @Column()
  requestPeerId!: string;

  @Column()
  requestId!: string;

  @Column()
  payloadDigest!: string;

  @Column({ type: 'varchar' })
  state!: AgentRunState;

  @Column({ type: 'integer' })
  acceptedAt!: number;

  @Column({ type: 'integer' })
  updatedAt!: number;

  @Column({ type: 'integer', nullable: true })
  startedAt?: number;

  @Column({ type: 'integer', nullable: true })
  finishedAt?: number;

  @Column({ type: 'integer', nullable: true })
  cancelRequestedAt?: number;

  @Column({ type: 'simple-json', nullable: true })
  error?: AgentRunError;
}

/** Append-derived turn visibility projection. Rows are never used as sync truth. */
@Entity('conversation_turn_tombstones')
export class ConversationTurnTombstoneEntity {
  @PrimaryColumn()
  conversationId!: string;

  @PrimaryColumn()
  turnId!: string;

  @Column()
  eventId!: string;

  @Column()
  originNodeId!: string;

  @Column({ type: 'integer' })
  originSequence!: number;

  @Column({ type: 'integer' })
  lamportClock!: number;

  @Column({ type: 'integer' })
  timestamp!: number;

  @Column({ nullable: true })
  reason?: string;

  @Column({ nullable: true })
  digest?: string;
}

/** Per-field deterministic LWW winner for metadataPatch projection. */
@Entity('conversation_metadata_fields')
export class ConversationMetadataFieldEntity {
  @PrimaryColumn()
  conversationId!: string;

  @PrimaryColumn()
  field!: string;

  @Column({ type: 'text' })
  valueJson!: string;

  @Column({ type: 'integer' })
  lamportClock!: number;

  @Column()
  originNodeId!: string;

  @Column()
  eventId!: string;
}

/** Constant-size conversation totals and monotonic timeline snapshot revision. */
@Entity('conversation_timeline_states')
@Index('IDX_conversation_timeline_last_order', ['lastMessageTimestamp', 'conversationId'])
export class ConversationTimelineStateEntity {
  @PrimaryColumn()
  conversationId!: string;

  @Column({ type: 'integer', default: 0 })
  revision!: number;

  @Column({ type: 'integer', default: 0 })
  totalMessages!: number;

  @Column({ type: 'integer', default: 0 })
  totalTurns!: number;

  @Column({ type: 'integer', default: 0 })
  totalEntries!: number;

  @Column({ type: 'text', default: '' })
  lastMessagePreview!: string;

  @Column({ type: 'integer', default: 0 })
  lastMessageTimestamp!: number;
}

/**
 * Sparse absolute-rank anchor for the visible timeline. One row is persisted
 * every 256 entries, keeping arbitrary seeks bounded without OFFSET scans.
 */
@Entity('conversation_timeline_rank_checkpoints')
@Index('IDX_conversation_timeline_rank_key', [
  'conversationId',
  'timestamp',
  'lamportClock',
  'originNodeId',
  'messageId',
])
export class ConversationTimelineRankCheckpointEntity {
  @PrimaryColumn()
  conversationId!: string;

  @PrimaryColumn({ type: 'integer' })
  entryIndex!: number;

  /** Number of visible user-root turns strictly before this entry. */
  @Column({ type: 'integer' })
  turnIndex!: number;

  @Column({ type: 'integer' })
  timestamp!: number;

  @Column({ type: 'integer' })
  lamportClock!: number;

  @Column()
  originNodeId!: string;

  @Column()
  messageId!: string;
}

/** Durable `.mjs` workflow milestone used for restart and node hand-off. */
@Entity('agent_loop_checkpoints')
export class AgentLoopCheckpointEntity {
  @PrimaryColumn()
  conversationId!: string;

  @PrimaryColumn()
  key!: string;

  @Column({ type: 'simple-json' })
  result!: unknown;

  @Column()
  eventId!: string;

  @Column()
  originNodeId!: string;

  @Column({ type: 'integer' })
  originSequence!: number;

  @Column({ type: 'integer' })
  lamportClock!: number;

  @Column({ type: 'integer' })
  timestamp!: number;
}

/** Singleton invalidation token for revisioned conversation directory pages. */
@Entity('conversation_list_state')
export class ConversationListStateEntity {
  @PrimaryColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'integer', default: 0 })
  revision!: number;
}

/**
 * Covering, disposable timeline projection.
 *
 * Previews are persisted at a hard ceiling, so timeline reads never touch the
 * unbounded message payload table. Absolute ordinals are resolved from sparse
 * rank checkpoints plus a bounded keyset scan.
 */
@Entity('conversation_timeline_entries')
@Index('UQ_conversation_timeline_cursor', ['conversationId', 'cursor'], { unique: true })
@Index('IDX_conversation_timeline_order', ['conversationId', 'timestamp', 'lamportClock', 'originNodeId', 'messageId'])
@Index('IDX_conversation_timeline_kind_order', ['conversationId', 'kind', 'timestamp', 'lamportClock', 'originNodeId', 'messageId'])
export class ConversationTimelineEntryEntity {
  @PrimaryColumn()
  conversationId!: string;

  @PrimaryColumn()
  messageId!: string;

  @Column()
  cursor!: string;

  @Column({ type: 'varchar' })
  kind!: 'message' | 'compaction';

  @Column()
  turnId!: string;

  @Column({ type: 'integer' })
  timestamp!: number;

  @Column({ type: 'integer' })
  lamportClock!: number;

  @Column()
  originNodeId!: string;

  /** Exact user-root index for messages; null until an orphan response's root arrives. */
  @Column({ type: 'integer', nullable: true })
  turnIndex?: number;

  @Column({ type: 'varchar', nullable: true })
  role?: 'user' | 'assistant' | 'agent';

  @Column({ nullable: true })
  actorId?: string;

  @Column({ nullable: true })
  actorLabel?: string;

  @Column({ type: 'text', nullable: true })
  preview?: string;

  @Column({ type: 'text', nullable: true })
  summaryPreview?: string;

  @Column({ type: 'integer', nullable: true })
  compactedMessageCount?: number;

  @Column({ type: 'integer', nullable: true })
  compactedTurnCount?: number;
}
