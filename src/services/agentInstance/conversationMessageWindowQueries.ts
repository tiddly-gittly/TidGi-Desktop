/** Revision-consistent message windows around message or timeline anchors. */
import type { ConversationMessageListProjection, ConversationMessageWindowResult, GetConversationMessageWindowAroundOptions } from 'memeloop';
import { messageCursor } from 'memeloop';
import { DataSource } from 'typeorm';
import { messageProjectionFromSqlRow, messageSqlColumns, RawMessageSqlRow } from './conversationMessageQueries';
import { canonicalJson, eventStoreError, timelinePreview, visibleMessagePredicate } from './conversationStorageUtilities';

interface MessageWindowSqlRow extends RawMessageSqlRow {
  revision: number;
  focusKind: 'message' | 'compaction' | null;
  focusEntryId: string | null;
  focusCursor: string | null;
  focusTurnId: string | null;
  focusTimestamp: number | null;
  focusLamportClock: number | null;
  focusOriginNodeId: string | null;
  focusSummaryPreview: string | null;
  focusCompactedMessageCount: number | null;
  focusCompactedTurnCount: number | null;
  focusEntryIndex: number | null;
  focusTurnIndex: number | null;
  nearestPosition: 'before' | 'after' | 'none' | null;
  nearestMessageId: string | null;
  nearestTurnId: string | null;
  hasMoreBefore: number;
  hasMoreAfter: number;
}

function validateMessageWindowOptions(options: GetConversationMessageWindowAroundOptions): void {
  if (
    !Number.isSafeInteger(options.maxMessages) || options.maxMessages < 1 || options.maxMessages > 80 ||
    !Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1 || options.maxBytes > 4 * 1024 * 1024 ||
    typeof options.expectedRevision !== 'string' || options.expectedRevision.length === 0 ||
    options.expectedRevision.length > 2048
  ) throw eventStoreError('VALIDATION_ERROR', 'invalid conversation message window bounds');
  const focus = options.focus;
  if (focus.kind === 'message') {
    if (
      !focus.messageId || Buffer.byteLength(focus.messageId, 'utf8') > 512 ||
      !focus.turnId || Buffer.byteLength(focus.turnId, 'utf8') > 512 ||
      (focus.cursor?.length ?? 0) > 2048
    ) {
      throw eventStoreError('VALIDATION_ERROR', 'invalid conversation message window focus');
    }
  } else if (
    !focus.entryId || Buffer.byteLength(focus.entryId, 'utf8') > 512 ||
    !focus.cursor || focus.cursor.length > 2048
  ) throw eventStoreError('VALIDATION_ERROR', 'invalid conversation message window focus');
}

/**
 * Resolve a timeline focus and select its bounded message window in one SQLite
 * statement inside one read transaction. No timeline/message page composition
 * can observe different projection revisions.
 */
