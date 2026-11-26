/** Indexed timeline paging and sparse-rank seeking. */
import { TIMELINE_RANK_CHECKPOINT_INTERVAL } from '@/constants/agentStorage';
import { AgentInstanceMessageEntity } from '@services/database/schema/agent';
import type { ConversationTimelineEntry, ConversationTimelineMessageEntry, ConversationTimelinePage, GetConversationTimelinePageOptions } from 'memeloop';
import { OrchestrationError } from 'memeloop';
import { Repository } from 'typeorm';
import { canonicalJson, eventStoreError, timelinePreview } from './conversationStorageUtilities';

function validateTimelinePageOptions(options: GetConversationTimelinePageOptions): void {
  if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 64) {
    throw new Error('invalid_conversation_timeline_page_limit');
  }
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1 || options.maxBytes > 1024 * 1024) {
    throw new Error('invalid_conversation_timeline_page_bytes');
  }
  if (
    options.previewLength !== undefined &&
    (!Number.isSafeInteger(options.previewLength) || options.previewLength < 1)
  ) {
    throw new Error('invalid_conversation_timeline_preview_length');
  }
  const positions = [options.aroundEntryIndex, options.beforeCursor, options.afterCursor]
    .filter(value => value !== undefined);
  if (positions.length > 1) throw new Error('conversation_timeline_page_cursor_conflict');
  if (
    options.aroundEntryIndex !== undefined &&
    (!Number.isSafeInteger(options.aroundEntryIndex) || options.aroundEntryIndex < 0)
  ) {
    throw new Error('invalid_conversation_timeline_page_cursor');
  }
  for (const cursor of [options.beforeCursor, options.afterCursor, options.expectedRevision]) {
    if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > 2048)) {
      throw new Error('invalid_conversation_timeline_page_cursor');
    }
  }
  if ((options.beforeCursor !== undefined || options.afterCursor !== undefined) && options.expectedRevision === undefined) {
    throw new Error('conversation_timeline_cursor_requires_revision');
  }
}

interface TimelinePageSqlRow {
  revision: number;
  totalMessages: number;
  totalTurns: number;
  totalEntries: number;
  valid: number;
  emptyHasMoreBefore: number;
  emptyHasMoreAfter: number;
  messageId: string | null;
  cursor: string | null;
  kind: 'message' | 'compaction' | null;
  turnId: string | null;
  timestamp: number | null;
  lamportClock: number | null;
  originNodeId: string | null;
  projectedTurnIndex: number | null;
  role: 'user' | 'assistant' | 'agent' | null;
  actorId: string | null;
  actorLabel: string | null;
  preview: string | null;
  summaryPreview: string | null;
  compactedMessageCount: number | null;
  compactedTurnCount: number | null;
  entryIndex: number | null;
  turnIndex: number | null;
}

