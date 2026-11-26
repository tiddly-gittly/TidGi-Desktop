/** Bounded message and turn reads from the durable conversation projections. */
import { AgentInstanceMessageEntity } from '@services/database/schema/agent';
import type {
  AgentDeviceRpcGetTurnDetailRequest,
  AgentDeviceRpcGetTurnDetailResponse,
  ChatMessage,
  ConversationFullContentMessagePage,
  ConversationMessageCursor,
  ConversationMessageDetailRange,
  ConversationMessageIdentity,
  ConversationMessageListProjection,
  ConversationMessagePage,
  GetFullContentMessagePageOptions,
  GetMessagePageOptions,
  TurnDetailProjectionCursor,
} from 'memeloop';
import {
  assertConversationMessageProjection,
  createChatMessage,
  decodeConversationProjectionCursor,
  encodeConversationProjectionCursor,
  messageCursor,
  OrchestrationError,
} from 'memeloop';
import { DataSource, Repository } from 'typeorm';
import { canonicalJson, conversationEventProjectionMessage, eventStoreError, parseStoredConversationEvent, visibleMessagePredicate } from './conversationStorageUtilities';

export interface RawMessageSqlRow {
  projectionExpected?: number | null;
  projectionJson?: Buffer | string | null;
  messageId: string | null;
  conversationId: string | null;
  originNodeId: string | null;
  originSequence: number | null;
  turnId: string | null;
  timestamp: number | null;
  lamportClock: number | null;
  role: ChatMessage['role'] | null;
  content: string | null;
  partsJson: string | null;
  toolCallsJson: string | null;
  attachmentsJson: string | null;
  detailRefJson: string | null;
  reasoningContent: string | null;
  contentType: string | null;
  hidden: number | null;
  metadataJson: string | null;
  duration: number | null;
}

export function messageSqlColumns(alias: string, detailAlias?: string): string {
  const projected = detailAlias !== undefined;
  return `${projected ? '1' : '0'} AS projectionExpected,
    ${projected ? `${detailAlias}.listProjectionJson` : 'NULL'} AS projectionJson,
    ${alias}.messageId, ${alias}.conversationId, ${alias}.originNodeId,
    ${alias}.originSequence, ${alias}.turnId, ${alias}.timestamp,
    ${alias}.lamportClock, ${alias}.role,
    ${projected ? 'NULL' : `${alias}.content`} AS content,
    ${projected ? 'NULL' : `${alias}.parts`} AS partsJson,
    ${projected ? 'NULL' : `${alias}.toolCalls`} AS toolCallsJson,
    ${projected ? 'NULL' : `${alias}.attachments`} AS attachmentsJson,
    ${projected ? 'NULL' : `${alias}.detailRef`} AS detailRefJson,
    ${projected ? 'NULL' : `${alias}.reasoning_content`} AS reasoningContent,
    ${projected ? 'NULL' : `${alias}.contentType`} AS contentType,
    ${projected ? 'NULL' : `${alias}.hidden`} AS hidden,
    ${projected ? 'NULL' : `${alias}.meta_data`} AS metadataJson,
    ${projected ? 'NULL' : `${alias}.duration`} AS duration`;
}

interface MessagePageSqlRow extends RawMessageSqlRow {
  revision: number;
  valid: number;
  hasMoreBefore: number;
  hasMoreAfter: number;
}

export async function getMessageIdentity(
  dataSource: DataSource,
  conversationId: string,
  messageId: string,
  options?: { signal?: AbortSignal },
): Promise<ConversationMessageIdentity | null> {
  options?.signal?.throwIfAborted();
  const [row] = await dataSource.query<Array<ConversationMessageIdentity>>(
    `SELECT message.messageId, message.timestamp, message.lamportClock, message.originNodeId
     FROM agent_instance_messages AS message
     WHERE message.conversationId = ? AND message.messageId = ?
       AND ${visibleMessagePredicate('message')}
     LIMIT 1`,
    [conversationId, messageId],
  );
  options?.signal?.throwIfAborted();
  return row ?? null;
}

