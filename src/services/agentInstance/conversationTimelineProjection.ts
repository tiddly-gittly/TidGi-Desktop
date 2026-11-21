/** Timeline projection updates and sparse-rank rebuilding inside the caller-owned transaction. */
import { TIMELINE_ACTOR_LENGTH, TIMELINE_RANK_CHECKPOINT_INTERVAL, TIMELINE_STORED_PREVIEW_LENGTH } from '@/constants/agentStorage';
import { ConversationTimelineEntryEntity, ConversationTimelineRankCheckpointEntity, ConversationTurnTombstoneEntity } from '@services/database/schema/conversationEvent';
import type { ConversationEvent } from 'memeloop';
import { EntityManager } from 'typeorm';
import { timelinePreview, visibleMessagePredicate } from './conversationStorageUtilities';

const timelinePreviewDatabases = new WeakSet<object>();

function storedTimelinePreview(content: string): string {
  return timelinePreview(content, TIMELINE_STORED_PREVIEW_LENGTH);
}

function timelineActorIdentity(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0
    ? timelinePreview(value, TIMELINE_ACTOR_LENGTH) || fallback
    : fallback;
}

function timelineMessageActor(
  role: 'user' | 'assistant' | 'agent',
  originNodeId: string,
  metadata: Readonly<Record<string, unknown>> | undefined,
): { actorId: string; actorLabel: string } {
  const identity = role === 'user' ? metadata?.userId : metadata?.agentId;
  const label = role === 'user' ? metadata?.userName : metadata?.agentName;
  const actorId = timelineActorIdentity(metadata?.actorId ?? identity, originNodeId);
  return {
    actorId,
    actorLabel: timelineActorIdentity(metadata?.actorLabel ?? label, actorId),
  };
}

function registerTimelinePreviewSqlFunction(manager: EntityManager): void {
  const driver = manager.dataSource.driver as {
    databaseConnection?: object & {
      function(
        name: string,
        options: { deterministic: boolean },
        callback: (content: unknown, maximum: unknown) => string,
      ): unknown;
    };
  };
  const database = driver.databaseConnection;
  if (!database) throw new Error('conversation_timeline_sqlite_connection_unavailable');
  if (timelinePreviewDatabases.has(database)) return;
  database.function('memeloop_timeline_preview', { deterministic: true }, (content, maximum) => {
    if (typeof content !== 'string' || typeof maximum !== 'number' || !Number.isSafeInteger(maximum)) return '';
    return timelinePreview(content, Math.max(1, Math.min(maximum, TIMELINE_STORED_PREVIEW_LENGTH)));
  });
  timelinePreviewDatabases.add(database);
}

function timelineCursor(event: Pick<ConversationEvent, 'timestamp' | 'lamportClock' | 'originNodeId' | 'eventId'>): string {
  return event.eventId;
}

async function updateTimelineState(
  manager: EntityManager,
  conversationId: string,
  delta: { messages?: number; turns?: number; entries?: number },
): Promise<void> {
  const messages = delta.messages ?? 0;
  const turns = delta.turns ?? 0;
  const entries = delta.entries ?? 0;
  if (messages === 0 && turns === 0 && entries === 0) return;
  await manager.query(
    `INSERT INTO conversation_timeline_states (
       conversationId, revision, totalMessages, totalTurns, totalEntries
     ) VALUES (?, 1, MAX(0, ?), MAX(0, ?), MAX(0, ?))
     ON CONFLICT(conversationId) DO UPDATE SET
       revision = revision + 1,
       totalMessages = MAX(0, totalMessages + ?),
       totalTurns = MAX(0, totalTurns + ?),
       totalEntries = MAX(0, totalEntries + ?)`,
    [conversationId, messages, turns, entries, messages, turns, entries],
  );
}

async function refreshTimelineLastMessage(manager: EntityManager, conversationId: string): Promise<void> {
  const [last] = await manager.query<Array<{ content: string; timestamp: number }>>(
    `SELECT substr(message.content, 1, 240) AS content, message.timestamp
     FROM agent_instance_messages AS message
     WHERE message.conversationId = ? AND message.hidden = 0
       AND message.isContextCompaction = 0
       AND ${visibleMessagePredicate('message')}
     ORDER BY message.timestamp DESC, message.lamportClock DESC,
       message.originNodeId DESC, message.messageId DESC
     LIMIT 1`,
    [conversationId],
  );
  await manager.query(
    `UPDATE conversation_timeline_states
     SET lastMessagePreview = ?, lastMessageTimestamp = ?
     WHERE conversationId = ?`,
    [last ? storedTimelinePreview(last.content) : '', last?.timestamp ?? 0, conversationId],
  );
}

