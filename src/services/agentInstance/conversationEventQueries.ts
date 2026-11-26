/** Durable event synchronization, attachment authorization, and compaction queries. */
import { MAX_EVENT_PAGE_SIZE, MAX_EVENT_RANGES } from '@/constants/agentStorage';
import type {
  AttachmentReference,
  ChatMessage,
  CompactionCandidatePage,
  ConversationEvent,
  ConversationEventPage,
  GetCompactionCandidatePageOptions,
  GetConversationEventPageOptions,
  GetRetainedCompactionControlsOptions,
  MessageVersionFrontier,
  MessageVersionFrontierCursor,
  MessageVersionFrontierPage,
  RetainedCompactionControlPage,
} from 'memeloop';
import { conversationEventToMessage, OrchestrationError } from 'memeloop';
import { DataSource } from 'typeorm';
import { canonicalJson, eventStoreError, parseStoredConversationEvent } from './conversationStorageUtilities';

/**
 * Authorize a blob read only when an immutable event in this conversation
 * actually references the hash in the canonical attachment-reference table.
 */
export async function conversationReferencesAttachment(
  dataSource: DataSource,
  conversationId: string,
  contentHash: string,
  expectedReference?: AttachmentReference,
): Promise<boolean> {
  if (!/^sha256:[0-9a-f]{64}$/.test(contentHash)) return false;
  if (expectedReference && expectedReference.contentHash !== contentHash) return false;
  const [row] = await dataSource.query<Array<{ found: number }>>(
    `SELECT EXISTS (
       SELECT 1 FROM conversation_attachment_references
       WHERE conversationId = ? AND contentHash = ?
         ${expectedReference ? 'AND filename = ? AND mimeType = ? AND size = ?' : ''}
       LIMIT 1
     ) AS found`,
    expectedReference
      ? [conversationId, contentHash, expectedReference.filename, expectedReference.mimeType, expectedReference.size]
      : [conversationId, contentHash],
  );
  return row?.found === 1;
}

export async function getConversationEventPage(
  dataSource: DataSource,
  conversationId: string,
  options: GetConversationEventPageOptions,
): Promise<ConversationEventPage> {
  const limit = Math.max(1, Math.min(Number.isSafeInteger(options.limit) ? options.limit : MAX_EVENT_PAGE_SIZE, MAX_EVENT_PAGE_SIZE));
  if (options.ranges?.length === 0) return { items: [], hasMoreBefore: false, hasMoreAfter: false };
  if ((options.ranges?.length ?? 0) > MAX_EVENT_RANGES) {
    throw eventStoreError('VALIDATION_ERROR', `event page supports at most ${MAX_EVENT_RANGES} origin ranges`);
  }
  const forward = options.direction !== 'backward';
  const relation = forward ? '>' : '<';
  const direction = forward ? 'ASC' : 'DESC';
  const conditions = ['conversationId = ?'];
  const parameters: Array<number | string> = [conversationId];
  if (options.ranges) {
    conditions.push(`(${options.ranges.map(() => '(originNodeId = ? AND originSequence > ? AND originSequence <= ?)').join(' OR ')})`);
    for (const range of options.ranges) parameters.push(range.originNodeId, range.fromExclusive, range.toInclusive);
  }
  if (options.after) {
    conditions.push(`(originNodeId ${relation} ? OR
      (originNodeId = ? AND originSequence ${relation} ?) OR
      (originNodeId = ? AND originSequence = ? AND eventId ${relation} ?))`);
    parameters.push(
      options.after.originNodeId,
      options.after.originNodeId,
      options.after.originSequence,
      options.after.originNodeId,
      options.after.originSequence,
      options.after.eventId,
    );
  }
  const rows = await dataSource.query<Array<{ eventJson: string }>>(
    `SELECT eventJson FROM conversation_events
     WHERE ${conditions.join(' AND ')}
     ORDER BY originNodeId ${direction}, originSequence ${direction}, eventId ${direction}
     LIMIT ?`,
    [...parameters, limit + 1],
  );
  const hasExtra = rows.length > limit;
  if (hasExtra) rows.pop();
  const ordered = forward ? rows : rows.reverse();
  const items = ordered.map(row => parseStoredConversationEvent(row.eventJson));
  const cursor = (event: ConversationEvent) => ({
    originNodeId: event.originNodeId,
    originSequence: event.originSequence,
    eventId: event.eventId,
  });
  return {
    items,
    hasMoreBefore: forward ? options.after !== undefined : hasExtra,
    hasMoreAfter: forward ? hasExtra : options.after !== undefined,
    ...(items[0] ? { startCursor: cursor(items[0]) } : {}),
    ...(items.at(-1) ? { endCursor: cursor(items.at(-1)!) } : {}),
  };
}