export async function readMessageDetailRange(
  dataSource: DataSource,
  conversationId: string,
  messageId: string,
  offset: number,
  maxBytes: number,
  options?: { signal?: AbortSignal },
): Promise<ConversationMessageDetailRange> {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw eventStoreError('VALIDATION_ERROR', 'message detail offset must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 3 * 1024 * 1024) {
    throw eventStoreError('VALIDATION_ERROR', 'message detail range must be between 1 byte and 3 MiB');
  }
  options?.signal?.throwIfAborted();
  const [row] = await dataSource.query<Array<{ totalBytes: number; bytes: Buffer | null }>>(
    `SELECT detail.byteLength AS totalBytes,
       CASE WHEN ? <= detail.byteLength
         THEN substr(detail.canonicalJson, ? + 1, ?)
         ELSE NULL END AS bytes
     FROM conversation_message_details AS detail
     WHERE detail.conversationId = ? AND detail.messageId = ?
       AND NOT EXISTS (
         SELECT 1 FROM conversation_turn_tombstones AS tombstone
         WHERE tombstone.conversationId = detail.conversationId
           AND tombstone.turnId = detail.turnId
       )
     LIMIT 1`,
    [offset, offset, maxBytes, conversationId, messageId],
  );
  options?.signal?.throwIfAborted();
  if (!row) return { found: false };
  if (row.bytes === null) {
    throw eventStoreError('VALIDATION_ERROR', 'message detail offset exceeds total bytes');
  }
  return {
    found: true,
    offset,
    totalBytes: row.totalBytes,
    bytes: new Uint8Array(row.bytes.buffer, row.bytes.byteOffset, row.bytes.byteLength),
  };
}

/** Read one UTF-8-aligned reasoning page without materializing message JSON or answer text. */
export async function readMessageReasoningRange(
  dataSource: DataSource,
  conversationId: string,
  messageId: string,
  offset: number,
  maxBytes: number,
  options?: { signal?: AbortSignal },
): Promise<ConversationMessageDetailRange> {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw eventStoreError('VALIDATION_ERROR', 'message reasoning offset must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 4 || maxBytes > 256 * 1024) {
    throw eventStoreError('VALIDATION_ERROR', 'message reasoning range must be between 4 bytes and 256 KiB');
  }
  options?.signal?.throwIfAborted();
  const [row] = await dataSource.query<Array<{ totalBytes: number; bytes: Buffer | null }>>(
    `SELECT length(CAST(message.reasoning_content AS BLOB)) AS totalBytes,
       CASE WHEN ? <= length(CAST(message.reasoning_content AS BLOB))
         THEN substr(CAST(message.reasoning_content AS BLOB), ? + 1, ?)
         ELSE NULL END AS bytes
     FROM agent_instance_messages AS message
     WHERE message.conversationId = ? AND message.messageId = ?
       AND message.reasoning_content IS NOT NULL
       AND ${visibleMessagePredicate('message')}
     LIMIT 1`,
    [offset, offset, maxBytes, conversationId, messageId],
  );
  options?.signal?.throwIfAborted();
  if (!row) return { found: false };
  if (row.bytes === null) {
    throw eventStoreError('VALIDATION_ERROR', 'message reasoning offset exceeds total bytes');
  }
  const source = new Uint8Array(row.bytes.buffer, row.bytes.byteOffset, row.bytes.byteLength);
  const bytes = utf8AlignedReasoningPage(source, offset + source.byteLength === row.totalBytes);
  if (offset < row.totalBytes && bytes.byteLength === 0) {
    throw eventStoreError('CONFLICT', 'message reasoning range did not make UTF-8 progress');
  }
  return { found: true, offset, totalBytes: row.totalBytes, bytes };
}