async function isTurnTombstoned(manager: EntityManager, conversationId: string, turnId: string): Promise<boolean> {
  return await manager.getRepository(ConversationTurnTombstoneEntity).findOne({
    where: { conversationId, turnId },
    select: { eventId: true },
  }) !== null;
}

async function resolveTimelineMessageTurnIndex(
  manager: EntityManager,
  conversationId: string,
  turnId: string,
): Promise<number | undefined> {
  const [row] = await manager.query<Array<{ turnIndex: number | null }>>(
    `SELECT CASE WHEN root.messageId IS NULL THEN NULL ELSE (
       SELECT COUNT(*) FROM conversation_timeline_entries AS earlier
       WHERE earlier.conversationId = ? AND earlier.kind = 'message'
         AND earlier.role = 'user' AND earlier.messageId = earlier.turnId
         AND (earlier.timestamp, earlier.lamportClock, earlier.originNodeId, earlier.messageId) <
           (root.timestamp, root.lamportClock, root.originNodeId, root.messageId)
     ) END AS turnIndex
     FROM (SELECT 1) AS singleton
     LEFT JOIN conversation_timeline_entries AS root
       ON root.conversationId = ? AND root.kind = 'message'
      AND root.role = 'user' AND root.messageId = ? AND root.turnId = ?`,
    [conversationId, conversationId, turnId, turnId],
  );
  return row?.turnIndex ?? undefined;
}

async function countTimelineRootsBefore(
  manager: EntityManager,
  event: Pick<ConversationEvent, 'conversationId' | 'timestamp' | 'lamportClock' | 'originNodeId' | 'eventId'>,
): Promise<number> {
  const [row] = await manager.query<Array<{ count: number }>>(
    `SELECT COUNT(*) AS count FROM conversation_timeline_entries AS root
     WHERE root.conversationId = ? AND root.kind = 'message'
       AND root.role = 'user' AND root.messageId = root.turnId
       AND (root.timestamp, root.lamportClock, root.originNodeId, root.messageId) < (?, ?, ?, ?)`,
    [event.conversationId, event.timestamp, event.lamportClock, event.originNodeId, event.eventId],
  );
  return row?.count ?? 0;
}

async function refreshOrphanTimelineMessageTurnIndices(
  manager: EntityManager,
  conversationId: string,
  turnId: string,
  turnIndex: number,
): Promise<void> {
  await manager.query(
    `UPDATE conversation_timeline_entries SET turnIndex = ?
     WHERE conversationId = ? AND kind = 'message' AND turnId = ?`,
    [turnIndex, conversationId, turnId],
  );
}

const dirtyTimelineRankCheckpoints = new WeakMap<EntityManager, Set<string>>();

function markTimelineRankCheckpointsDirty(manager: EntityManager, conversationId: string): void {
  const conversations = dirtyTimelineRankCheckpoints.get(manager) ?? new Set<string>();
  conversations.add(conversationId);
  dirtyTimelineRankCheckpoints.set(manager, conversations);
}

export async function rebuildTimelineRankCheckpoints(manager: EntityManager, conversationId: string): Promise<void> {
  await manager.query(
    `WITH ranked AS MATERIALIZED (
       SELECT entry.messageId, entry.turnId,
         COALESCE(SUM(CASE WHEN entry.kind = 'message' AND entry.role = 'user'
           AND entry.messageId = entry.turnId THEN 1 ELSE 0 END) OVER (
           ORDER BY entry.timestamp, entry.lamportClock,
             entry.originNodeId, entry.messageId
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
         ), 0) AS rootsBefore
       FROM conversation_timeline_entries AS entry
       WHERE entry.conversationId = ?
     ), roots AS MATERIALIZED (
       SELECT entry.turnId, ranked.rootsBefore AS turnIndex
       FROM conversation_timeline_entries AS entry
       JOIN ranked ON ranked.messageId = entry.messageId
       WHERE entry.conversationId = ? AND entry.kind = 'message'
         AND entry.role = 'user' AND entry.messageId = entry.turnId
     )
     UPDATE conversation_timeline_entries AS entry
     SET turnIndex = CASE WHEN entry.kind = 'message'
       THEN roots.turnIndex ELSE ranked.rootsBefore END
     FROM ranked LEFT JOIN roots ON roots.turnId = ranked.turnId
     WHERE entry.conversationId = ? AND ranked.messageId = entry.messageId`,
    [conversationId, conversationId, conversationId],
  );
  await manager.getRepository(ConversationTimelineRankCheckpointEntity).delete({ conversationId });
  await manager.query(
    `INSERT INTO conversation_timeline_rank_checkpoints (
       conversationId, entryIndex, turnIndex, timestamp,
       lamportClock, originNodeId, messageId
     )
     SELECT ranked.conversationId, ranked.entryIndex, ranked.turnIndex,
       ranked.timestamp, ranked.lamportClock, ranked.originNodeId, ranked.messageId
     FROM (
       SELECT entry.conversationId, entry.messageId, entry.timestamp,
         entry.lamportClock, entry.originNodeId,
         ROW_NUMBER() OVER (
           ORDER BY entry.timestamp, entry.lamportClock,
             entry.originNodeId, entry.messageId
         ) - 1 AS entryIndex,
         COALESCE(SUM(CASE WHEN entry.kind = 'message' AND entry.role = 'user'
           AND entry.messageId = entry.turnId THEN 1 ELSE 0 END) OVER (
           ORDER BY entry.timestamp, entry.lamportClock,
             entry.originNodeId, entry.messageId
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
         ), 0) AS turnIndex
       FROM conversation_timeline_entries AS entry
       WHERE entry.conversationId = ?
     ) AS ranked
     WHERE ranked.entryIndex % ? = 0`,
    [conversationId, TIMELINE_RANK_CHECKPOINT_INTERVAL],
  );
}