export async function getEventVersionFrontiers(
  dataSource: DataSource,
  conversationIds?: readonly string[],
): Promise<MessageVersionFrontier[]> {
  const scopedIds = conversationIds ? [...new Set(conversationIds)] : undefined;
  if (scopedIds?.length === 0) return [];
  const scope = scopedIds ? `AND conversationId IN (${scopedIds.map(() => '?').join(', ')})` : '';
  return dataSource.query<MessageVersionFrontier[]>(
    `SELECT conversationId, originNodeId,
       contiguousFrontier AS maxContiguousOriginSequence
     FROM conversation_event_sequences
     WHERE contiguousFrontier > 0 ${scope}
     ORDER BY conversationId, originNodeId`,
    scopedIds ?? [],
  );
}

export async function getEventVersionFrontierPage(
  dataSource: DataSource,
  options: {
    limit: number;
    after?: MessageVersionFrontierCursor;
    conversationIds?: readonly string[];
  },
): Promise<MessageVersionFrontierPage> {
  const limit = Math.max(1, Math.min(Number.isSafeInteger(options.limit) ? options.limit : 256, 256));
  const scopedIds = options.conversationIds ? [...new Set(options.conversationIds)] : undefined;
  if (scopedIds?.length === 0) return { items: [] };
  const conditions = ['contiguousFrontier > 0'];
  const parameters: Array<string | number> = [];
  if (scopedIds) {
    if (scopedIds.length > 256) {
      throw eventStoreError('VALIDATION_ERROR', 'frontier page accepts at most 256 conversation IDs');
    }
    conditions.push(`conversationId IN (${scopedIds.map(() => '?').join(', ')})`);
    parameters.push(...scopedIds);
  }
  if (options.after) {
    conditions.push('(conversationId, originNodeId) > (?, ?)');
    parameters.push(options.after.conversationId, options.after.originNodeId);
  }
  const rows = await dataSource.query<MessageVersionFrontier[]>(
    `SELECT conversationId, originNodeId,
       contiguousFrontier AS maxContiguousOriginSequence
     FROM conversation_event_sequences
     WHERE ${conditions.join(' AND ')}
     ORDER BY conversationId, originNodeId
     LIMIT ?`,
    [...parameters, limit + 1],
  );
  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();
  const last = rows.at(-1);
  return {
    items: rows,
    ...(hasMore && last
      ? { nextCursor: { conversationId: last.conversationId, originNodeId: last.originNodeId } }
      : {}),
  };
}

export async function getEventVersionFrontiersForKeys(
  dataSource: DataSource,
  keys: readonly MessageVersionFrontierCursor[],
): Promise<MessageVersionFrontier[]> {
  const unique = [...new Map(keys.map(key => [canonicalJson([key.conversationId, key.originNodeId]), key])).values()];
  if (unique.length === 0) return [];
  if (unique.length > 256) {
    throw eventStoreError('VALIDATION_ERROR', 'frontier point lookup accepts at most 256 keys');
  }
  const parameters = unique.flatMap(key => [key.conversationId, key.originNodeId]);
  return dataSource.query<MessageVersionFrontier[]>(
    `SELECT conversationId, originNodeId,
       contiguousFrontier AS maxContiguousOriginSequence
     FROM conversation_event_sequences
     WHERE contiguousFrontier > 0 AND (${unique.map(() => '(conversationId = ? AND originNodeId = ?)').join(' OR ')})
     ORDER BY conversationId, originNodeId`,
    parameters,
  );
}