/** One revision, cursor validation, bounded rank seek, and page in one read. */
export async function getConversationTimelinePage(
  repository: Repository<AgentInstanceMessageEntity>,
  conversationId: string,
  options: GetConversationTimelinePageOptions,
): Promise<ConversationTimelinePage> {
  validateTimelinePageOptions(options);
  const previewLength = Math.min(options.previewLength ?? 96, 240);
  const cursor = options.beforeCursor ?? options.afterCursor;
  const cursorCte = cursor
    ? `cursor_entry AS (
         SELECT * FROM conversation_timeline_entries
         WHERE conversationId = ? AND cursor = ? LIMIT 1
       ),`
    : `cursor_entry AS (
         SELECT * FROM conversation_timeline_entries WHERE 0
       ),`;
  const cursorRankCtes = cursor
    ? `cursor_checkpoint AS (
         SELECT checkpoint.*
         FROM conversation_timeline_rank_checkpoints AS checkpoint
         CROSS JOIN cursor_entry
         WHERE checkpoint.conversationId = ? AND
           (checkpoint.timestamp, checkpoint.lamportClock,
            checkpoint.originNodeId, checkpoint.messageId) <=
           (cursor_entry.timestamp, cursor_entry.lamportClock,
            cursor_entry.originNodeId, cursor_entry.messageId)
         ORDER BY checkpoint.entryIndex DESC LIMIT 1
       ), cursor_span AS (
         SELECT checkpoint.entryIndex AS checkpointEntryIndex,
           ROW_NUMBER() OVER (
             ORDER BY entry.timestamp, entry.lamportClock,
               entry.originNodeId, entry.messageId
           ) - 1 AS localEntryIndex,
           entry.messageId
         FROM conversation_timeline_entries AS entry
         CROSS JOIN cursor_checkpoint AS checkpoint CROSS JOIN cursor_entry
         WHERE entry.conversationId = ? AND
           (entry.timestamp, entry.lamportClock, entry.originNodeId, entry.messageId) >=
           (checkpoint.timestamp, checkpoint.lamportClock,
            checkpoint.originNodeId, checkpoint.messageId) AND
           (entry.timestamp, entry.lamportClock, entry.originNodeId, entry.messageId) <=
           (cursor_entry.timestamp, cursor_entry.lamportClock,
            cursor_entry.originNodeId, cursor_entry.messageId)
       ), cursor_rank AS (
         SELECT checkpointEntryIndex + localEntryIndex AS entryIndex
         FROM cursor_span CROSS JOIN cursor_entry
         WHERE cursor_span.messageId = cursor_entry.messageId
       ),`
    : `cursor_rank AS (SELECT NULL AS entryIndex WHERE 0),`;
  const targetCte = options.aroundEntryIndex !== undefined
    ? `SELECT
         MAX(0, MIN(? - CAST(? / 2 AS INTEGER), MAX(0, state.totalEntries - ?))) AS startEntryIndex,
         state.totalEntries AS endEntryIndex
       FROM state CROSS JOIN validity`
    : options.beforeCursor !== undefined
    ? `SELECT MAX(0, cursor_rank.entryIndex - ?) AS startEntryIndex,
         cursor_rank.entryIndex AS endEntryIndex
       FROM state CROSS JOIN validity CROSS JOIN cursor_rank`
    : options.afterCursor !== undefined
    ? `SELECT cursor_rank.entryIndex + 1 AS startEntryIndex,
         state.totalEntries AS endEntryIndex
       FROM state CROSS JOIN validity CROSS JOIN cursor_rank`
    : `SELECT MAX(0, state.totalEntries - ?) AS startEntryIndex,
         state.totalEntries AS endEntryIndex
       FROM state CROSS JOIN validity`;
  const parameters: unknown[] = [conversationId];
  if (cursor) parameters.push(conversationId, cursor);
  parameters.push(options.expectedRevision === undefined ? 0 : 1, options.expectedRevision ?? '');
  if (cursor) parameters.push(conversationId, conversationId);
  if (options.aroundEntryIndex !== undefined) {
    parameters.push(options.aroundEntryIndex, options.limit, options.limit);
  } else if (options.beforeCursor !== undefined) {
    parameters.push(options.limit);
  } else if (options.afterCursor === undefined) {
    parameters.push(options.limit);
  }
  parameters.push(
    conversationId,
    conversationId,
    options.limit + TIMELINE_RANK_CHECKPOINT_INTERVAL - 1,
    options.limit,
  );
  const rows = await repository.manager.query<TimelinePageSqlRow[]>(
    `WITH state AS (
       SELECT COALESCE(timeline.revision, 0) AS revision,
         COALESCE(timeline.totalMessages, 0) AS totalMessages,
         COALESCE(timeline.totalTurns, 0) AS totalTurns,
         COALESCE(timeline.totalEntries, 0) AS totalEntries
       FROM (SELECT 1) AS singleton
       LEFT JOIN conversation_timeline_states AS timeline ON timeline.conversationId = ?
     ), ${cursorCte}
     validity AS (
       SELECT CASE WHEN (? = 0 OR CAST(state.revision AS TEXT) = ?)
         AND ${cursor ? 'EXISTS (SELECT 1 FROM cursor_entry)' : '1'}
         THEN 1 ELSE 0 END AS valid FROM state
     ), ${cursorRankCtes}
     target AS (${targetCte}),
     page_checkpoint AS (
       SELECT checkpoint.*
       FROM conversation_timeline_rank_checkpoints AS checkpoint CROSS JOIN target
       WHERE checkpoint.conversationId = ?
         AND checkpoint.entryIndex <= target.startEntryIndex
       ORDER BY checkpoint.entryIndex DESC LIMIT 1
     ), candidate AS (
       SELECT entry.*, checkpoint.entryIndex AS checkpointEntryIndex,
         checkpoint.turnIndex AS checkpointTurnIndex
       FROM conversation_timeline_entries AS entry
       CROSS JOIN page_checkpoint AS checkpoint CROSS JOIN validity
       WHERE validity.valid = 1 AND entry.conversationId = ? AND
         (entry.timestamp, entry.lamportClock, entry.originNodeId, entry.messageId) >=
         (checkpoint.timestamp, checkpoint.lamportClock,
          checkpoint.originNodeId, checkpoint.messageId)
       ORDER BY entry.timestamp, entry.lamportClock, entry.originNodeId, entry.messageId
       LIMIT ?
     ), ranked AS (
       SELECT candidate.*,
         checkpointEntryIndex + ROW_NUMBER() OVER (
           ORDER BY candidate.timestamp, candidate.lamportClock,
             candidate.originNodeId, candidate.messageId
         ) - 1 AS entryIndex
       FROM candidate
     ), selected AS (
       SELECT ranked.* FROM ranked CROSS JOIN target
       WHERE ranked.entryIndex >= target.startEntryIndex
         AND ranked.entryIndex < target.endEntryIndex
       ORDER BY ranked.entryIndex LIMIT ?
     )
     SELECT state.revision, state.totalMessages, state.totalTurns, state.totalEntries,
       validity.valid,
       CASE WHEN selected.messageId IS NULL THEN ${options.afterCursor === undefined ? 0 : 'state.totalEntries > 0'}
         ELSE (SELECT MIN(entryIndex) FROM selected) > 0 END AS emptyHasMoreBefore,
       CASE WHEN selected.messageId IS NULL THEN ${options.beforeCursor === undefined ? 0 : 'state.totalEntries > 0'}
         ELSE (SELECT MAX(entryIndex) FROM selected) + 1 < state.totalEntries END AS emptyHasMoreAfter,
       selected.messageId, selected.cursor, selected.kind, selected.turnId,
       selected.timestamp, selected.lamportClock, selected.originNodeId,
       selected.turnIndex AS projectedTurnIndex,
       selected.role, selected.actorId, selected.actorLabel, selected.preview,
       selected.summaryPreview,
       selected.compactedMessageCount, selected.compactedTurnCount,
       selected.entryIndex, selected.turnIndex
     FROM state CROSS JOIN validity LEFT JOIN selected ON 1 = 1
     ORDER BY selected.entryIndex`,
    parameters,
  );
  const firstRow = rows[0];
  const revision = String(firstRow?.revision ?? 0);
  if (firstRow?.valid !== 1) {
    const reset = { reset: true as const, revision };
    if (Buffer.byteLength(canonicalJson(reset), 'utf8') > options.maxBytes) {
      throw new Error('conversation_timeline_page_exceeds_byte_budget');
    }
    return reset;
  }
  const totalMessages = firstRow.totalMessages;
  const totalTurns = firstRow.totalTurns;
  const totalEntries = firstRow.totalEntries;
  if (totalEntries > 0 && firstRow.messageId === null && cursor === undefined) {
    throw eventStoreError('CONFLICT', 'conversation timeline rank checkpoints are missing');
  }
  const emptyHasMoreBefore = firstRow.emptyHasMoreBefore === 1;
  const emptyHasMoreAfter = firstRow.emptyHasMoreAfter === 1;
  let items = rows.flatMap((row): ConversationTimelineEntry[] => {
    if (
      row.messageId === null || row.cursor === null || row.kind === null || row.turnId === null ||
      row.timestamp === null || row.lamportClock === null || row.originNodeId === null ||
      row.entryIndex === null
    ) return [];
    if (row.kind === 'message') {
      if (row.role === null || row.actorId === null || row.actorLabel === null) return [];
      const entry: ConversationTimelineMessageEntry = {
        kind: 'message',
        entryId: row.messageId,
        messageId: row.messageId,
        conversationId,
        timestamp: row.timestamp,
        lamportClock: row.lamportClock,
        originNodeId: row.originNodeId,
        cursor: row.cursor,
        entryIndex: row.entryIndex,
        turnId: row.turnId,
        ...(row.projectedTurnIndex === null ? {} : { turnIndex: row.projectedTurnIndex }),
        role: row.role,
        actorId: timelinePreview(row.actorId, 160) || row.originNodeId,
        actorLabel: timelinePreview(row.actorLabel, 160) || row.actorId,
        preview: timelinePreview(row.preview ?? '', previewLength),
      };
      while (Buffer.byteLength(canonicalJson(entry), 'utf8') > 1024 && entry.preview.length > 1) {
        entry.preview = timelinePreview(entry.preview, Math.max(1, Math.floor(entry.preview.length / 2)));
      }
      if (Buffer.byteLength(canonicalJson(entry), 'utf8') > 1024) {
        throw eventStoreError('CONFLICT', `timeline message ${entry.messageId} exceeds projection budget`);
      }
      return [entry];
    }
    return [
      {
        kind: 'compaction' as const,
        entryId: row.messageId,
        conversationId,
        timestamp: row.timestamp,
        lamportClock: row.lamportClock,
        originNodeId: row.originNodeId,
        cursor: row.cursor,
        entryIndex: row.entryIndex,
        turnIndex: row.projectedTurnIndex ?? 0,
        summaryPreview: timelinePreview(row.summaryPreview ?? '', previewLength),
        compactedMessageCount: row.compactedMessageCount ?? 0,
        compactedTurnCount: row.compactedTurnCount ?? 0,
      },
    ];
  });
  const buildPage = () => {
    const first = items[0];
    const last = items.at(-1);
    return {
      reset: false as const,
      items,
      revision,
      totalMessages,
      totalTurns,
      totalEntries,
      hasMoreBefore: first ? first.entryIndex > 0 : emptyHasMoreBefore,
      hasMoreAfter: last ? last.entryIndex + 1 < totalEntries : emptyHasMoreAfter,
      ...(first ? { startEntryIndex: first.entryIndex, startCursor: first.cursor } : {}),
      ...(last ? { endEntryIndex: last.entryIndex, endCursor: last.cursor } : {}),
    };
  };
  while (Buffer.byteLength(canonicalJson(buildPage()), 'utf8') > options.maxBytes) {
    if (items.length === 0) {
      throw new OrchestrationError({
        code: 'EXHAUSTED',
        message: 'timeline response metadata exceeds maxBytes',
        retryable: false,
      });
    }
    if (options.afterCursor !== undefined) {
      items = items.slice(0, -1);
    } else if (options.aroundEntryIndex !== undefined && items.length > 1) {
      const firstDistance = Math.abs(items[0].entryIndex - options.aroundEntryIndex);
      const lastDistance = Math.abs(items.at(-1)!.entryIndex - options.aroundEntryIndex);
      items = firstDistance > lastDistance ? items.slice(1) : items.slice(0, -1);
    } else {
      items = items.slice(1);
    }
  }
  return buildPage();
}