function utf8AlignedReasoningPage(bytes: Uint8Array, finalPage: boolean): Uint8Array {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const minimum = Math.max(0, bytes.byteLength - 3);
  for (let end = bytes.byteLength; end >= minimum; end -= 1) {
    let valid = false;
    try {
      decoder.decode(bytes.subarray(0, end));
      valid = true;
    } catch (error: unknown) {
      // Try the next shorter suffix; a UTF-8 code point is at most four bytes.
      // TextDecoder with `fatal` reports malformed bytes as TypeError; any
      // other failure is unexpected and must remain observable.
      if (!(error instanceof TypeError)) throw error;
    }
    if (!valid) continue;
    if (finalPage && end !== bytes.byteLength) {
      throw eventStoreError('CONFLICT', 'stored message reasoning is not valid UTF-8');
    }
    return bytes.slice(0, end);
  }
  return new Uint8Array();
}

export async function getMessagePage(
  repository: Repository<AgentInstanceMessageEntity>,
  conversationId: string,
  options: GetMessagePageOptions,
): Promise<ConversationMessagePage> {
  return readBoundedMessagePage(
    repository,
    conversationId,
    options,
    true,
    messageProjectionFromSqlRow,
  );
}

/** Trusted full-content paging used by model context/export paths only. */
export async function getFullContentMessagePage(
  repository: Repository<AgentInstanceMessageEntity>,
  conversationId: string,
  options: GetFullContentMessagePageOptions,
): Promise<ConversationFullContentMessagePage> {
  return readBoundedMessagePage(
    repository,
    conversationId,
    options,
    false,
    messageFromSqlRow,
  );
}

type MessagePageReadOptions = GetMessagePageOptions | GetFullContentMessagePageOptions;

type MessageCursorSource = Pick<ChatMessage, 'messageId' | 'timestamp' | 'lamportClock' | 'originNodeId'>;

type BoundedMessagePage<T extends MessageCursorSource> =
  | {
    reset: false;
    conversationId: string;
    revision: string;
    items: T[];
    hasMoreBefore: boolean;
    hasMoreAfter: boolean;
    startCursor?: ConversationMessageCursor;
    endCursor?: ConversationMessageCursor;
  }
  | { reset: true; conversationId: string; revision: string };