export async function finalizeTimelineRankCheckpoints(manager: EntityManager): Promise<void> {
  const conversations = dirtyTimelineRankCheckpoints.get(manager);
  if (!conversations) return;
  dirtyTimelineRankCheckpoints.delete(manager);
  for (const conversationId of conversations) {
    await rebuildTimelineRankCheckpoints(manager, conversationId);
  }
}

async function insertTimelineEntry(
  manager: EntityManager,
  event: ConversationEvent,
  values:
    & Pick<ConversationTimelineEntryEntity, 'kind' | 'turnId'>
    & Partial<
      Pick<
        ConversationTimelineEntryEntity,
        | 'turnIndex'
        | 'role'
        | 'actorId'
        | 'actorLabel'
        | 'preview'
        | 'summaryPreview'
        | 'compactedMessageCount'
        | 'compactedTurnCount'
      >
    >,
): Promise<void> {
  const repository = manager.getRepository(ConversationTimelineEntryEntity);
  if (await repository.findOne({ where: { conversationId: event.conversationId, messageId: event.eventId } })) return;
  const [rankState] = await manager.query<Array<{ totalEntries: number; totalTurns: number; hasLater: number }>>(
    `SELECT COALESCE(state.totalEntries, 0) AS totalEntries,
       COALESCE(state.totalTurns, 0) AS totalTurns,
       EXISTS (
         SELECT 1 FROM conversation_timeline_entries AS later
         WHERE later.conversationId = ? AND
           (later.timestamp, later.lamportClock, later.originNodeId, later.messageId) > (?, ?, ?, ?)
       ) AS hasLater
     FROM (SELECT 1) AS singleton
     LEFT JOIN conversation_timeline_states AS state ON state.conversationId = ?`,
    [
      event.conversationId,
      event.timestamp,
      event.lamportClock,
      event.originNodeId,
      event.eventId,
      event.conversationId,
    ],
  );
  await repository.insert(repository.create({
    conversationId: event.conversationId,
    messageId: event.eventId,
    cursor: timelineCursor(event),
    timestamp: event.timestamp,
    lamportClock: event.lamportClock,
    originNodeId: event.originNodeId,
    ...values,
  }));
  const rankAlreadyDirty = dirtyTimelineRankCheckpoints.get(manager)?.has(event.conversationId) === true;
  if (rankState?.hasLater === 1 || rankAlreadyDirty) {
    markTimelineRankCheckpointsDirty(manager, event.conversationId);
  } else if ((rankState?.totalEntries ?? 0) % TIMELINE_RANK_CHECKPOINT_INTERVAL === 0) {
    await manager.getRepository(ConversationTimelineRankCheckpointEntity).insert({
      conversationId: event.conversationId,
      entryIndex: rankState?.totalEntries ?? 0,
      turnIndex: rankState?.totalTurns ?? 0,
      timestamp: event.timestamp,
      lamportClock: event.lamportClock,
      originNodeId: event.originNodeId,
      messageId: event.eventId,
    });
  }
}