export async function getCompactionCandidatePage(
  dataSource: DataSource,
  conversationId: string,
  options: GetCompactionCandidatePageOptions,
): Promise<CompactionCandidatePage> {
  if (
    !Number.isSafeInteger(options.maxMessages) || options.maxMessages < 1 || options.maxMessages > 80 ||
    !Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1 || options.maxBytes > 15 * 1024 * 1024
  ) {
    throw eventStoreError('VALIDATION_ERROR', 'invalid compaction candidate page bounds');
  }
  for (const [originNodeId, sequence] of Object.entries(options.afterCoveredVersion)) {
    if (!originNodeId || !Number.isSafeInteger(sequence) || sequence <= 0) {
      throw eventStoreError('VALIDATION_ERROR', 'afterCoveredVersion must contain positive safe integer frontiers');
    }
  }
  const coveredJson = canonicalJson(options.afterCoveredVersion);
  const cutoff = options.beforeDisplayCursor;
  const cutoffPredicate = cutoff
    ? `AND NOT EXISTS (
         SELECT 1
         FROM conversation_events AS blocking
         LEFT JOIN conversation_turn_tombstones AS blocking_tombstone
           ON blocking_tombstone.conversationId = blocking.conversationId
          AND blocking_tombstone.turnId = blocking.turnId
         WHERE blocking.conversationId = event.conversationId
           AND blocking.originNodeId = event.originNodeId
           AND blocking.originSequence > COALESCE(CAST(covered.value AS INTEGER), 0)
           AND blocking.originSequence <= event.originSequence
           AND blocking.kind = 'message'
           AND blocking_tombstone.eventId IS NULL
           AND (blocking.timestamp, blocking.lamportClock,
                blocking.originNodeId, blocking.eventId) >= (?, ?, ?, ?)
       )`
    : '';
  const parameters: Array<string | number> = [coveredJson, conversationId];
  if (cutoff) parameters.push(cutoff.timestamp, cutoff.lamportClock, cutoff.originNodeId, cutoff.messageId);
  const maximumScannedEvents = 256;
  const rows = await dataSource.query<
    Array<{
      eventJson: string;
      originNodeId: string;
      originSequence: number;
      tombstoned: number;
    }>
  >(
    `SELECT event.eventJson, event.originNodeId, event.originSequence,
       CASE WHEN tombstone.eventId IS NULL THEN 0 ELSE 1 END AS tombstoned
     FROM conversation_events AS event
     JOIN conversation_event_sequences AS frontier
       ON frontier.conversationId = event.conversationId
      AND frontier.originNodeId = event.originNodeId
     LEFT JOIN json_each(?) AS covered ON covered.key = event.originNodeId
     LEFT JOIN conversation_turn_tombstones AS tombstone
       ON tombstone.conversationId = event.conversationId
      AND tombstone.turnId = event.turnId
     WHERE event.conversationId = ?
       AND event.originSequence > COALESCE(CAST(covered.value AS INTEGER), 0)
       AND event.originSequence <= frontier.contiguousFrontier
       ${cutoffPredicate}
     ORDER BY event.originNodeId, event.originSequence, event.eventId
     LIMIT ?`,
    [...parameters, maximumScannedEvents + 1],
  );
  const messages: ChatMessage[] = [];
  const nextCoveredVersion = { ...options.afterCoveredVersion };
  const newlyCoveredMessageCountByOrigin: Record<string, number> = {};
  const newlyCoveredUserTurnCountByOrigin: Record<string, number> = {};
  let bytes = 0;
  let stopped = false;
  for (const row of rows.slice(0, maximumScannedEvents)) {
    const event = parseStoredConversationEvent(row.eventJson);
    if (event.kind === 'message' && row.tombstoned === 0) {
      const message = conversationEventToMessage(event);
      const messageBytes = Buffer.byteLength(canonicalJson(message), 'utf8');
      if (messageBytes > options.maxBytes && messages.length === 0) {
        throw new OrchestrationError({
          code: 'EXHAUSTED',
          message: `compaction candidate message ${message.messageId} exceeds maxBytes`,
          retryable: false,
          reason: 'compaction_candidate_message_oversize',
        });
      }
      if (messages.length >= options.maxMessages || bytes + messageBytes > options.maxBytes) {
        stopped = true;
        break;
      }
      messages.push(message);
      bytes += messageBytes;
      newlyCoveredMessageCountByOrigin[row.originNodeId] = (newlyCoveredMessageCountByOrigin[row.originNodeId] ?? 0) + 1;
      if (message.role === 'user') {
        newlyCoveredUserTurnCountByOrigin[row.originNodeId] = (newlyCoveredUserTurnCountByOrigin[row.originNodeId] ?? 0) + 1;
      }
    }
    nextCoveredVersion[row.originNodeId] = row.originSequence;
  }
  return {
    messages,
    nextCoveredVersion,
    newlyCoveredMessageCountByOrigin,
    newlyCoveredUserTurnCountByOrigin,
    hasMore: stopped || rows.length > maximumScannedEvents,
  };
}