async function readBoundedMessagePage<T extends MessageCursorSource>(
  repository: Repository<AgentInstanceMessageEntity>,
  conversationId: string,
  options: MessagePageReadOptions,
  useStoredProjection: boolean,
  decodeRow: (row: RawMessageSqlRow) => T | undefined,
): Promise<BoundedMessagePage<T>> {
  if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 80) {
    throw eventStoreError('VALIDATION_ERROR', 'message page limit must be between 1 and 80');
  }
  const limit = options.limit;
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1 || options.maxBytes > 4 * 1024 * 1024) {
    throw eventStoreError('VALIDATION_ERROR', 'message page maxBytes must be a positive bounded integer');
  }
  if (options.before && options.after) {
    throw eventStoreError('VALIDATION_ERROR', 'message page accepts one keyset cursor');
  }
  if ((options.before || options.after) && options.expectedRevision === undefined) {
    throw eventStoreError('VALIDATION_ERROR', 'message page cursor requires revision');
  }
  if (
    options.expectedRevision !== undefined &&
    (options.expectedRevision.length === 0 || options.expectedRevision.length > 2048)
  ) throw eventStoreError('VALIDATION_ERROR', 'invalid message page revision');
  const cursor = options.before ?? options.after;
  const coverage = options.afterCoveredVersion ? canonicalJson(options.afterCoveredVersion) : undefined;
  const coveragePredicate = coverage
    ? `AND eligible.isContextCompaction = 0 AND NOT EXISTS (
         SELECT 1 FROM json_each(?) AS covered
         WHERE covered.key = eligible.originNodeId
           AND eligible.originSequence <= CAST(covered.value AS INTEGER)
       )`
    : '';
  const cursorValidity = cursor
    ? `EXISTS (
         SELECT 1 FROM eligible
         WHERE timestamp = ? AND lamportClock = ? AND originNodeId = ? AND messageId = ?
       )`
    : '1';
  const relation = options.before ? '<' : options.after ? '>' : undefined;
  const cursorFilter = relation
    ? `AND (eligible.timestamp, eligible.lamportClock, eligible.originNodeId, eligible.messageId)
         ${relation} (?, ?, ?, ?)`
    : '';
  const readingForward = options.direction === 'forward';
  const direction = readingForward ? 'ASC' : 'DESC';
  const parameters: unknown[] = [conversationId];
  if (coverage) parameters.push(coverage);
  parameters.push(options.expectedRevision === undefined ? 0 : 1, options.expectedRevision ?? '');
  if (cursor) parameters.push(cursor.timestamp, cursor.lamportClock, cursor.originNodeId, cursor.messageId);
  if (cursor) parameters.push(cursor.timestamp, cursor.lamportClock, cursor.originNodeId, cursor.messageId);
  parameters.push(limit);
  const rows = await repository.manager.query<MessagePageSqlRow[]>(
    `WITH state AS (
       SELECT COALESCE((
         SELECT revision FROM conversation_timeline_states WHERE conversationId = ?
       ), 0) AS revision
     ), eligible AS (
       SELECT ${
      useStoredProjection
        ? `eligible.messageId, eligible.conversationId, eligible.originNodeId,
          eligible.originSequence, eligible.turnId, eligible.timestamp,
          eligible.lamportClock, eligible.role`
        : 'eligible.*'
    }
       FROM agent_instance_messages AS eligible
       WHERE eligible.conversationId = ?
         AND ${visibleMessagePredicate('eligible')} ${coveragePredicate}
     ), validity AS (
       SELECT CASE WHEN (? = 0 OR CAST(state.revision AS TEXT) = ?) AND ${cursorValidity}
         THEN 1 ELSE 0 END AS valid FROM state
     ), filtered AS (
       SELECT eligible.* FROM eligible, validity
       WHERE validity.valid = 1 ${cursorFilter}
     ), selected AS (
       SELECT * FROM filtered
       ORDER BY timestamp ${direction}, lamportClock ${direction},
         originNodeId ${direction}, messageId ${direction} LIMIT ?
     ), first_selected AS (
       SELECT * FROM selected ORDER BY timestamp, lamportClock, originNodeId, messageId LIMIT 1
     ), last_selected AS (
       SELECT * FROM selected ORDER BY timestamp DESC, lamportClock DESC,
         originNodeId DESC, messageId DESC LIMIT 1
     )
     SELECT state.revision, validity.valid,
       ${messageSqlColumns('selected', useStoredProjection ? 'detail' : undefined)},
       CASE WHEN first_selected.messageId IS NULL THEN 0 ELSE EXISTS (
         SELECT 1 FROM eligible AS older
         WHERE (older.timestamp, older.lamportClock, older.originNodeId, older.messageId) <
           (first_selected.timestamp, first_selected.lamportClock,
            first_selected.originNodeId, first_selected.messageId)
       ) END AS hasMoreBefore,
       CASE WHEN last_selected.messageId IS NULL THEN 0 ELSE EXISTS (
         SELECT 1 FROM eligible AS newer
         WHERE (newer.timestamp, newer.lamportClock, newer.originNodeId, newer.messageId) >
           (last_selected.timestamp, last_selected.lamportClock,
            last_selected.originNodeId, last_selected.messageId)
       ) END AS hasMoreAfter
     FROM state CROSS JOIN validity LEFT JOIN selected ON 1 = 1
     ${
      useStoredProjection
        ? `LEFT JOIN conversation_message_details AS detail
          ON detail.conversationId = selected.conversationId
            AND detail.messageId = selected.messageId`
        : ''
    }
     LEFT JOIN first_selected ON 1 = 1 LEFT JOIN last_selected ON 1 = 1
     ORDER BY selected.timestamp, selected.lamportClock,
       selected.originNodeId, selected.messageId`,
    [conversationId, ...parameters],
  );
  const first = rows[0];
  const revision = String(first?.revision ?? 0);
  if (first?.valid !== 1) {
    const reset = { reset: true as const, conversationId, revision };
    if (Buffer.byteLength(canonicalJson(reset), 'utf8') > options.maxBytes) {
      throw new OrchestrationError({
        code: 'EXHAUSTED',
        message: 'message page reset metadata exceeds maxBytes',
        retryable: false,
        reason: 'message_page_metadata_oversize',
      });
    }
    return reset;
  }
  const queried = rows.map(decodeRow).filter((message): message is T => message !== undefined);
  const selected: T[] = [];
  let bytes = 0;
  let byteStopped = false;
  const scanOrder = readingForward ? queried : [...queried].reverse();
  for (const message of scanOrder) {
    const messageBytes = Buffer.byteLength(canonicalJson(message), 'utf8');
    if (messageBytes > options.maxBytes && selected.length === 0) {
      throw new OrchestrationError({
        code: 'EXHAUSTED',
        message: `message ${message.messageId} exceeds page maxBytes`,
        retryable: false,
        reason: 'message_page_item_oversize',
      });
    }
    if (bytes + messageBytes > options.maxBytes) {
      byteStopped = true;
      break;
    }
    selected.push(message);
    bytes += messageBytes;
  }
  let items = readingForward ? selected : selected.reverse();
  let hasMoreBefore = first.hasMoreBefore === 1 || (!readingForward && byteStopped);
  let hasMoreAfter = first.hasMoreAfter === 1 || (readingForward && byteStopped);
  const build = (): BoundedMessagePage<T> => {
    const startCursor = items[0] ? messageCursor(items[0]) : undefined;
    const endCursor = items.at(-1) ? messageCursor(items.at(-1)!) : undefined;
    return {
      reset: false,
      conversationId,
      revision,
      items,
      hasMoreBefore,
      hasMoreAfter,
      ...(startCursor ? { startCursor } : {}),
      ...(endCursor ? { endCursor } : {}),
    };
  };
  while (Buffer.byteLength(canonicalJson(build()), 'utf8') > options.maxBytes) {
    if (items.length <= 1) {
      throw new OrchestrationError({
        code: 'EXHAUSTED',
        message: `message ${items[0]?.messageId ?? ''} and page metadata exceed maxBytes`,
        retryable: false,
        reason: 'message_page_item_oversize',
      });
    }
    if (readingForward) {
      items = items.slice(0, -1);
      hasMoreAfter = true;
    } else {
      items = items.slice(1);
      hasMoreBefore = true;
    }
  }
  return build();
}