export async function projectTimelineMessage(
  manager: EntityManager,
  event: Extract<ConversationEvent, { kind: 'message' }>,
): Promise<void> {
  const message = event.message;
  if (message.hidden === true || await isTurnTombstoned(manager, event.conversationId, message.turnId)) return;
  const userRoot = message.role === 'user' && message.messageId === message.turnId;
  const navigable = message.role === 'user' || message.role === 'assistant' || message.role === 'agent';
  if (message.role === 'user' || message.role === 'assistant' || message.role === 'agent') {
    const actor = timelineMessageActor(message.role, event.originNodeId, message.metadata);
    await insertTimelineEntry(manager, event, {
      kind: 'message',
      turnId: message.turnId,
      role: message.role,
      ...actor,
      preview: storedTimelinePreview(message.content),
    });
    const turnIndex = await resolveTimelineMessageTurnIndex(manager, event.conversationId, message.turnId);
    if (turnIndex !== undefined) {
      await refreshOrphanTimelineMessageTurnIndices(manager, event.conversationId, message.turnId, turnIndex);
    }
  }
  await updateTimelineState(manager, event.conversationId, {
    messages: 1,
    turns: userRoot ? 1 : 0,
    entries: navigable ? 1 : 0,
  });
  await refreshTimelineLastMessage(manager, event.conversationId);
}

export async function projectTimelineCompaction(
  manager: EntityManager,
  event: Extract<ConversationEvent, { kind: 'compaction'; mode: 'summary' }>,
): Promise<void> {
  if (await isTurnTombstoned(manager, event.conversationId, event.summary.turnId)) return;
  const summaryPreview = storedTimelinePreview(event.summary.content);
  if (summaryPreview.length === 0) return;
  const turnIndex = await countTimelineRootsBefore(manager, event);
  await insertTimelineEntry(manager, event, {
    kind: 'compaction',
    turnId: event.summary.turnId,
    turnIndex,
    summaryPreview,
    compactedMessageCount: event.boundary.droppedMessageCount,
    compactedTurnCount: event.boundary.droppedTurnCount,
  });
  await updateTimelineState(manager, event.conversationId, { entries: 1 });
}

export async function projectTimelineTombstone(
  manager: EntityManager,
  conversationId: string,
  turnId: string,
): Promise<void> {
  const [messageCount] = await manager.query<Array<{ count: number }>>(
    `SELECT COUNT(*) AS count FROM agent_instance_messages
     WHERE conversationId = ? AND turnId = ? AND hidden = 0
       AND isContextCompaction = 0`,
    [conversationId, turnId],
  );
  const entries = await manager.getRepository(ConversationTimelineEntryEntity).find({
    where: { conversationId, turnId },
  });
  for (const entry of entries) {
    await manager.getRepository(ConversationTimelineEntryEntity).delete({ conversationId, messageId: entry.messageId });
  }
  const removedMessages = messageCount?.count ?? 0;
  const removedTurns = entries.filter(entry => entry.kind === 'message' && entry.role === 'user' && entry.messageId === entry.turnId).length;
  if (removedMessages > 0 || entries.length > 0) {
    if (entries.length > 0) markTimelineRankCheckpointsDirty(manager, conversationId);
    await updateTimelineState(manager, conversationId, {
      messages: -removedMessages,
      turns: -removedTurns,
      entries: -entries.length,
    });
    await refreshTimelineLastMessage(manager, conversationId);
  }
}