export async function getRetainedCompactionControls(
  dataSource: DataSource,
  conversationId: string,
  options: GetRetainedCompactionControlsOptions,
): Promise<RetainedCompactionControlPage> {
  if (
    !Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 32 ||
    !Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1 || options.maxBytes > 15 * 1024 * 1024
  ) {
    throw eventStoreError('VALIDATION_ERROR', 'invalid retained compaction control page bounds');
  }
  const cursorPredicate = options.after
    ? 'AND (candidate.originNodeId, candidate.originSequence, candidate.eventId) > (?, ?, ?)'
    : '';
  const parameters: Array<string | number> = [conversationId];
  if (options.after) {
    parameters.push(options.after.originNodeId, options.after.originSequence, options.after.eventId);
  }
  const rows = await dataSource.query<Array<{ eventJson: string; invalidated: number }>>(
    `WITH summary_candidates AS MATERIALIZED (
       -- This CTE is referenced both by the retained-control dominance scan
       -- and by the invalidation aggregate below. SQLite otherwise inlines
       -- the correlated JSON/tombstone predicate for every reference. A long
       -- conversation with only a handful of controls can then take seconds
       -- instead of milliseconds even though the result remains bounded.
       SELECT candidate.*,
         EXISTS (
           SELECT 1
           FROM conversation_events AS tombstone
           JOIN conversation_events AS target
             ON target.conversationId = tombstone.conversationId
            AND target.turnId = tombstone.turnId
            AND target.kind = 'message'
           JOIN json_each(candidate.eventJson, '$.boundary.coveredVersion') AS target_coverage
             ON target_coverage.key = target.originNodeId
            AND CAST(target_coverage.value AS INTEGER) >= target.originSequence
           LEFT JOIN json_each(candidate.eventJson, '$.boundary.coveredVersion') AS tombstone_coverage
             ON tombstone_coverage.key = tombstone.originNodeId
           WHERE tombstone.conversationId = candidate.conversationId
             AND tombstone.kind = 'tombstone'
             AND COALESCE(CAST(tombstone_coverage.value AS INTEGER), 0) < tombstone.originSequence
         ) AS polluted
       FROM conversation_events AS candidate
       WHERE candidate.conversationId = ? AND candidate.kind = 'compaction'
         AND NOT EXISTS (
           SELECT 1 FROM conversation_turn_tombstones AS summary_tombstone
           WHERE summary_tombstone.conversationId = candidate.conversationId
             AND json_extract(candidate.eventJson, '$.mode') = 'summary'
             AND summary_tombstone.turnId = json_extract(candidate.eventJson, '$.summary.turnId')
         )
     ), valid_summaries AS (
       SELECT * FROM summary_candidates WHERE polluted = 0
     )
     SELECT candidate.eventJson,
       (SELECT COALESCE(MAX(polluted), 0) FROM summary_candidates) AS invalidated
     FROM valid_summaries AS candidate
     WHERE 1 = 1 ${cursorPredicate}
       AND NOT EXISTS (
         SELECT 1 FROM valid_summaries AS other
         WHERE other.conversationId = candidate.conversationId
           AND other.eventId <> candidate.eventId
           AND (
             json_extract(candidate.eventJson, '$.mode') = 'coverage-only'
             OR json_extract(other.eventJson, '$.mode') = 'summary'
           )
           AND NOT EXISTS (
             SELECT 1 FROM json_each(candidate.eventJson, '$.boundary.coveredVersion') AS covered
             WHERE NOT EXISTS (
               SELECT 1 FROM json_each(other.eventJson, '$.boundary.coveredVersion') AS other_covered
               WHERE other_covered.key = covered.key
                 AND CAST(other_covered.value AS INTEGER) >= CAST(covered.value AS INTEGER)
             )
           )
           AND (
             EXISTS (
               SELECT 1 FROM json_each(other.eventJson, '$.boundary.coveredVersion') AS other_covered
               WHERE NOT EXISTS (
                 SELECT 1 FROM json_each(candidate.eventJson, '$.boundary.coveredVersion') AS covered
                 WHERE covered.key = other_covered.key
                   AND CAST(covered.value AS INTEGER) >= CAST(other_covered.value AS INTEGER)
               )
             )
             OR (other.lamportClock, other.originNodeId, other.originSequence, other.eventId) >
                (candidate.lamportClock, candidate.originNodeId,
                 candidate.originSequence, candidate.eventId)
           )
       )
     ORDER BY candidate.originNodeId, candidate.originSequence, candidate.eventId
     LIMIT ?`,
    [...parameters, options.limit + 1],
  );
  const items: RetainedCompactionControlPage['items'] = [];
  let bytes = 0;
  let byteStopped = false;
  for (const row of rows.slice(0, options.limit)) {
    const eventBytes = Buffer.byteLength(row.eventJson, 'utf8');
    if (eventBytes > options.maxBytes && items.length === 0) {
      throw new OrchestrationError({
        code: 'EXHAUSTED',
        message: 'retained compaction control exceeds maxBytes',
        retryable: false,
        reason: 'retained_compaction_control_oversize',
      });
    }
    if (bytes + eventBytes > options.maxBytes) {
      byteStopped = true;
      break;
    }
    const event = parseStoredConversationEvent(row.eventJson);
    if (event.kind !== 'compaction') {
      throw eventStoreError('CONFLICT', 'retained compaction query returned a non-compaction event');
    }
    items.push(event);
    bytes += eventBytes;
  }
  const last = items.at(-1);
  return {
    items,
    invalidated: rows.some(row => row.invalidated === 1),
    hasMore: byteStopped || rows.length > options.limit,
    ...(last
      ? {
        nextCursor: {
          originNodeId: last.originNodeId,
          originSequence: last.originSequence,
          eventId: last.eventId,
        },
      }
      : {}),
  };
}