interface TurnDetailSqlRow extends RawMessageSqlRow {
  valid: number;
  hasMoreBefore: number;
  hasMoreAfter: number;
  seenCursorFound: number;
}

/** Bounded conversation-scoped turn detail; every selector is one atomic SQL read. */
export async function getTurnDetail(
  repository: Repository<AgentInstanceMessageEntity>,
  request: AgentDeviceRpcGetTurnDetailRequest,
): Promise<AgentDeviceRpcGetTurnDetailResponse> {
  const limit = request.limit ?? 50;
  const maxBytes = request.maxBytes ?? 256 * 1024;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw eventStoreError('VALIDATION_ERROR', 'turn detail limit must be between 1 and 50');
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 64 * 1024 || maxBytes > 4 * 1024 * 1024) {
    throw eventStoreError('VALIDATION_ERROR', 'turn detail maxBytes must be between 64 KiB and 4 MiB');
  }
  if (!request.conversationId || !request.turnId) {
    throw eventStoreError('VALIDATION_ERROR', 'turn detail requires conversationId and turnId');
  }
  let cursor: TurnDetailProjectionCursor | undefined;
  if (request.cursor !== undefined) {
    try {
      const decoded = decodeConversationProjectionCursor(request.cursor, {
        kind: 'turn-detail',
        conversationId: request.conversationId,
        turnId: request.turnId,
      });
      cursor = decoded.kind === 'turn-detail' ? decoded : undefined;
    } catch (error: unknown) {
      if (!(error instanceof Error)) throw error;
      throw eventStoreError('VALIDATION_ERROR', 'invalid turn detail cursor');
    }
  }
  let seenCursor: TurnDetailProjectionCursor | undefined;
  if (request.seenCursor !== undefined) {
    try {
      const decoded = decodeConversationProjectionCursor(request.seenCursor, {
        kind: 'turn-detail',
        conversationId: request.conversationId,
        turnId: request.turnId,
      });
      seenCursor = decoded.kind === 'turn-detail' ? decoded : undefined;
    } catch (error: unknown) {
      if (!(error instanceof Error)) throw error;
      throw eventStoreError('VALIDATION_ERROR', 'invalid turn detail seen cursor');
    }
  }
  const readingForward = request.direction === 'forward';
  const direction = readingForward ? 'ASC' : 'DESC';
  const relation = readingForward ? '>' : '<';
  const cursorValidity = cursor
    ? `EXISTS (SELECT 1 FROM eligible WHERE
         timestamp = ? AND lamportClock = ? AND originNodeId = ? AND messageId = ?)`
    : '1';
  const cursorFilter = cursor
    ? `AND (timestamp, lamportClock, originNodeId, messageId) ${relation} (?, ?, ?, ?)`
    : '';
  const seenFound = seenCursor
    ? `EXISTS (SELECT 1 FROM eligible WHERE
         timestamp = ? AND lamportClock = ? AND originNodeId = ? AND messageId = ?)`
    : '0';
  const parameters: unknown[] = [request.conversationId, request.turnId];
  if (cursor) parameters.push(cursor.timestamp, cursor.lamportClock, cursor.originNodeId, cursor.messageId);
  if (cursor) parameters.push(cursor.timestamp, cursor.lamportClock, cursor.originNodeId, cursor.messageId);
  parameters.push(limit);
  if (seenCursor) {
    parameters.push(seenCursor.timestamp, seenCursor.lamportClock, seenCursor.originNodeId, seenCursor.messageId);
  }
  const rows = await repository.manager.query<TurnDetailSqlRow[]>(
    `WITH eligible AS (
       SELECT message.messageId, message.conversationId, message.originNodeId,
         message.originSequence, message.turnId, message.timestamp,
         message.lamportClock, message.role
       FROM agent_instance_messages AS message
       WHERE message.conversationId = ? AND message.turnId = ?
         AND ${visibleMessagePredicate('message')}
     ), validity AS (
       SELECT CASE WHEN ${cursorValidity} THEN 1 ELSE 0 END AS valid
     ), filtered AS (
       SELECT * FROM eligible, validity WHERE validity.valid = 1 ${cursorFilter}
     ), selected AS (
       SELECT * FROM filtered
       ORDER BY timestamp ${direction}, lamportClock ${direction},
         originNodeId ${direction}, messageId ${direction} LIMIT ?
     ), first_selected AS (
       SELECT * FROM selected ORDER BY timestamp, lamportClock, originNodeId, messageId LIMIT 1
     ), last_selected AS (
       SELECT * FROM selected ORDER BY timestamp DESC, lamportClock DESC,
         originNodeId DESC, messageId DESC LIMIT 1
     )
     SELECT validity.valid, ${seenFound} AS seenCursorFound,
       ${messageSqlColumns('selected', 'detail')},
       CASE WHEN first_selected.messageId IS NULL THEN 0 ELSE EXISTS (
         SELECT 1 FROM eligible AS older WHERE
           (older.timestamp, older.lamportClock, older.originNodeId, older.messageId) <
           (first_selected.timestamp, first_selected.lamportClock,
            first_selected.originNodeId, first_selected.messageId)
       ) END AS hasMoreBefore,
       CASE WHEN last_selected.messageId IS NULL THEN 0 ELSE EXISTS (
         SELECT 1 FROM eligible AS newer WHERE
           (newer.timestamp, newer.lamportClock, newer.originNodeId, newer.messageId) >
           (last_selected.timestamp, last_selected.lamportClock,
            last_selected.originNodeId, last_selected.messageId)
       ) END AS hasMoreAfter
     FROM validity LEFT JOIN selected ON 1 = 1
     LEFT JOIN conversation_message_details AS detail
       ON detail.conversationId = selected.conversationId
         AND detail.messageId = selected.messageId
     LEFT JOIN first_selected ON 1 = 1 LEFT JOIN last_selected ON 1 = 1
     ORDER BY selected.timestamp, selected.lamportClock,
       selected.originNodeId, selected.messageId`,
    parameters,
  );
  const first = rows[0];
  if (first?.valid !== 1) throw eventStoreError('CONFLICT', 'turn detail cursor is no longer retained');
  let items = rows.map(messageProjectionFromSqlRow)
    .filter((message): message is ConversationMessageListProjection => message !== undefined);
  let hasMoreBefore = first.hasMoreBefore === 1;
  let hasMoreAfter = first.hasMoreAfter === 1;
  const build = (): AgentDeviceRpcGetTurnDetailResponse => {
    const oldest = items[0];
    const newest = items.at(-1);
    return {
      turnId: request.turnId,
      items,
      hasMoreBefore,
      hasMoreAfter,
      ...(hasMoreBefore && oldest
        ? {
          previousCursor: encodeConversationProjectionCursor({
            version: 1,
            kind: 'turn-detail',
            conversationId: oldest.conversationId,
            turnId: oldest.turnId,
            timestamp: oldest.timestamp,
            lamportClock: oldest.lamportClock,
            originNodeId: oldest.originNodeId,
            messageId: oldest.messageId,
          }),
        }
        : {}),
      ...(hasMoreAfter && newest
        ? {
          nextCursor: encodeConversationProjectionCursor({
            version: 1,
            kind: 'turn-detail',
            conversationId: newest.conversationId,
            turnId: newest.turnId,
            timestamp: newest.timestamp,
            lamportClock: newest.lamportClock,
            originNodeId: newest.originNodeId,
            messageId: newest.messageId,
          }),
        }
        : {}),
      ...(request.seenCursor === undefined ? {} : { seenCursorFound: first.seenCursorFound === 1 }),
    };
  };
  while (Buffer.byteLength(canonicalJson(build()), 'utf8') > maxBytes) {
    if (items.length <= 1) {
      throw new OrchestrationError({
        code: 'EXHAUSTED',
        message: `turn ${request.turnId} detail exceeds maxBytes`,
        retryable: false,
        reason: 'turn_detail_item_oversize',
      });
    }
    if (readingForward) {
      items = items.slice(0, -1);
      hasMoreAfter = true;
    } else {
      items = items.slice(1);
      hasMoreBefore = true;
    }
  }
  return build();
}