/** Set-based rebuild used after a large remote merge; no per-row ordinal shifts or preview N+1. */
export async function rebuildConversationTimelineProjection(
  manager: EntityManager,
  conversationId: string,
): Promise<void> {
  registerTimelinePreviewSqlFunction(manager);
  await manager.getRepository(ConversationTimelineEntryEntity).delete({ conversationId });
  await manager.query(
    `INSERT INTO conversation_timeline_entries (
       conversationId, messageId, cursor, kind, turnId,
       timestamp, lamportClock, originNodeId, turnIndex,
       role, actorId, actorLabel, preview
     )
     SELECT message.conversationId, message.messageId, message.messageId,
       'message', message.turnId, message.timestamp, message.lamportClock,
       message.originNodeId, NULL, message.role,
       memeloop_timeline_preview(COALESCE(
         NULLIF(json_extract(message.meta_data, '$.actorId'), ''),
         CASE WHEN message.role = 'user'
           THEN NULLIF(json_extract(message.meta_data, '$.userId'), '')
           ELSE NULLIF(json_extract(message.meta_data, '$.agentId'), '') END,
         message.originNodeId
       ), ?),
       memeloop_timeline_preview(COALESCE(
         NULLIF(json_extract(message.meta_data, '$.actorLabel'), ''),
         CASE WHEN message.role = 'user'
           THEN NULLIF(json_extract(message.meta_data, '$.userName'), '')
           ELSE NULLIF(json_extract(message.meta_data, '$.agentName'), '') END,
         NULLIF(json_extract(message.meta_data, '$.actorId'), ''),
         CASE WHEN message.role = 'user'
           THEN NULLIF(json_extract(message.meta_data, '$.userId'), '')
           ELSE NULLIF(json_extract(message.meta_data, '$.agentId'), '') END,
         message.originNodeId
       ), ?),
       memeloop_timeline_preview(message.content, ?)
     FROM agent_instance_messages AS message
     WHERE message.conversationId = ?
       AND message.role IN ('user', 'assistant', 'agent')
       AND message.hidden = 0 AND message.isContextCompaction = 0
       AND ${visibleMessagePredicate('message')}`,
    [TIMELINE_ACTOR_LENGTH, TIMELINE_ACTOR_LENGTH, TIMELINE_STORED_PREVIEW_LENGTH, conversationId],
  );
  await manager.query(
    `INSERT INTO conversation_timeline_entries (
       conversationId, messageId, cursor, kind, turnId,
       timestamp, lamportClock, originNodeId, summaryPreview,
       compactedMessageCount, compactedTurnCount
     )
     SELECT event.conversationId, event.eventId, event.eventId, 'compaction', event.turnId,
       event.timestamp, event.lamportClock, event.originNodeId,
       memeloop_timeline_preview(json_extract(event.eventJson, '$.summary.content'), ?),
       CAST(json_extract(event.eventJson, '$.boundary.droppedMessageCount') AS INTEGER),
       CAST(json_extract(event.eventJson, '$.boundary.droppedTurnCount') AS INTEGER)
     FROM conversation_events AS event
     WHERE event.conversationId = ? AND event.kind = 'compaction'
       AND json_extract(event.eventJson, '$.mode') = 'summary'
       AND memeloop_timeline_preview(json_extract(event.eventJson, '$.summary.content'), ?) <> ''
       AND NOT EXISTS (
         SELECT 1 FROM conversation_turn_tombstones AS tombstone
         WHERE tombstone.conversationId = event.conversationId
           AND tombstone.turnId = event.turnId
       )`,
    [TIMELINE_STORED_PREVIEW_LENGTH, conversationId, TIMELINE_STORED_PREVIEW_LENGTH],
  );
  await manager.query(
    `INSERT INTO conversation_timeline_states (
       conversationId, revision, totalMessages, totalTurns, totalEntries,
       lastMessagePreview, lastMessageTimestamp
     )
     SELECT ?, 1,
       (SELECT COUNT(*) FROM agent_instance_messages AS message
        WHERE message.conversationId = ? AND message.hidden = 0
          AND message.isContextCompaction = 0
          AND ${visibleMessagePredicate('message')}),
       (SELECT COUNT(*) FROM conversation_timeline_entries
        WHERE conversationId = ? AND kind = 'message'
          AND role = 'user' AND messageId = turnId),
       (SELECT COUNT(*) FROM conversation_timeline_entries WHERE conversationId = ?),
       COALESCE((
         SELECT memeloop_timeline_preview(message.content, 240)
         FROM agent_instance_messages AS message
         WHERE message.conversationId = ? AND message.hidden = 0
           AND message.isContextCompaction = 0
           AND ${visibleMessagePredicate('message')}
         ORDER BY message.timestamp DESC, message.lamportClock DESC,
           message.originNodeId DESC, message.messageId DESC LIMIT 1
       ), ''),
       COALESCE((
         SELECT message.timestamp
         FROM agent_instance_messages AS message
         WHERE message.conversationId = ? AND message.hidden = 0
           AND message.isContextCompaction = 0
           AND ${visibleMessagePredicate('message')}
         ORDER BY message.timestamp DESC, message.lamportClock DESC,
           message.originNodeId DESC, message.messageId DESC LIMIT 1
       ), 0)
     ON CONFLICT(conversationId) DO UPDATE SET
       revision = conversation_timeline_states.revision + 1,
       totalMessages = excluded.totalMessages,
       totalTurns = excluded.totalTurns,
       totalEntries = excluded.totalEntries,
       lastMessagePreview = excluded.lastMessagePreview,
       lastMessageTimestamp = excluded.lastMessageTimestamp`,
    [
      conversationId,
      conversationId,
      conversationId,
      conversationId,
      conversationId,
      conversationId,
    ],
  );
  await rebuildTimelineRankCheckpoints(manager, conversationId);
}