export async function getMessageWindowAround(
  dataSource: DataSource,
  conversationId: string,
  options: GetConversationMessageWindowAroundOptions,
): Promise<ConversationMessageWindowResult> {
  validateMessageWindowOptions(options);
  const focusPredicate = options.focus.kind === 'message'
    ? `entry.kind = 'message' AND entry.messageId = ? AND entry.turnId = ? ${options.focus.cursor ? 'AND entry.cursor = ?' : ''}`
    : 'entry.messageId = ? AND entry.cursor = ?';
  const focusParameters = options.focus.kind === 'message'
    ? [options.focus.messageId, options.focus.turnId, ...(options.focus.cursor ? [options.focus.cursor] : [])]
    : [options.focus.entryId, options.focus.cursor];
  const rows = await dataSource.query<MessageWindowSqlRow[]>(
    `WITH state AS (
         SELECT COALESCE((
           SELECT revision FROM conversation_timeline_states WHERE conversationId = ?
         ), 0) AS revision
       ), requested AS (
         SELECT entry.* FROM conversation_timeline_entries AS entry, state
         WHERE entry.conversationId = ? AND ${focusPredicate}
           AND CAST(state.revision AS TEXT) = ?
         ORDER BY entry.timestamp, entry.lamportClock, entry.originNodeId, entry.messageId
         LIMIT 1
       ), before_message AS (
         SELECT candidate.* FROM conversation_timeline_entries AS candidate, requested
         WHERE requested.kind = 'compaction' AND candidate.conversationId = requested.conversationId
           AND candidate.kind = 'message'
           AND (candidate.timestamp, candidate.lamportClock, candidate.originNodeId, candidate.messageId) <
             (requested.timestamp, requested.lamportClock, requested.originNodeId, requested.messageId)
         ORDER BY candidate.timestamp DESC, candidate.lamportClock DESC,
           candidate.originNodeId DESC, candidate.messageId DESC LIMIT 1
       ), after_message AS (
         SELECT candidate.* FROM conversation_timeline_entries AS candidate, requested
         WHERE requested.kind = 'compaction' AND candidate.conversationId = requested.conversationId
           AND candidate.kind = 'message'
           AND (candidate.timestamp, candidate.lamportClock, candidate.originNodeId, candidate.messageId) >
             (requested.timestamp, requested.lamportClock, requested.originNodeId, requested.messageId)
         ORDER BY candidate.timestamp, candidate.lamportClock,
           candidate.originNodeId, candidate.messageId LIMIT 1
       ), rank_targets AS (
         SELECT 'requested' AS target, requested.* FROM requested
         UNION ALL SELECT 'before', before_message.* FROM before_message
         UNION ALL SELECT 'after', after_message.* FROM after_message
       ), target_checkpoints AS (
         SELECT target.target, target.messageId AS targetMessageId,
           target.timestamp AS targetTimestamp, target.lamportClock AS targetLamportClock,
           target.originNodeId AS targetOriginNodeId,
           checkpoint.entryIndex AS checkpointEntryIndex,
           checkpoint.turnIndex AS checkpointTurnIndex,
           checkpoint.timestamp AS checkpointTimestamp,
           checkpoint.lamportClock AS checkpointLamportClock,
           checkpoint.originNodeId AS checkpointOriginNodeId,
           checkpoint.messageId AS checkpointMessageId
         FROM rank_targets AS target
         JOIN conversation_timeline_rank_checkpoints AS checkpoint
           ON checkpoint.conversationId = target.conversationId
          AND checkpoint.entryIndex = (
            SELECT MAX(candidate.entryIndex)
            FROM conversation_timeline_rank_checkpoints AS candidate
            WHERE candidate.conversationId = target.conversationId AND
              (candidate.timestamp, candidate.lamportClock,
               candidate.originNodeId, candidate.messageId) <=
              (target.timestamp, target.lamportClock, target.originNodeId, target.messageId)
          )
       ), target_span AS (
         SELECT checkpoint.target, checkpoint.targetMessageId, entry.messageId,
           checkpoint.checkpointEntryIndex + ROW_NUMBER() OVER (
             PARTITION BY checkpoint.target
             ORDER BY entry.timestamp, entry.lamportClock,
               entry.originNodeId, entry.messageId
           ) - 1 AS entryIndex,
           entry.turnIndex AS turnIndex
         FROM target_checkpoints AS checkpoint
         JOIN conversation_timeline_entries AS entry
           ON entry.conversationId = ? AND
             (entry.timestamp, entry.lamportClock, entry.originNodeId, entry.messageId) >=
             (checkpoint.checkpointTimestamp, checkpoint.checkpointLamportClock,
              checkpoint.checkpointOriginNodeId, checkpoint.checkpointMessageId) AND
             (entry.timestamp, entry.lamportClock, entry.originNodeId, entry.messageId) <=
             (checkpoint.targetTimestamp, checkpoint.targetLamportClock,
              checkpoint.targetOriginNodeId, checkpoint.targetMessageId)
       ), target_ranks AS (
         SELECT target, entryIndex, turnIndex FROM target_span
         WHERE messageId = targetMessageId
       ), focus AS (
         SELECT requested.*,
           CASE WHEN requested.kind = 'message' THEN requested.messageId
             WHEN before_message.messageId IS NULL THEN after_message.messageId
             WHEN after_message.messageId IS NULL THEN before_message.messageId
             WHEN after_rank.entryIndex - requested_rank.entryIndex <=
               requested_rank.entryIndex - before_rank.entryIndex
             THEN after_message.messageId ELSE before_message.messageId END AS anchorMessageId,
           CASE WHEN requested.kind = 'message' THEN requested.turnId
             WHEN before_message.turnId IS NULL THEN after_message.turnId
             WHEN after_message.turnId IS NULL THEN before_message.turnId
             WHEN after_rank.entryIndex - requested_rank.entryIndex <=
               requested_rank.entryIndex - before_rank.entryIndex
             THEN after_message.turnId ELSE before_message.turnId END AS anchorTurnId,
           CASE WHEN requested.kind = 'message' THEN NULL
             WHEN before_message.messageId IS NULL AND after_message.messageId IS NULL THEN 'none'
             WHEN before_message.messageId IS NULL THEN 'after'
             WHEN after_message.messageId IS NULL THEN 'before'
             WHEN after_rank.entryIndex - requested_rank.entryIndex <=
               requested_rank.entryIndex - before_rank.entryIndex
             THEN 'after' ELSE 'before' END AS nearestPosition,
           CASE WHEN requested.kind = 'message' THEN NULL
             WHEN before_message.messageId IS NULL THEN after_message.messageId
             WHEN after_message.messageId IS NULL THEN before_message.messageId
             WHEN after_rank.entryIndex - requested_rank.entryIndex <=
               requested_rank.entryIndex - before_rank.entryIndex
             THEN after_message.messageId ELSE before_message.messageId END AS nearestMessageId,
           CASE WHEN requested.kind = 'message' THEN NULL
             WHEN before_message.turnId IS NULL THEN after_message.turnId
             WHEN after_message.turnId IS NULL THEN before_message.turnId
             WHEN after_rank.entryIndex - requested_rank.entryIndex <=
               requested_rank.entryIndex - before_rank.entryIndex
             THEN after_message.turnId ELSE before_message.turnId END AS nearestTurnId,
           requested_rank.entryIndex AS focusEntryIndex,
           requested_rank.turnIndex AS focusTurnIndex
         FROM requested LEFT JOIN before_message ON 1 = 1 LEFT JOIN after_message ON 1 = 1
         LEFT JOIN target_ranks AS requested_rank ON requested_rank.target = 'requested'
         LEFT JOIN target_ranks AS before_rank ON before_rank.target = 'before'
         LEFT JOIN target_ranks AS after_rank ON after_rank.target = 'after'
       ), anchor AS (
         SELECT message.timestamp, message.lamportClock, message.originNodeId, message.messageId
         FROM agent_instance_messages AS message, focus
         WHERE message.conversationId = ? AND message.messageId = focus.anchorMessageId
           AND ${visibleMessagePredicate('message')}
         ORDER BY message.timestamp, message.lamportClock, message.originNodeId, message.messageId LIMIT 1
       ), before_messages AS (
         SELECT message.messageId, message.conversationId, message.originNodeId,
           message.originSequence, message.turnId, message.timestamp,
           message.lamportClock, message.role
         FROM agent_instance_messages AS message, anchor
         WHERE message.conversationId = ? AND ${visibleMessagePredicate('message')}
           AND (message.timestamp, message.lamportClock, message.originNodeId, message.messageId) <=
             (anchor.timestamp, anchor.lamportClock, anchor.originNodeId, anchor.messageId)
         ORDER BY message.timestamp DESC, message.lamportClock DESC,
           message.originNodeId DESC, message.messageId DESC LIMIT ?
       ), after_messages AS (
         SELECT message.messageId, message.conversationId, message.originNodeId,
           message.originSequence, message.turnId, message.timestamp,
           message.lamportClock, message.role
         FROM agent_instance_messages AS message, anchor
         WHERE message.conversationId = ? AND ${visibleMessagePredicate('message')}
           AND (message.timestamp, message.lamportClock, message.originNodeId, message.messageId) >
             (anchor.timestamp, anchor.lamportClock, anchor.originNodeId, anchor.messageId)
         ORDER BY message.timestamp, message.lamportClock,
           message.originNodeId, message.messageId LIMIT ?
       ), candidates AS (
         SELECT * FROM before_messages UNION ALL SELECT * FROM after_messages
       ), ranked AS (
         SELECT candidates.*,
           ROW_NUMBER() OVER (ORDER BY candidates.timestamp, candidates.lamportClock,
             candidates.originNodeId, candidates.messageId) - 1 AS candidateIndex,
           COUNT(*) OVER () AS candidateCount,
           SUM(CASE WHEN (candidates.timestamp, candidates.lamportClock,
             candidates.originNodeId, candidates.messageId) <
             (anchor.timestamp, anchor.lamportClock, anchor.originNodeId, anchor.messageId)
             THEN 1 ELSE 0 END) OVER () AS anchorIndex
         FROM candidates, anchor
       ), bounds AS (
         SELECT MAX(0, MIN(
           anchorIndex - CAST(? / 2 AS INTEGER), MAX(0, candidateCount - ?)
         )) AS pageStart
         FROM ranked LIMIT 1
       ), page AS (
         SELECT ranked.* FROM ranked, bounds
         WHERE ranked.candidateIndex >= bounds.pageStart
           AND ranked.candidateIndex < bounds.pageStart + ?
       ), first_page AS (
         SELECT * FROM page ORDER BY timestamp, lamportClock, originNodeId, messageId LIMIT 1
       ), last_page AS (
         SELECT * FROM page ORDER BY timestamp DESC, lamportClock DESC, originNodeId DESC, messageId DESC LIMIT 1
       )
       SELECT state.revision,
         focus.kind AS focusKind, focus.messageId AS focusEntryId,
         focus.cursor AS focusCursor, focus.turnId AS focusTurnId,
         focus.timestamp AS focusTimestamp, focus.lamportClock AS focusLamportClock,
         focus.originNodeId AS focusOriginNodeId, focus.summaryPreview AS focusSummaryPreview,
         focus.compactedMessageCount AS focusCompactedMessageCount,
         focus.compactedTurnCount AS focusCompactedTurnCount,
         focus.focusEntryIndex, focus.focusTurnIndex,
         focus.nearestPosition, focus.nearestMessageId, focus.nearestTurnId,
         ${messageSqlColumns('page', 'detail')},
         CASE WHEN first_page.messageId IS NULL THEN 0 ELSE EXISTS (
           SELECT 1 FROM agent_instance_messages AS older
           WHERE older.conversationId = ? AND ${visibleMessagePredicate('older')} AND
             (older.timestamp, older.lamportClock, older.originNodeId, older.messageId) <
               (first_page.timestamp, first_page.lamportClock, first_page.originNodeId, first_page.messageId)
         ) END AS hasMoreBefore,
         CASE WHEN last_page.messageId IS NULL THEN 0 ELSE EXISTS (
           SELECT 1 FROM agent_instance_messages AS newer
           WHERE newer.conversationId = ? AND ${visibleMessagePredicate('newer')} AND
             (newer.timestamp, newer.lamportClock, newer.originNodeId, newer.messageId) >
               (last_page.timestamp, last_page.lamportClock, last_page.originNodeId, last_page.messageId)
         ) END AS hasMoreAfter
       FROM state LEFT JOIN focus ON 1 = 1 LEFT JOIN page ON 1 = 1
       LEFT JOIN conversation_message_details AS detail
         ON detail.conversationId = page.conversationId
           AND detail.messageId = page.messageId
       LEFT JOIN first_page ON 1 = 1 LEFT JOIN last_page ON 1 = 1
       ORDER BY page.timestamp, page.lamportClock, page.originNodeId, page.messageId`,
    [
      conversationId,
      conversationId,
      ...focusParameters,
      options.expectedRevision,
      conversationId,
      conversationId,
      conversationId,
      options.maxMessages,
      conversationId,
      options.maxMessages,
      options.maxMessages,
      options.maxMessages,
      options.maxMessages,
      conversationId,
      conversationId,
    ],
  );
  const first = rows[0];
  const revision = String(first?.revision ?? 0);
  const reset = (): ConversationMessageWindowResult => ({ reset: true, conversationId, revision });
  if (!first?.focusKind) {
    const result = reset();
    if (Buffer.byteLength(canonicalJson(result), 'utf8') > options.maxBytes) {
      throw new Error('conversation_message_window_exceeds_byte_budget');
    }
    return result;
  }
  let items = rows.map(messageProjectionFromSqlRow)
    .filter((message): message is ConversationMessageListProjection => message !== undefined);
  let hasMoreBefore = first.hasMoreBefore === 1;
  let hasMoreAfter = first.hasMoreAfter === 1;
  const focus = first.focusKind === 'message'
    ? {
      kind: 'message' as const,
      messageId: first.focusEntryId!,
      turnId: first.focusTurnId!,
      ...(options.focus.kind === 'timeline-entry'
        ? { entryId: first.focusEntryId!, cursor: first.focusCursor! }
        : options.focus.cursor
        ? { cursor: first.focusCursor! }
        : {}),
    }
    : {
      kind: 'compaction' as const,
      entry: {
        kind: 'compaction' as const,
        entryId: first.focusEntryId!,
        conversationId,
        timestamp: first.focusTimestamp!,
        lamportClock: first.focusLamportClock!,
        originNodeId: first.focusOriginNodeId!,
        cursor: first.focusCursor!,
        entryIndex: first.focusEntryIndex!,
        turnIndex: first.focusTurnIndex!,
        summaryPreview: timelinePreview(first.focusSummaryPreview ?? '', 96),
        compactedMessageCount: first.focusCompactedMessageCount ?? 0,
        compactedTurnCount: first.focusCompactedTurnCount ?? 0,
      },
      ...(first.nearestPosition === 'none'
        ? { nearestPosition: 'none' as const }
        : {
          nearestPosition: first.nearestPosition!,
          nearestMessageId: first.nearestMessageId!,
          nearestTurnId: first.nearestTurnId!,
        }),
    };
  const recenterAnchor = first.focusKind === 'message'
    ? { messageId: first.focusEntryId!, turnId: first.focusTurnId! }
    : first.nearestPosition === 'none'
    ? undefined
    : { messageId: first.nearestMessageId!, turnId: first.nearestTurnId! };
  const build = (): ConversationMessageWindowResult => {
    const start = items[0];
    const end = items.at(-1);
    return {
      reset: false,
      conversationId,
      revision,
      focus,
      ...(recenterAnchor === undefined ? {} : { recenterAnchor }),
      items,
      hasMoreBefore,
      hasMoreAfter,
      ...(start ? { startCursor: messageCursor(start) } : {}),
      ...(end ? { endCursor: messageCursor(end) } : {}),
    };
  };
  while (Buffer.byteLength(canonicalJson(build()), 'utf8') > options.maxBytes) {
    if (items.length <= 1) throw new Error('conversation_message_window_focus_exceeds_byte_budget');
    const anchorIndex = items.findIndex(message => message.messageId === recenterAnchor?.messageId);
    const distanceBefore = anchorIndex < 0 ? 0 : anchorIndex;
    const distanceAfter = anchorIndex < 0 ? items.length : items.length - anchorIndex - 1;
    if (distanceAfter > distanceBefore) {
      items = items.slice(0, -1);
      hasMoreAfter = true;
    } else {
      items = items.slice(1);
      hasMoreBefore = true;
    }
  }
  return build();
}