function parseOptionalJsonColumn(value: string): unknown {
  return JSON.parse(value) as unknown;
}

function messageFromSqlRow(row: RawMessageSqlRow): ChatMessage | undefined {
  if (row.projectionExpected === 1) {
    throw eventStoreError('CONFLICT', 'full-content message decoder received a bounded projection row');
  }
  if (
    row.messageId === null || row.conversationId === null || row.originNodeId === null ||
    row.originSequence === null || row.turnId === null || row.timestamp === null ||
    row.lamportClock === null || row.role === null || row.content === null
  ) return undefined;
  return createChatMessage({
    messageId: row.messageId,
    conversationId: row.conversationId,
    originNodeId: row.originNodeId,
    originSequence: row.originSequence,
    turnId: row.turnId,
    timestamp: row.timestamp,
    lamportClock: row.lamportClock,
    role: row.role,
    content: row.content,
    ...(row.partsJson === null ? {} : { parts: parseOptionalJsonColumn(row.partsJson) as ChatMessage['parts'] }),
    ...(row.toolCallsJson === null ? {} : { toolCalls: parseOptionalJsonColumn(row.toolCallsJson) as ChatMessage['toolCalls'] }),
    ...(row.attachmentsJson === null ? {} : { attachments: parseOptionalJsonColumn(row.attachmentsJson) as ChatMessage['attachments'] }),
    ...(row.detailRefJson === null ? {} : { detailRef: parseOptionalJsonColumn(row.detailRefJson) as ChatMessage['detailRef'] }),
    ...(row.reasoningContent === null ? {} : { reasoning_content: row.reasoningContent }),
    ...(row.contentType === null ? {} : { contentType: row.contentType }),
    ...(row.hidden === null ? {} : { hidden: row.hidden === 1 }),
    ...(row.metadataJson === null ? {} : { metadata: parseOptionalJsonColumn(row.metadataJson) as ChatMessage['metadata'] }),
    ...(row.duration === null ? {} : { duration: row.duration }),
  });
}

export function messageProjectionFromSqlRow(row: RawMessageSqlRow): ConversationMessageListProjection | undefined {
  if (row.messageId === null) return undefined;
  if (row.projectionExpected !== 1 || row.projectionJson === null || row.projectionJson === undefined) {
    throw eventStoreError('CONFLICT', `message projection ${row.messageId} is missing its bounded payload`);
  }
  const projectionJson = typeof row.projectionJson === 'string'
    ? row.projectionJson
    : new TextDecoder('utf-8', { fatal: true }).decode(row.projectionJson);
  const projection: unknown = JSON.parse(projectionJson);
  assertConversationMessageProjection(projection, row.conversationId ?? undefined);
  if (canonicalJson(projection) !== projectionJson) {
    throw eventStoreError('CONFLICT', `message projection ${row.messageId} is not canonical`);
  }
  return projection;
}

export async function getMaxLamportClock(
  repository: Repository<AgentInstanceMessageEntity>,
  conversationId: string,
): Promise<number> {
  const row = await repository.createQueryBuilder('message')
    .select('MAX(message.lamportClock)', 'maximum')
    .where('message.conversationId = :conversationId', { conversationId })
    .andWhere(visibleMessagePredicate())
    .getRawOne<{ maximum: number | null }>();
  return row?.maximum ?? 0;
}

export async function getExistingMessageIds(
  repository: Repository<AgentInstanceMessageEntity>,
  conversationId: string,
  messageIds: string[],
): Promise<string[]> {
  if (messageIds.length === 0) return [];
  const rows = await repository.createQueryBuilder('message')
    .select('message.messageId')
    .where('message.conversationId = :conversationId', { conversationId })
    .andWhere('message.messageId IN (:...messageIds)', { messageIds })
    .andWhere(visibleMessagePredicate())
    .getMany();
  return rows.map(row => row.messageId);
}

export async function getMessage(
  repository: Repository<AgentInstanceMessageEntity>,
  messageId: string,
): Promise<ChatMessage | undefined> {
  // The projection table deliberately supplies SQLite/TypeORM defaults (for
  // example hidden=false) and therefore cannot reproduce whether an optional
  // field was absent in the immutable event. Retry compares canonical bytes,
  // so point reads must materialize the authoritative event JSON exactly.
  const [row] = await repository.manager.query<Array<{ eventJson: string }>>(
    `SELECT event.eventJson
     FROM conversation_events AS event
     WHERE event.eventId = ? AND event.kind IN ('message', 'compaction')
       AND (event.turnId IS NULL OR NOT EXISTS (
         SELECT 1 FROM conversation_turn_tombstones AS tombstone
         WHERE tombstone.conversationId = event.conversationId
           AND tombstone.turnId = event.turnId
       ))
     LIMIT 1`,
    [messageId],
  );
  if (row) return conversationEventProjectionMessage(parseStoredConversationEvent(row.eventJson));
  const visibleProjection = await repository.createQueryBuilder('message')
    .select('message.messageId', 'messageId')
    .where('message.messageId = :messageId', { messageId })
    .andWhere(visibleMessagePredicate())
    .getRawOne<{ messageId: string }>();
  if (visibleProjection) {
    throw eventStoreError('CONFLICT', `message projection ${messageId} has no authoritative event`);
  }
  return undefined;
}

export async function getLatestContextCompactionSummary(
  repository: Repository<AgentInstanceMessageEntity>,
  conversationId: string,
): Promise<ChatMessage | undefined> {
  return await repository.createQueryBuilder('message')
    .where('message.conversationId = :conversationId', { conversationId })
    .andWhere('message.isContextCompaction = :isContextCompaction', { isContextCompaction: true })
    .andWhere(visibleMessagePredicate())
    .orderBy('message.timestamp', 'DESC')
    .addOrderBy('message.lamportClock', 'DESC')
    .addOrderBy('message.originNodeId', 'DESC')
    .addOrderBy('message.messageId', 'DESC')
    .getOne() ?? undefined;
}
