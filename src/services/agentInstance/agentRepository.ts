/**
 * Agent CRUD Repository — Database operations for AgentInstance lifecycle.
 *
 * Pure functions that receive repositories as parameters.
 * Extracted from AgentInstanceService to reduce class size.
 */
import { backOff } from 'exponential-backoff';
import { pick } from 'lodash';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';

import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import { AgentDefinitionEntity, AgentInstanceEntity, AgentInstanceMessageEntity, ScheduledTaskEntity } from '@services/database/schema/agent';
import {
  AgentLoopCheckpointEntity,
  AgentRunStateEntity,
  ConversationAttachmentReferenceEntity,
  ConversationEventEntity,
  ConversationEventSequenceEntity,
  ConversationMessageDetailEntity,
  ConversationMetadataFieldEntity,
  ConversationTimelineEntryEntity,
  ConversationTimelineRankCheckpointEntity,
  ConversationTimelineStateEntity,
  ConversationTurnTombstoneEntity,
} from '@services/database/schema/conversationEvent';
import { logger } from '@services/libs/log';

import type {
  AgentDeviceRpcDeleteTurnRequest,
  AgentDeviceRpcGetTurnDetailRequest,
  AgentDeviceRpcGetTurnDetailResponse,
  AgentInstanceMetadata,
  AgentInstanceMetadataUpdate,
  AttachmentReference,
  ChatMessage,
  CompactionCandidatePage,
  ConversationEvent,
  ConversationEventDraft,
  ConversationEventPage,
  ConversationFullContentMessagePage,
  ConversationListPage,
  ConversationListProjectionCursor,
  ConversationMessageCursor,
  ConversationMessageDetailRange,
  ConversationMessageIdentity,
  ConversationMessageListProjection,
  ConversationMessagePage,
  ConversationMessageWindowResult,
  ConversationTimelineEntry,
  ConversationTimelineMessageEntry,
  ConversationTimelinePage,
  ConversationTombstoneEvent,
  GetCompactionCandidatePageOptions,
  GetConversationEventPageOptions,
  GetConversationListPageOptions,
  GetConversationMessageWindowAroundOptions,
  GetConversationTimelinePageOptions,
  GetFullContentMessagePageOptions,
  GetMessagePageOptions,
  GetRetainedCompactionControlsOptions,
  MessageVersionFrontier,
  MessageVersionFrontierCursor,
  MessageVersionFrontierPage,
  RetainedCompactionControlPage,
  TurnDetailProjectionCursor,
} from 'memeloop';
import type { ConversationMeta } from 'memeloop';
import {
  assertCanonicalConversationEvent,
  assertCanonicalConversationEventDraft,
  assertCanonicalConversationEventDrafts,
  assertCanonicalConversationEvents,
  assertConversationMessageProjection,
  canonicalConversationEventBytes,
  compareConversationLoopCheckpointEvents,
  conversationEventAttachmentReferences,
  conversationEventToMessage,
  createAgentInstanceFromDefinition,
  createChatMessage,
  decodeConversationProjectionCursor,
  encodeConversationProjectionCursor,
  messageCursor,
  OrchestrationError,
  projectConversationMessageForList,
} from 'memeloop';
import { CANONICAL_MESSAGE_FIELDS, projectChatMessageEntity } from './messageEntityProjection';

function visibleMessagePredicate(alias = 'message'): string {
  return `NOT EXISTS (
    SELECT 1 FROM conversation_turn_tombstones AS tombstone
    WHERE tombstone.conversationId = ${alias}.conversationId
      AND tombstone.turnId = ${alias}.turnId
  )`;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function containsAsciiControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

export async function createAgent(
  agentInstanceRepo: Repository<AgentInstanceEntity>,
  agentDefinitionService: IAgentDefinitionService,
  agentDefinitionID?: string,
  options?: { id?: string; preview?: boolean; volatile?: boolean },
): Promise<AgentInstanceMetadata> {
  // Get agent definition with exponential backoff to handle initialization race conditions
  const agentDefinition = await backOff(
    async () => {
      const definition = await agentDefinitionService.getAgentDef(agentDefinitionID);
      if (!definition) {
        throw new Error(`Agent definition not found: ${agentDefinitionID}`);
      }
      return definition;
    },
    {
      numOfAttempts: 3,
      startingDelay: 300,
      timeMultiple: 1.5,
    },
  );

  if (!agentDefinition.name) {
    throw new Error(`Agent definition missing required field 'name': ${agentDefinitionID}`);
  }

  const now = new Date();
  const instanceId = options?.id ?? (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  if (!instanceId || Buffer.byteLength(instanceId, 'utf8') > 512 || containsAsciiControl(instanceId)) {
    throw new Error('invalid agent instance id');
  }
  const instanceData = createAgentInstanceFromDefinition(agentDefinition, {
    id: instanceId,
    volatile: options?.preview || options?.volatile || false,
  });

  const instanceEntity = agentInstanceRepo.create({
    id: instanceData.id,
    agentDefId: instanceData.agentDefId,
    name: instanceData.name,
    status: instanceData.status,
    created: now,
    modified: now,
    modelConfig: instanceData.modelConfig,
    avatarUrl: instanceData.avatarUrl,
    agentFrameworkConfig: instanceData.agentFrameworkConfig,
    closed: instanceData.closed ?? false,
    volatile: instanceData.volatile ?? false,
    preview: options?.preview === true,
  });

  // Add timeout to database save operation
  const savePromise = agentInstanceRepo.save(instanceEntity);
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Database save timeout after 5 seconds'));
    }, 5000);
  });
  await Promise.race([savePromise, timeoutPromise]);

  logger.info('Created agent instance', {
    function: 'createAgent',
    instanceId,
    preview: !!options?.preview,
    volatile: !!options?.volatile || !!options?.preview,
  });

  return projectAgentInstanceMetadata(instanceEntity);
}

export async function getAgentMetadata(
  agentInstanceRepo: Repository<AgentInstanceEntity>,
  agentId: string,
): Promise<AgentInstanceMetadata | undefined> {
  const instanceEntity = await agentInstanceRepo.findOne({ where: { id: agentId } });
  if (!instanceEntity) return undefined;
  return projectAgentInstanceMetadata(instanceEntity);
}

function projectAgentInstanceMetadata(entity: AgentInstanceEntity): AgentInstanceMetadata {
  return {
    id: entity.id,
    agentDefId: entity.agentDefId,
    ...(entity.name === undefined ? {} : { name: entity.name }),
    status: entity.status,
    created: entity.created,
    ...(entity.modified === undefined ? {} : { modified: entity.modified }),
    ...(entity.modelConfig === undefined ? {} : { modelConfig: entity.modelConfig }),
    ...(entity.avatarUrl === undefined ? {} : { avatarUrl: entity.avatarUrl }),
    ...(entity.agentFrameworkConfig === undefined ? {} : { agentFrameworkConfig: entity.agentFrameworkConfig }),
    closed: entity.closed,
    volatile: entity.volatile,
    preview: entity.preview,
  };
}

interface RawMessageSqlRow {
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

const PERSISTED_MESSAGE_LIST_PROJECTION_BYTES = 48 * 1024;

function messageSqlColumns(alias: string, detailAlias?: string): string {
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

function messageProjectionFromSqlRow(row: RawMessageSqlRow): ConversationMessageListProjection | undefined {
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

const timelinePreviewSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

function timelinePreview(content: string, maximum: number): string {
  const firstLine = content.split('\n').map(line => line.trim()).find(Boolean) ?? '';
  const graphemes = Array.from(timelinePreviewSegmenter.segment(firstLine), segment => segment.segment);
  if (graphemes.length <= maximum) return firstLine;
  return maximum === 1 ? '…' : `${graphemes.slice(0, maximum - 1).join('')}…`;
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

const TIMELINE_RANK_CHECKPOINT_INTERVAL = 256;

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

export async function getMaxLamportClock(
  repository: Repository<AgentInstanceMessageEntity>,
  conversationId: string,
): Promise<number> {
  // Lightweight test/dummy repository adapters may implement only Repository
  // find(). Production TypeORM repositories always take the indexed aggregate
  // path below, so long transcripts are never materialized in the app.
  if (typeof repository.createQueryBuilder !== 'function') {
    const rows = await repository.find({
      select: { lamportClock: true },
      where: { conversationId },
    }) ?? [];
    return rows.reduce((maximum, row) => Math.max(maximum, row.lamportClock), 0);
  }
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

export async function deleteConversationTurn(
  repository: Repository<AgentInstanceMessageEntity>,
  conversationId: string,
  userMessageId: string,
): Promise<{ messageIds: string[]; userMessage: ChatMessage } | undefined> {
  const userMessage = await repository.findOne({
    where: { messageId: userMessageId, conversationId, role: 'user' },
  });
  if (!userMessage) return undefined;
  const rows = await repository.find({
    select: { messageId: true },
    where: { conversationId, turnId: userMessage.turnId },
  });
  return { messageIds: rows.map(message => message.messageId), userMessage };
}

export async function updateAgent(
  agentInstanceRepo: Repository<AgentInstanceEntity>,
  _agentMessageRepo: Repository<AgentInstanceMessageEntity>,
  agentId: string,
  data: AgentInstanceMetadataUpdate,
): Promise<AgentInstanceMetadata> {
  const instanceEntity = await agentInstanceRepo.findOne({ where: { id: agentId } });

  if (!instanceEntity) {
    throw new Error(`Agent instance not found: ${agentId}`);
  }

  const pickedProperties = pick(data, ['name', 'status', 'avatarUrl', 'modelConfig', 'closed', 'agentFrameworkConfig']);
  Object.assign(instanceEntity, pickedProperties);
  await agentInstanceRepo.save(instanceEntity);
  await bumpConversationListRevision(agentInstanceRepo.manager);

  return projectAgentInstanceMetadata(instanceEntity);
}

export async function deleteAgent(
  agentInstanceRepo: Repository<AgentInstanceEntity>,
  _agentMessageRepo: Repository<AgentInstanceMessageEntity>,
  agentId: string,
): Promise<void> {
  // Conversation audit rows are append-only. "Delete" removes the instance
  // from normal directory views; Preferences' clear-data action deletes the
  // entire disposable MemeLoop database when irreversible erasure is wanted.
  await agentInstanceRepo.update(agentId, { closed: true, modified: new Date() });
  await bumpConversationListRevision(agentInstanceRepo.manager);
  logger.info(`Archived agent instance: ${agentId}`);
}

export interface DiscardVolatileAgentPreviewInput {
  agentId?: string;
  temporaryDefinitionId?: string;
}

/**
 * Irreversible cleanup is intentionally separate from deleteAgent(), whose
 * public contract is archival. Every destructive predicate is re-checked in
 * the same transaction as the deletes so a stale renderer cannot erase a
 * durable conversation or definition.
 */
export async function discardVolatileAgentPreview(
  dataSource: DataSource,
  input: DiscardVolatileAgentPreviewInput,
): Promise<void> {
  const agentId = input.agentId?.trim();
  const temporaryDefinitionId = input.temporaryDefinitionId?.trim();
  if (!agentId && !temporaryDefinitionId) {
    throw new Error('discarding a volatile preview requires an agent or temporary definition id');
  }
  if (temporaryDefinitionId && !temporaryDefinitionId.startsWith('temp-')) {
    throw new Error(`Refusing to discard non-temporary agent definition: ${temporaryDefinitionId}`);
  }

  await dataSource.transaction(async manager => {
    const instanceRepository = manager.getRepository(AgentInstanceEntity);
    const definitionRepository = manager.getRepository(AgentDefinitionEntity);
    const instance = agentId ? await instanceRepository.findOne({ where: { id: agentId } }) : null;
    const definition = temporaryDefinitionId
      ? await definitionRepository.findOne({ where: { id: temporaryDefinitionId } })
      : null;

    // A repeated cleanup after a committed transaction is harmless. Partial
    // absence is not: it can indicate a stale or confused-deputy request.
    if (!instance && !definition) return;
    if (agentId && !instance && !temporaryDefinitionId) return;
    if (instance && temporaryDefinitionId && !definition) {
      throw new Error(`Temporary agent definition not found: ${temporaryDefinitionId}`);
    }
    if (instance && (!instance.volatile || !instance.preview)) {
      throw new Error(`Refusing to discard non-preview or non-volatile agent instance: ${agentId}`);
    }
    if (instance && temporaryDefinitionId && instance.agentDefId !== temporaryDefinitionId) {
      throw new Error('Volatile preview does not belong to the supplied temporary definition');
    }

    if (temporaryDefinitionId) {
      const linkedInstances = await instanceRepository.find({ where: { agentDefId: temporaryDefinitionId } });
      const unexpectedInstance = linkedInstances.find(linked => !agentId || linked.id !== agentId || !linked.volatile || !linked.preview);
      if (unexpectedInstance) {
        throw new Error(`Refusing to discard referenced temporary agent definition: ${temporaryDefinitionId}`);
      }
      if (agentId && !instance && linkedInstances.length > 0) {
        throw new Error(`Volatile preview identity mismatch for temporary definition: ${temporaryDefinitionId}`);
      }
    }

    if (instance) {
      const conversationId = instance.id;

      // Scheduling and run state can keep live work associated with the
      // conversation. Their in-memory counterparts are released by the
      // service before entering this transaction.
      await manager.getRepository(ScheduledTaskEntity).delete({ agentInstanceId: conversationId });
      await manager.getRepository(AgentRunStateEntity).delete({ conversationId });

      // Derived projections first, canonical events and allocators next, then
      // the message/instance FK parents. Keep this list explicit when adding a
      // new conversation-scoped table: silent cascades would make omissions
      // invisible in review and tests.
      await manager.getRepository(ConversationTimelineRankCheckpointEntity).delete({ conversationId });
      await manager.getRepository(ConversationTimelineEntryEntity).delete({ conversationId });
      await manager.getRepository(ConversationTimelineStateEntity).delete({ conversationId });
      await manager.getRepository(ConversationTurnTombstoneEntity).delete({ conversationId });
      await manager.getRepository(AgentLoopCheckpointEntity).delete({ conversationId });
      await manager.getRepository(ConversationMetadataFieldEntity).delete({ conversationId });
      await manager.getRepository(ConversationMessageDetailEntity).delete({ conversationId });
      await manager.getRepository(ConversationAttachmentReferenceEntity).delete({ conversationId });
      await manager.getRepository(AgentInstanceMessageEntity).delete({ conversationId });
      await manager.getRepository(ConversationEventEntity).delete({ conversationId });
      await manager.getRepository(ConversationEventSequenceEntity).delete({ conversationId });
      await instanceRepository.delete(conversationId);
    }

    if (temporaryDefinitionId) {
      await manager.getRepository(ScheduledTaskEntity).delete({ agentDefinitionId: temporaryDefinitionId });
      await definitionRepository.delete(temporaryDefinitionId);
    }
    await bumpConversationListRevision(manager);
  });
}

export async function getAgents(
  agentInstanceRepo: Repository<AgentInstanceEntity>,
  page: number,
  pageSize: number,
  options?: { closed?: boolean; searchName?: string },
): Promise<AgentInstanceMetadata[]> {
  const skip = (page - 1) * pageSize;
  const take = pageSize;

  const whereCondition: Record<string, unknown> = {};
  whereCondition.volatile = false;

  if (options?.closed !== undefined) {
    whereCondition.closed = options.closed;
  }
  if (options?.searchName) {
    whereCondition.name = { like: `%${options.searchName}%` };
  }

  const [instances, _] = await agentInstanceRepo.findAndCount({
    where: Object.keys(whereCondition).length > 0 ? whereCondition : undefined,
    skip,
    take,
    order: { created: 'DESC' },
  });

  return instances.map(projectAgentInstanceMetadata);
}

export interface ConversationListProjectionScope {
  allowedConversationIds?: readonly string[];
  allowedDefinitionIds?: readonly string[];
  scopeKey: string;
}

function conversationListQueryDigest(
  query: GetConversationListPageOptions['query'],
  scope?: ConversationListProjectionScope,
): string {
  return createHash('sha256').update(canonicalJson({ query: query ?? {}, scopeKey: scope?.scopeKey ?? 'local' }), 'utf8').digest('base64url');
}

interface ConversationListRow {
  conversationId: string | null;
  title: string | null;
  lastMessagePreview: string | null;
  lastMessageTimestamp: number | null;
  messageCount: number | null;
  originClock: number | null;
  definitionId: string | null;
  instanceDeltaJson: string | null;
  isUserInitiated: number;
  sourceChannelJson: string | null;
  total: number;
}

type ConversationListConcreteRow = ConversationListRow & {
  conversationId: string;
  title: string;
  lastMessagePreview: string;
  lastMessageTimestamp: number;
  messageCount: number;
  originClock: number;
  definitionId: string;
};

function conversationMetaFromRow(row: ConversationListConcreteRow, localNodeId: string): ConversationMeta {
  return {
    conversationId: row.conversationId,
    title: row.title,
    lastMessagePreview: row.lastMessagePreview,
    lastMessageTimestamp: row.lastMessageTimestamp,
    messageCount: row.messageCount,
    originNodeId: localNodeId,
    originClock: row.originClock,
    definitionId: row.definitionId,
    ...(row.instanceDeltaJson
      ? { instanceDelta: { agentFrameworkConfig: JSON.parse(row.instanceDeltaJson) as unknown } }
      : {}),
    isUserInitiated: Boolean(row.isUserInitiated),
    ...(row.sourceChannelJson
      ? { sourceChannel: JSON.parse(row.sourceChannelJson) as ConversationMeta['sourceChannel'] }
      : {}),
  };
}

/** Exact canonical metadata point read; runtime hosts consume no local DTO. */
export async function getConversationMeta(
  dataSource: DataSource,
  localNodeId: string,
  conversationId: string,
): Promise<ConversationMeta | null> {
  if (
    !localNodeId || Buffer.byteLength(localNodeId, 'utf8') > 512 ||
    !conversationId || Buffer.byteLength(conversationId, 'utf8') > 512
  ) {
    throw eventStoreError('VALIDATION_ERROR', 'invalid conversation metadata identity');
  }
  const rows = await dataSource.query<ConversationListConcreteRow[]>(
    `SELECT instance.id AS conversationId,
       COALESCE(instance.name, instance.agentDefId) AS title,
       COALESCE(timeline.lastMessagePreview, '') AS lastMessagePreview,
       COALESCE(timeline.lastMessageTimestamp, 0) AS lastMessageTimestamp,
       COALESCE(timeline.totalMessages, 0) AS messageCount,
       COALESCE((
         SELECT MAX(event.lamportClock) FROM conversation_events AS event
         WHERE event.conversationId = instance.id AND event.originNodeId = ?
       ), 1) AS originClock,
       instance.agentDefId AS definitionId,
       instance.agentFrameworkConfig AS instanceDeltaJson,
       COALESCE((
         SELECT CAST(json_extract(initiated.valueJson, '$') AS INTEGER)
         FROM conversation_metadata_fields AS initiated
         WHERE initiated.conversationId = instance.id AND initiated.field = 'isUserInitiated'
       ), 1) AS isUserInitiated,
       (
         SELECT source.valueJson FROM conversation_metadata_fields AS source
         WHERE source.conversationId = instance.id AND source.field = 'sourceChannel'
       ) AS sourceChannelJson,
       1 AS total
     FROM agent_instances AS instance
     LEFT JOIN conversation_timeline_states AS timeline
       ON timeline.conversationId = instance.id
     WHERE instance.id = ?
     LIMIT 1`,
    [localNodeId, conversationId],
  );
  return rows[0] ? conversationMetaFromRow(rows[0], localNodeId) : null;
}

/** Constant-query-count, revisioned conversation directory page. */
export async function getConversationListPage(
  dataSource: DataSource,
  localNodeId: string,
  options: GetConversationListPageOptions,
  scope?: ConversationListProjectionScope,
): Promise<ConversationListPage> {
  if (
    !Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 100 ||
    !Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1 || options.maxBytes > 1024 * 1024
  ) throw eventStoreError('VALIDATION_ERROR', 'invalid conversation list page bounds');
  if (!localNodeId || Buffer.byteLength(localNodeId, 'utf8') > 512) {
    throw eventStoreError('VALIDATION_ERROR', 'invalid local node identity');
  }
  const selectors = [options.beforeCursor, options.afterCursor].filter(value => value !== undefined);
  if (selectors.length > 1) throw eventStoreError('VALIDATION_ERROR', 'conversation list cursor conflict');
  if (selectors.length === 1 && options.expectedRevision === undefined) {
    throw eventStoreError('VALIDATION_ERROR', 'conversation list cursor requires revision');
  }
  const query = options.query ?? {};
  if (scope) assertConversationListProjectionScope(scope);
  if (
    query.definitionId !== undefined && (query.definitionId.length === 0 || Buffer.byteLength(query.definitionId, 'utf8') > 512) ||
    query.sourceChannelId !== undefined && (query.sourceChannelId.length === 0 || Buffer.byteLength(query.sourceChannelId, 'utf8') > 512) ||
    query.isUserInitiated !== undefined && typeof query.isUserInitiated !== 'boolean'
  ) throw eventStoreError('VALIDATION_ERROR', 'invalid conversation list query');
  const [revisionRow] = await dataSource.query<Array<{ revision: number }>>(
    'SELECT revision FROM conversation_list_state WHERE id = 1',
  );
  const revision = String(revisionRow?.revision ?? 0);
  const reset = (): ConversationListPage => {
    const page = { reset: true as const, revision };
    if (Buffer.byteLength(canonicalJson(page), 'utf8') > options.maxBytes) {
      throw new Error('conversation_list_page_exceeds_byte_budget');
    }
    return page;
  };
  if (options.expectedRevision !== undefined && options.expectedRevision !== revision) return reset();
  const queryDigest = conversationListQueryDigest(query, scope);
  const encodedCursor = options.beforeCursor ?? options.afterCursor;
  let cursor: ConversationListProjectionCursor | undefined;
  if (encodedCursor !== undefined) {
    try {
      const decoded = decodeConversationProjectionCursor(encodedCursor, {
        kind: 'conversation-list',
        revision,
        queryDigest,
      });
      cursor = decoded.kind === 'conversation-list' ? decoded : undefined;
    } catch (error: unknown) {
      logger.debug('Resetting conversation list after invalid cursor', { error });
      return reset();
    }
  }

  const filters = ['instance.volatile = 0', 'instance.closed = 0'];
  const parameters: Array<string | number> = [];
  if (scope?.allowedConversationIds) {
    filters.push(`instance.id IN (${scope.allowedConversationIds.map(() => '?').join(', ')})`);
    parameters.push(...scope.allowedConversationIds);
  }
  if (scope?.allowedDefinitionIds) {
    filters.push(`instance.agentDefId IN (${scope.allowedDefinitionIds.map(() => '?').join(', ')})`);
    parameters.push(...scope.allowedDefinitionIds);
  }
  if (query.definitionId !== undefined) {
    filters.push('instance.agentDefId = ?');
    parameters.push(query.definitionId);
  }
  if (query.sourceChannelId !== undefined) {
    filters.push(`EXISTS (
      SELECT 1 FROM conversation_metadata_fields AS source
      WHERE source.conversationId = instance.id AND source.field = 'sourceChannel'
        AND json_extract(source.valueJson, '$.channelId') = ?
    )`);
    parameters.push(query.sourceChannelId);
  }
  if (query.isUserInitiated !== undefined) {
    filters.push(`COALESCE((
      SELECT CAST(json_extract(initiated.valueJson, '$') AS INTEGER)
      FROM conversation_metadata_fields AS initiated
      WHERE initiated.conversationId = instance.id AND initiated.field = 'isUserInitiated'
    ), 1) = ?`);
    parameters.push(query.isUserInitiated ? 1 : 0);
  }
  if (cursor) {
    const relation = options.beforeCursor !== undefined ? '<' : '>';
    filters.push(`(COALESCE(timeline.lastMessageTimestamp, 0), instance.id) ${relation} (?, ?)`);
    parameters.push(cursor.timestamp, cursor.conversationId);
  }
  const descending = options.afterCursor === undefined;
  const direction = descending ? 'DESC' : 'ASC';
  const rows = await dataSource.query<ConversationListRow[]>(
    `WITH filtered AS (
       SELECT instance.id, instance.agentDefId, instance.name,
         instance.agentFrameworkConfig,
         COALESCE(timeline.lastMessagePreview, '') AS lastMessagePreview,
         COALESCE(timeline.lastMessageTimestamp, 0) AS lastMessageTimestamp,
         COALESCE(timeline.totalMessages, 0) AS messageCount
       FROM agent_instances AS instance
       LEFT JOIN conversation_timeline_states AS timeline
         ON timeline.conversationId = instance.id
       WHERE ${filters.join(' AND ')}
     ), total AS (
       SELECT COUNT(*) AS count FROM agent_instances AS instance
       LEFT JOIN conversation_timeline_states AS timeline
         ON timeline.conversationId = instance.id
       WHERE ${filters.slice(0, filters.length - (cursor ? 1 : 0)).join(' AND ')}
     )
     SELECT filtered.id AS conversationId,
       COALESCE(filtered.name, filtered.agentDefId) AS title,
       filtered.lastMessagePreview, filtered.lastMessageTimestamp,
       filtered.messageCount,
       COALESCE((
         SELECT MAX(event.lamportClock) FROM conversation_events AS event
         WHERE event.conversationId = filtered.id AND event.originNodeId = ?
       ), 1) AS originClock,
       filtered.agentDefId AS definitionId,
       filtered.agentFrameworkConfig AS instanceDeltaJson,
       COALESCE((
         SELECT CAST(json_extract(initiated.valueJson, '$') AS INTEGER)
         FROM conversation_metadata_fields AS initiated
         WHERE initiated.conversationId = filtered.id AND initiated.field = 'isUserInitiated'
       ), 1) AS isUserInitiated,
       (
         SELECT source.valueJson FROM conversation_metadata_fields AS source
         WHERE source.conversationId = filtered.id AND source.field = 'sourceChannel'
       ) AS sourceChannelJson,
       total.count AS total
     FROM total LEFT JOIN filtered ON 1 = 1
     ORDER BY filtered.lastMessageTimestamp ${direction}, filtered.id ${direction}
     LIMIT ?`,
    [
      ...parameters,
      ...parameters.slice(0, parameters.length - (cursor ? 2 : 0)),
      localNodeId,
      options.limit + 1,
    ],
  );
  const total = rows[0]?.total ?? 0;
  const availableRows = rows.filter((row): row is ConversationListConcreteRow => row.conversationId !== null);
  const hasExtra = availableRows.length > options.limit;
  let ordered = descending ? availableRows.slice(0, options.limit) : availableRows.slice(0, options.limit).reverse();
  let items = ordered.map(row => conversationMetaFromRow(row, localNodeId));
  const cursorFor = (row: ConversationListConcreteRow) =>
    encodeConversationProjectionCursor({
      version: 1,
      kind: 'conversation-list',
      revision,
      queryDigest,
      timestamp: row.lastMessageTimestamp,
      conversationId: row.conversationId,
    });
  const buildPage = (): ConversationListPage => {
    const firstIndex = items.length === 0 ? -1 : ordered.length - items.length;
    const pageRows = firstIndex <= 0 ? ordered : ordered.slice(firstIndex);
    const first = pageRows[0];
    const last = pageRows.at(-1);
    return {
      reset: false,
      items,
      revision,
      total,
      hasMoreBefore: options.afterCursor !== undefined || hasExtra,
      hasMoreAfter: options.afterCursor !== undefined ? hasExtra : options.beforeCursor !== undefined,
      ...(first ? { startCursor: cursorFor(first) } : {}),
      ...(last ? { endCursor: cursorFor(last) } : {}),
    };
  };
  while (Buffer.byteLength(canonicalJson(buildPage()), 'utf8') > options.maxBytes) {
    if (items.length === 0) throw new Error('conversation_list_page_exceeds_byte_budget');
    if (options.afterCursor !== undefined) {
      items = items.slice(1);
      ordered = ordered.slice(1);
    } else {
      items = items.slice(0, -1);
      ordered = ordered.slice(0, -1);
    }
  }
  return buildPage();
}

function assertConversationListProjectionScope(scope: ConversationListProjectionScope): void {
  const assertIds = (ids: readonly string[] | undefined, field: string): void => {
    if (ids === undefined) return;
    if (
      ids.length < 1 || ids.length > 256 || new Set(ids).size !== ids.length ||
      ids.some(id => id.length < 1 || Buffer.byteLength(id, 'utf8') > 512)
    ) throw eventStoreError('VALIDATION_ERROR', `invalid conversation list ${field} scope`);
  };
  assertIds(scope.allowedConversationIds, 'conversation');
  assertIds(scope.allowedDefinitionIds, 'definition');
  if (!scope.scopeKey || Buffer.byteLength(scope.scopeKey, 'utf8') > 16 * 1024) {
    throw eventStoreError('VALIDATION_ERROR', 'invalid conversation list scope key');
  }
}

const MAX_CANONICAL_JSON_DEPTH = 32;
const MAX_CANONICAL_JSON_NODES = 200_000;
const MAX_EVENT_PAGE_SIZE = 80;
const MAX_EVENT_RANGES = 256;

function eventStoreError(code: 'CONFLICT' | 'NOT_FOUND' | 'VALIDATION_ERROR', message: string): OrchestrationError {
  return new OrchestrationError({
    code: code === 'VALIDATION_ERROR' ? 'INVALID' : code,
    message,
    retryable: false,
  });
}

/** Stable, bounded JSON used for both durable bytes and conflict comparison. */
function canonicalJson(value: unknown): string {
  let nodes = 0;
  const seen = new Set<object>();
  const normalize = (item: unknown, depth: number, inArray = false): unknown => {
    nodes += 1;
    if (nodes > MAX_CANONICAL_JSON_NODES || depth > MAX_CANONICAL_JSON_DEPTH) {
      throw eventStoreError('VALIDATION_ERROR', 'canonical JSON structure exceeds depth/node limits');
    }
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number') {
      if (Number.isFinite(item)) return item;
      throw eventStoreError('VALIDATION_ERROR', 'canonical JSON numbers must be finite');
    }
    if (item === undefined && !inArray) return undefined;
    if (Array.isArray(item)) {
      if (seen.has(item)) throw eventStoreError('VALIDATION_ERROR', 'canonical JSON must not contain cycles');
      seen.add(item);
      try {
        return item.map(nested => normalize(nested, depth + 1, true));
      } finally {
        seen.delete(item);
      }
    }
    if (typeof item === 'object') {
      const object = item as Record<string, unknown>;
      const prototype = Reflect.getPrototypeOf(object);
      if (prototype !== Object.prototype && prototype !== null) {
        throw eventStoreError('VALIDATION_ERROR', 'canonical JSON values must be plain objects');
      }
      if (seen.has(object)) throw eventStoreError('VALIDATION_ERROR', 'canonical JSON must not contain cycles');
      seen.add(object);
      try {
        const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
        for (const [key, nested] of Object.entries(object).sort(([left], [right]) => compareCodeUnits(left, right))) {
          if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
            throw eventStoreError('VALIDATION_ERROR', `forbidden canonical JSON key ${key}`);
          }
          const normalized = normalize(nested, depth + 1);
          if (normalized !== undefined) result[key] = normalized;
        }
        return result;
      } finally {
        seen.delete(object);
      }
    }
    throw eventStoreError('VALIDATION_ERROR', `unsupported canonical JSON value ${typeof item}`);
  };
  return JSON.stringify(normalize(value, 0));
}

function eventTurnId(event: ConversationEvent): string | undefined {
  if (event.kind === 'message') return event.message.turnId;
  if (event.kind === 'tombstone') return event.targetTurnId;
  if (event.kind === 'compaction') return event.summary?.turnId;
  return undefined;
}

const canonicalEventDecoder = new TextDecoder('utf-8', { fatal: true });

function canonicalEventJson(event: ConversationEvent): string {
  return canonicalEventDecoder.decode(canonicalConversationEventBytes(event));
}

function parseStoredConversationEvent(eventJson: string): ConversationEvent {
  const parsed: unknown = JSON.parse(eventJson);
  assertCanonicalConversationEvent(parsed);
  if (canonicalEventJson(parsed) !== eventJson) {
    throw eventStoreError('CONFLICT', 'stored conversation event is not canonical');
  }
  return parsed;
}

function compareLww(
  left: Pick<ConversationEvent, 'lamportClock' | 'originNodeId' | 'eventId'>,
  right: Pick<ConversationEvent, 'lamportClock' | 'originNodeId' | 'eventId'>,
): number {
  return left.lamportClock - right.lamportClock ||
    compareCodeUnits(left.originNodeId, right.originNodeId) ||
    compareCodeUnits(left.eventId, right.eventId);
}

async function ensureMetadataConversationProjection(
  manager: EntityManager,
  event: Extract<ConversationEvent, { kind: 'metadataPatch' }>,
): Promise<void> {
  const winnerRepository = manager.getRepository(ConversationMetadataFieldEntity);
  for (const [field, value] of Object.entries(event.patch)) {
    const current = await winnerRepository.findOne({
      where: { conversationId: event.conversationId, field },
    });
    if (current && compareLww(event, current) <= 0) continue;
    const valueJson = canonicalJson(value);
    if (Buffer.byteLength(valueJson, 'utf8') > 48 * 1024) {
      throw eventStoreError('VALIDATION_ERROR', `metadataPatch field ${field} exceeds 48 KiB`);
    }
    await winnerRepository.save(winnerRepository.create({
      conversationId: event.conversationId,
      field,
      valueJson,
      lamportClock: event.lamportClock,
      originNodeId: event.originNodeId,
      eventId: event.eventId,
    }));
  }

  const instanceRepository = manager.getRepository(AgentInstanceEntity);
  let instance = await instanceRepository.findOne({ where: { id: event.conversationId } });
  const definitionWinner = await winnerRepository.findOne({
    where: { conversationId: event.conversationId, field: 'definitionId' },
  });
  const titleWinner = await winnerRepository.findOne({
    where: { conversationId: event.conversationId, field: 'title' },
  });
  const definitionId = definitionWinner ? JSON.parse(definitionWinner.valueJson) as unknown : undefined;
  const title = titleWinner ? JSON.parse(titleWinner.valueJson) as unknown : undefined;

  if (!instance) {
    if (typeof definitionId !== 'string' || definitionId.length === 0) return;
    const definitionRepository = manager.getRepository(AgentDefinitionEntity);
    const definition = await definitionRepository.findOne({ where: { id: definitionId } });
    if (!definition) return;
    instance = instanceRepository.create({
      id: event.conversationId,
      agentDefId: definitionId,
      name: typeof title === 'string' ? title : definition.name,
      status: { state: 'completed', modified: new Date(event.timestamp) },
      created: new Date(event.timestamp),
      modified: new Date(event.timestamp),
      closed: false,
      volatile: false,
    });
  } else {
    if (typeof definitionId === 'string' && definitionId.length > 0) instance.agentDefId = definitionId;
    if (typeof title === 'string') instance.name = title;
    instance.modified = new Date(event.timestamp);
  }
  await instanceRepository.save(instance);
}

const TIMELINE_STORED_PREVIEW_LENGTH = 240;
const TIMELINE_ACTOR_LENGTH = 160;
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

async function bumpConversationListRevision(manager: EntityManager): Promise<void> {
  await manager.query(
    `INSERT INTO conversation_list_state (id, revision) VALUES (1, 1)
     ON CONFLICT(id) DO UPDATE SET revision = revision + 1`,
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

async function finalizeTimelineRankCheckpoints(manager: EntityManager): Promise<void> {
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

async function projectTimelineMessage(
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

async function projectTimelineCompaction(
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

async function projectTimelineTombstone(
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

async function insertConversationAttachmentReferences(
  manager: EntityManager,
  events: readonly ConversationEvent[],
): Promise<void> {
  const unique = new Map<string, ConversationAttachmentReferenceEntity>();
  for (const event of events) {
    for (const reference of conversationEventAttachmentReferences(event)) {
      const key = canonicalJson([
        event.conversationId,
        reference.contentHash,
        reference.filename,
        reference.mimeType,
        reference.size,
      ]);
      unique.set(
        key,
        Object.assign(new ConversationAttachmentReferenceEntity(), {
          conversationId: event.conversationId,
          contentHash: reference.contentHash,
          filename: reference.filename,
          mimeType: reference.mimeType,
          size: reference.size,
        }),
      );
    }
  }
  const rows = [...unique.values()];
  const repository = manager.getRepository(ConversationAttachmentReferenceEntity);
  for (let start = 0; start < rows.length; start += 400) {
    await repository.createQueryBuilder()
      .insert()
      .values(rows.slice(start, start + 400))
      .orIgnore()
      .execute();
  }
}

function toMessageDetailProjection(message: ChatMessage): ConversationMessageDetailEntity {
  const canonicalBytes = Buffer.from(canonicalJson(message), 'utf8');
  const listProjectionBytes = Buffer.from(
    canonicalJson(
      projectConversationMessageForList(message, PERSISTED_MESSAGE_LIST_PROJECTION_BYTES, { detailAvailable: true }),
    ),
    'utf8',
  );
  return Object.assign(new ConversationMessageDetailEntity(), {
    conversationId: message.conversationId,
    messageId: message.messageId,
    turnId: message.turnId,
    byteLength: canonicalBytes.byteLength,
    canonicalJson: canonicalBytes,
    listProjectionByteLength: listProjectionBytes.byteLength,
    listProjectionJson: listProjectionBytes,
  });
}

async function insertMessageDetailProjection(
  manager: EntityManager,
  message: ChatMessage,
): Promise<void> {
  await manager.getRepository(ConversationMessageDetailEntity).createQueryBuilder()
    .insert()
    .values(toMessageDetailProjection(message))
    .orIgnore()
    .execute();
}

async function projectConversationEvent(
  manager: EntityManager,
  event: ConversationEvent,
  options: { attachments?: boolean; timeline?: boolean; list?: boolean } = {},
): Promise<void> {
  const projectTimeline = options.timeline !== false;
  if (options.list !== false) await bumpConversationListRevision(manager);
  if (options.attachments !== false) await insertConversationAttachmentReferences(manager, [event]);
  if (event.kind === 'metadataPatch') {
    await ensureMetadataConversationProjection(manager, event);
    return;
  }
  if (event.kind === 'tombstone') {
    const repository = manager.getRepository(ConversationTurnTombstoneEntity);
    const existing = await repository.findOne({
      where: { conversationId: event.conversationId, turnId: event.targetTurnId },
    });
    if (existing && compareLww(event, existing) <= 0) return;
    const firstTombstone = existing === null;
    const projection = existing ?? repository.create();
    Object.assign(projection, {
      eventId: event.eventId,
      conversationId: event.conversationId,
      turnId: event.targetTurnId,
      originNodeId: event.originNodeId,
      originSequence: event.originSequence,
      lamportClock: event.lamportClock,
      timestamp: event.timestamp,
      reason: event.reason,
      digest: event.digest,
    });
    await repository.save(projection);
    if (firstTombstone && projectTimeline) {
      await projectTimelineTombstone(manager, event.conversationId, event.targetTurnId);
    }
    return;
  }

  if (event.kind === 'loopCheckpoint') {
    const repository = manager.getRepository(AgentLoopCheckpointEntity);
    const existing = await repository.findOne({
      where: { conversationId: event.conversationId, key: event.checkpoint.key },
    });
    const incomingFence = event.checkpoint.fencingEpoch ?? 0;
    if (existing && incomingFence < (existing.fencingEpoch ?? 0)) return;
    if (existing && compareConversationLoopCheckpointEvents(existing, event) >= 0) return;
    await repository.save(repository.create({
      conversationId: event.conversationId,
      key: event.checkpoint.key,
      result: event.checkpoint.result,
      eventId: event.eventId,
      originNodeId: event.originNodeId,
      originSequence: event.originSequence,
      lamportClock: event.lamportClock,
      timestamp: event.timestamp,
      revision: event.checkpoint.revision ?? ((existing?.revision ?? 0) + 1),
      fencingEpoch: incomingFence,
    }));
    return;
  }

  if (event.kind === 'compaction' && event.mode === 'coverage-only') return;

  const instance = await manager.getRepository(AgentInstanceEntity).findOne({
    where: { id: event.conversationId },
  });
  if (!instance) {
    throw eventStoreError('CONFLICT', `conversation metadata must arrive before messages for ${event.conversationId}`);
  }
  const message = conversationEventProjectionMessage(event);
  if (!message) return;
  const messageRepository = manager.getRepository(AgentInstanceMessageEntity);
  const existing = await messageRepository.findOne({ where: { messageId: message.messageId } });
  if (existing) {
    if (canonicalJson(pick(existing, CANONICAL_MESSAGE_FIELDS)) !== canonicalJson(pick(message, CANONICAL_MESSAGE_FIELDS))) {
      throw eventStoreError('CONFLICT', `message projection ${message.messageId} conflicts with canonical event`);
    }
    await insertMessageDetailProjection(manager, message);
    return;
  }
  await insertMessageDetailProjection(manager, message);
  await messageRepository.save(messageRepository.create(projectChatMessageEntity(message)));
  if (projectTimeline) {
    if (event.kind === 'message') await projectTimelineMessage(manager, event);
    else await projectTimelineCompaction(manager, event);
  }
}

/** Set-based rebuild used after a large remote merge; no per-row ordinal shifts or preview N+1. */
async function rebuildConversationTimelineProjection(
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

const LARGE_REMOTE_PROJECTION_BATCH = 256;
/**
 * Keep the remote merge bounded while amortising SQLite/TypeORM statement
 * setup.  A thousand message rows stays comfortably below SQLite's bound
 * parameter ceiling (the JSON-backed inserts use one parameter; the detail
 * projection uses seven per row) and avoids making a 100k sync batch issue six
 * hundred write statements.
 */
const REMOTE_PROJECTION_CHUNK_SIZE = 1_000;

function conversationEventProjectionMessage(event: ConversationEvent): ChatMessage | undefined {
  if (event.kind === 'message') return conversationEventToMessage(event);
  if (event.kind !== 'compaction' || event.mode !== 'summary') return undefined;
  return createChatMessage({
    messageId: event.eventId,
    turnId: event.summary.turnId,
    conversationId: event.conversationId,
    originNodeId: event.originNodeId,
    originSequence: event.originSequence,
    timestamp: event.timestamp,
    lamportClock: event.lamportClock,
    role: 'assistant',
    content: event.summary.content,
    ...(event.summary.parts === undefined ? {} : { parts: event.summary.parts }),
    metadata: { contextCompaction: event.boundary, compacted: true },
  });
}

/**
 * Materialize a large immutable event batch without one SELECT/INSERT pair per
 * message. Raw events remain authoritative; this table is a disposable read
 * projection and can therefore be inserted in bounded multi-row statements.
 */
async function insertMessageProjectionsBatch(
  manager: EntityManager,
  events: readonly ConversationEvent[],
): Promise<Set<string>> {
  const messages = events
    .map(conversationEventProjectionMessage)
    .filter((message): message is ChatMessage => message !== undefined);
  const conversationIds = new Set(messages.map(message => message.conversationId));
  if (messages.length === 0) return conversationIds;

  const [missing] = await manager.query<Array<{ conversationId: string }>>(
    `SELECT input.conversationId
     FROM (
       SELECT DISTINCT value AS conversationId
       FROM json_each(?)
     ) AS input
     LEFT JOIN agent_instances AS instance ON instance.id = input.conversationId
     WHERE instance.id IS NULL
     LIMIT 1`,
    [canonicalJson([...conversationIds])],
  );
  if (missing) {
    throw eventStoreError('CONFLICT', `conversation metadata must arrive before messages for ${missing.conversationId}`);
  }

  const detailRepository = manager.getRepository(ConversationMessageDetailEntity);
  for (let start = 0; start < messages.length; start += REMOTE_PROJECTION_CHUNK_SIZE) {
    const chunk = messages.slice(start, start + REMOTE_PROJECTION_CHUNK_SIZE);
    await insertMessageProjectionRows(manager, chunk);
    await detailRepository.insert(chunk.map(toMessageDetailProjection));
  }
  return conversationIds;
}

/** Explicit SQLite DTO: JSON columns are serialized before crossing TypeORM's DeepPartial boundary. */
async function insertMessageProjectionRows(manager: EntityManager, messages: readonly ChatMessage[]): Promise<void> {
  const rows = messages.map(message => {
    const value = projectChatMessageEntity(message);
    return {
      messageId: value.messageId,
      conversationId: value.conversationId,
      originNodeId: value.originNodeId,
      originSequence: value.originSequence,
      turnId: value.turnId,
      timestamp: value.timestamp,
      lamportClock: value.lamportClock,
      role: value.role,
      content: value.content,
      parts: value.parts === undefined ? null : canonicalJson(value.parts),
      toolCalls: value.toolCalls === undefined ? null : canonicalJson(value.toolCalls),
      attachments: value.attachments === undefined ? null : canonicalJson(value.attachments),
      detailRef: value.detailRef === undefined ? null : canonicalJson(value.detailRef),
      reasoningContent: value.reasoning_content ?? null,
      contentType: value.contentType ?? null,
      hidden: value.hidden ? 1 : 0,
      metadata: value.metadata === undefined ? null : canonicalJson(value.metadata),
      isContextCompaction: value.isContextCompaction ? 1 : 0,
      duration: value.duration ?? null,
    };
  });
  await manager.query(
    `INSERT INTO agent_instance_messages (
       messageId, conversationId, originNodeId, originSequence, turnId,
       timestamp, lamportClock, role, content, parts, toolCalls, attachments,
       detailRef, reasoning_content, contentType, hidden, meta_data,
       isContextCompaction, duration
     )
     SELECT json_extract(value, '$.messageId'), json_extract(value, '$.conversationId'),
       json_extract(value, '$.originNodeId'), CAST(json_extract(value, '$.originSequence') AS INTEGER),
       json_extract(value, '$.turnId'), CAST(json_extract(value, '$.timestamp') AS INTEGER),
       CAST(json_extract(value, '$.lamportClock') AS INTEGER), json_extract(value, '$.role'),
       json_extract(value, '$.content'), json_extract(value, '$.parts'),
       json_extract(value, '$.toolCalls'), json_extract(value, '$.attachments'),
       json_extract(value, '$.detailRef'), json_extract(value, '$.reasoningContent'),
       json_extract(value, '$.contentType'), CAST(json_extract(value, '$.hidden') AS INTEGER),
       json_extract(value, '$.metadata'), CAST(json_extract(value, '$.isContextCompaction') AS INTEGER),
       CAST(json_extract(value, '$.duration') AS INTEGER)
     FROM json_each(?)`,
    [canonicalJson(rows)],
  );
}

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

async function advanceContiguousFrontier(
  manager: EntityManager,
  conversationId: string,
  originNodeId: string,
): Promise<void> {
  await manager.query(
    `WITH RECURSIVE contiguous(sequence) AS (
       SELECT contiguousFrontier FROM conversation_event_sequences
       WHERE conversationId = ? AND originNodeId = ?
       UNION ALL
       SELECT contiguous.sequence + 1 FROM contiguous
       WHERE EXISTS (
         SELECT 1 FROM conversation_events
         WHERE conversationId = ? AND originNodeId = ?
           AND originSequence = contiguous.sequence + 1
       )
     )
     UPDATE conversation_event_sequences
     SET contiguousFrontier = (SELECT MAX(sequence) FROM contiguous)
     WHERE conversationId = ? AND originNodeId = ?`,
    [conversationId, originNodeId, conversationId, originNodeId, conversationId, originNodeId],
  );
}

async function insertRawConversationEvent(manager: EntityManager, event: ConversationEvent): Promise<boolean> {
  assertCanonicalConversationEvent(event);
  const serialized = canonicalEventJson(event);
  const repository = manager.getRepository(ConversationEventEntity);
  const existing = await repository.findOne({ where: { eventId: event.eventId } });
  if (existing) {
    if (existing.eventJson !== serialized) {
      throw eventStoreError('CONFLICT', `eventId ${event.eventId} already exists with a different payload`);
    }
    return false;
  }
  const occupied = await repository.findOne({
    where: {
      conversationId: event.conversationId,
      originNodeId: event.originNodeId,
      originSequence: event.originSequence,
    },
  });
  if (occupied) {
    throw eventStoreError(
      'CONFLICT',
      `origin sequence ${event.conversationId}/${event.originNodeId}/${event.originSequence} is already occupied`,
    );
  }
  await repository.insert(repository.create({
    eventId: event.eventId,
    conversationId: event.conversationId,
    originNodeId: event.originNodeId,
    originSequence: event.originSequence,
    lamportClock: event.lamportClock,
    timestamp: event.timestamp,
    kind: event.kind,
    turnId: eventTurnId(event),
    eventJson: serialized,
  }));
  await manager.query(
    `INSERT INTO conversation_event_sequences (
       conversationId, originNodeId, lastSequence, contiguousFrontier
     ) VALUES (?, ?, ?, 0)
     ON CONFLICT(conversationId, originNodeId) DO UPDATE SET
       lastSequence = MAX(lastSequence, excluded.lastSequence)`,
    [event.conversationId, event.originNodeId, event.originSequence],
  );
  await advanceContiguousFrontier(manager, event.conversationId, event.originNodeId);
  return true;
}

interface BatchEventIdentity {
  eventId: string;
  conversationId: string;
  originNodeId: string;
  originSequence: number;
  eventJson: string;
}

function uniqueCanonicalBatch(events: readonly ConversationEvent[]): Array<{ event: ConversationEvent; eventJson: string }> {
  const byId = new Map<string, { event: ConversationEvent; eventJson: string }>();
  const byCoordinate = new Map<string, string>();
  for (const event of events) {
    const eventJson = canonicalEventJson(event);
    const existing = byId.get(event.eventId);
    if (existing) {
      if (existing.eventJson !== eventJson) {
        throw eventStoreError('CONFLICT', `eventId ${event.eventId} occurs with different payloads in one batch`);
      }
      continue;
    }
    const coordinate = canonicalJson([event.conversationId, event.originNodeId, event.originSequence]);
    const occupiedBy = byCoordinate.get(coordinate);
    if (occupiedBy !== undefined && occupiedBy !== event.eventId) {
      throw eventStoreError(
        'CONFLICT',
        `origin sequence ${event.conversationId}/${event.originNodeId}/${event.originSequence} is already occupied in batch`,
      );
    }
    byCoordinate.set(coordinate, event.eventId);
    byId.set(event.eventId, { event, eventJson });
  }
  return [...byId.values()];
}

/** Bulk raw merge: two conflict checks + chunked INSERTs, independent of event count. */
async function insertRawConversationEventsBatch(
  manager: EntityManager,
  events: readonly ConversationEvent[],
): Promise<ConversationEvent[]> {
  const canonical = uniqueCanonicalBatch(events);
  if (canonical.length === 0) return [];
  const identities: BatchEventIdentity[] = canonical.map(({ event, eventJson }) => ({
    eventId: event.eventId,
    conversationId: event.conversationId,
    originNodeId: event.originNodeId,
    originSequence: event.originSequence,
    eventJson,
  }));
  // These are freshly-created scalar-only transport rows derived from events
  // that already passed the strict Core validator. Do not run the aggregate
  // through the per-event canonical node ceiling: a valid 100k sync batch is
  // intentionally larger than one event's structural budget.
  const identityJson = JSON.stringify(identities);
  const existing = await manager.query<Array<BatchEventIdentity>>(
    `WITH input AS (
       SELECT
         json_extract(value, '$.eventId') AS eventId,
         json_extract(value, '$.conversationId') AS conversationId,
         json_extract(value, '$.originNodeId') AS originNodeId,
         CAST(json_extract(value, '$.originSequence') AS INTEGER) AS originSequence,
         json_extract(value, '$.eventJson') AS eventJson
       FROM json_each(?)
     )
     SELECT stored.eventId, stored.conversationId, stored.originNodeId,
       stored.originSequence, stored.eventJson
     FROM conversation_events AS stored
     JOIN input ON input.eventId = stored.eventId OR (
       input.conversationId = stored.conversationId AND
       input.originNodeId = stored.originNodeId AND
       input.originSequence = stored.originSequence
     )`,
    [identityJson],
  );
  const inputById = new Map(identities.map(identity => [identity.eventId, identity]));
  const inputByCoordinate = new Map(identities.map(identity => [
    canonicalJson([identity.conversationId, identity.originNodeId, identity.originSequence]),
    identity,
  ]));
  const existingIds = new Set<string>();
  for (const stored of existing) {
    const sameId = inputById.get(stored.eventId);
    if (sameId) {
      if (sameId.eventJson !== stored.eventJson) {
        throw eventStoreError('CONFLICT', `eventId ${stored.eventId} already exists with a different payload`);
      }
      existingIds.add(stored.eventId);
    }
    const coordinate = canonicalJson([stored.conversationId, stored.originNodeId, stored.originSequence]);
    const sameCoordinate = inputByCoordinate.get(coordinate);
    if (sameCoordinate && sameCoordinate.eventId !== stored.eventId) {
      throw eventStoreError(
        'CONFLICT',
        `origin sequence ${stored.conversationId}/${stored.originNodeId}/${stored.originSequence} is already occupied`,
      );
    }
  }
  const inserted = canonical.filter(({ event }) => !existingIds.has(event.eventId));
  for (let start = 0; start < inserted.length; start += REMOTE_PROJECTION_CHUNK_SIZE) {
    const rows = inserted.slice(start, start + REMOTE_PROJECTION_CHUNK_SIZE).map(({ event, eventJson }) => ({
      eventId: event.eventId,
      conversationId: event.conversationId,
      originNodeId: event.originNodeId,
      originSequence: event.originSequence,
      lamportClock: event.lamportClock,
      timestamp: event.timestamp,
      kind: event.kind,
      turnId: eventTurnId(event) ?? null,
      eventJson,
    }));
    await manager.query(
      `INSERT INTO conversation_events (
         eventId, conversationId, originNodeId, originSequence,
         lamportClock, timestamp, kind, turnId, eventJson
       )
       SELECT json_extract(value, '$.eventId'),
         json_extract(value, '$.conversationId'),
         json_extract(value, '$.originNodeId'),
         CAST(json_extract(value, '$.originSequence') AS INTEGER),
         CAST(json_extract(value, '$.lamportClock') AS INTEGER),
         CAST(json_extract(value, '$.timestamp') AS INTEGER),
         json_extract(value, '$.kind'), json_extract(value, '$.turnId'),
         json_extract(value, '$.eventJson')
       FROM json_each(?)`,
      [canonicalJson(rows)],
    );
  }
  if (inserted.length > 0) {
    const insertedIdentities = inserted.map(({ event }) => ({
      conversationId: event.conversationId,
      originNodeId: event.originNodeId,
      originSequence: event.originSequence,
    }));
    const insertedJson = JSON.stringify(insertedIdentities);
    await manager.query(
      `INSERT INTO conversation_event_sequences (
         conversationId, originNodeId, lastSequence, contiguousFrontier
       )
       SELECT json_extract(value, '$.conversationId'),
         json_extract(value, '$.originNodeId'),
         MAX(CAST(json_extract(value, '$.originSequence') AS INTEGER)), 0
       FROM json_each(?)
       GROUP BY json_extract(value, '$.conversationId'), json_extract(value, '$.originNodeId')
       ON CONFLICT(conversationId, originNodeId) DO UPDATE SET
         lastSequence = MAX(lastSequence, excluded.lastSequence)`,
      [insertedJson],
    );
    const origins = [...new Map(insertedIdentities.map(identity => [
      canonicalJson([identity.conversationId, identity.originNodeId]),
      identity,
    ])).values()];
    for (const origin of origins) {
      await advanceContiguousFrontier(manager, origin.conversationId, origin.originNodeId);
    }
  }
  return inserted.map(({ event }) => event);
}

export async function appendLocalConversationEvent(
  dataSource: DataSource,
  draft: ConversationEventDraft,
): Promise<ConversationEvent> {
  assertCanonicalConversationEventDraft(draft);
  const [event] = await appendLocalConversationEventsAtomic(dataSource, [draft]);
  if (!event) throw eventStoreError('CONFLICT', 'local event allocation returned no event');
  return event;
}

/** Validate the complete batch first, then allocate/project all drafts in one transaction. */
async function appendLocalConversationEventsWithManager(
  manager: EntityManager,
  drafts: readonly ConversationEventDraft[],
): Promise<ConversationEvent[]> {
  const rawRepository = manager.getRepository(ConversationEventEntity);
  const sequenceRepository = manager.getRepository(ConversationEventSequenceEntity);
  const stagedByEventId = new Map<string, ConversationEvent>();
  const nextSequenceByOrigin = new Map<string, number>();
  const nextLamportByConversation = new Map<string, number>();
  const prepared: ConversationEvent[] = [];
  for (const draft of drafts) {
    const staged = stagedByEventId.get(draft.eventId);
    const existingRow = staged ? undefined : await rawRepository.findOne({ where: { eventId: draft.eventId } });
    const existing = staged ?? (existingRow ? parseStoredConversationEvent(existingRow.eventJson) : undefined);
    if (existing) {
      const candidate: ConversationEvent = {
        ...draft,
        originSequence: existing.originSequence,
        lamportClock: existing.lamportClock,
      };
      if (canonicalEventJson(candidate) !== canonicalEventJson(existing)) {
        throw eventStoreError('CONFLICT', `local eventId ${draft.eventId} already exists with a different payload`);
      }
      prepared.push(existing);
      continue;
    }

    const originKey = canonicalJson([draft.conversationId, draft.originNodeId]);
    let originSequence = nextSequenceByOrigin.get(originKey);
    if (originSequence === undefined) {
      const state = await sequenceRepository.findOne({
        where: { conversationId: draft.conversationId, originNodeId: draft.originNodeId },
      });
      if (state && state.lastSequence !== state.contiguousFrontier) {
        throw eventStoreError('CONFLICT', `cannot append local event while ${draft.originNodeId} has a sequence gap`);
      }
      originSequence = (state?.lastSequence ?? 0) + 1;
    }
    let lamportClock = nextLamportByConversation.get(draft.conversationId);
    if (lamportClock === undefined) {
      const maximum = await rawRepository.createQueryBuilder('event')
        .select('COALESCE(MAX(event.lamportClock), 0)', 'maximum')
        .where('event.conversationId = :conversationId', { conversationId: draft.conversationId })
        .getRawOne<{ maximum: number }>();
      lamportClock = (maximum?.maximum ?? 0) + 1;
    }
    const event: ConversationEvent = { ...draft, originSequence, lamportClock };
    canonicalEventJson(event);
    stagedByEventId.set(event.eventId, event);
    nextSequenceByOrigin.set(originKey, originSequence + 1);
    nextLamportByConversation.set(draft.conversationId, lamportClock + 1);
    prepared.push(event);
  }
  let changed = false;
  for (const event of prepared) {
    if (await insertRawConversationEvent(manager, event)) {
      await projectConversationEvent(manager, event, { list: false });
      changed = true;
    }
  }
  await finalizeTimelineRankCheckpoints(manager);
  if (changed) await bumpConversationListRevision(manager);
  return prepared;
}

/**
 * Append a validated local event batch using the caller's existing physical
 * transaction. This is intentionally the only public transaction-composition
 * seam: durable run-state stores use it to commit retry idempotency and both
 * conversation events atomically in the same SQLite transaction.
 */
export async function appendLocalConversationEventsInTransaction(
  manager: EntityManager,
  drafts: readonly ConversationEventDraft[],
): Promise<ConversationEvent[]> {
  assertCanonicalConversationEventDrafts(drafts);
  if (drafts.length > 256) {
    throw eventStoreError('VALIDATION_ERROR', 'local event batch accepts at most 256 drafts');
  }
  return appendLocalConversationEventsWithManager(manager, drafts);
}

/** Validate the complete batch first, then allocate/project all drafts in one transaction. */
export async function appendLocalConversationEventsAtomic(
  dataSource: DataSource,
  drafts: readonly ConversationEventDraft[],
): Promise<ConversationEvent[]> {
  assertCanonicalConversationEventDrafts(drafts);
  if (drafts.length > 256) {
    throw eventStoreError('VALIDATION_ERROR', 'local event batch accepts at most 256 drafts');
  }
  return dataSource.transaction(manager => appendLocalConversationEventsWithManager(manager, drafts));
}

function validateTurnControlRequest(input: {
  conversationId: string;
  turnId: string;
  requestId: string;
}): void {
  for (const [field, value] of Object.entries(input)) {
    if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value, 'utf8') > 512) {
      throw eventStoreError('VALIDATION_ERROR', `invalid turn control ${field}`);
    }
  }
}

export async function appendDeleteTurnTombstoneAtomic(
  dataSource: DataSource,
  request: AgentDeviceRpcDeleteTurnRequest,
  originNodeId: string,
): Promise<ConversationTombstoneEvent> {
  validateTurnControlRequest(request);
  const eventId = `delete-turn:${request.requestId}`;
  return dataSource.transaction(async manager => {
    const existingRow = await manager.getRepository(ConversationEventEntity).findOne({ where: { eventId } });
    if (existingRow) {
      const existing = parseStoredConversationEvent(existingRow.eventJson);
      if (
        existing.kind !== 'tombstone' || existing.conversationId !== request.conversationId ||
        existing.targetTurnId !== request.turnId || existing.reason !== (request.reason ?? 'user-delete')
      ) throw eventStoreError('CONFLICT', `requestId ${request.requestId} was reused`);
      return existing;
    }
    const root = await manager.getRepository(AgentInstanceMessageEntity).findOne({
      where: {
        conversationId: request.conversationId,
        turnId: request.turnId,
        messageId: request.turnId,
        role: 'user',
      },
    });
    if (!root) throw eventStoreError('NOT_FOUND', 'conversation turn was not found');
    const drafts: ConversationEventDraft[] = [{
      kind: 'tombstone',
      eventId,
      conversationId: request.conversationId,
      originNodeId,
      timestamp: Date.now(),
      targetTurnId: request.turnId,
      reason: request.reason ?? 'user-delete',
    }];
    assertCanonicalConversationEventDrafts(drafts);
    const [event] = await appendLocalConversationEventsWithManager(manager, drafts);
    if (!event || event.kind !== 'tombstone') throw eventStoreError('CONFLICT', 'delete turn append failed');
    return event;
  });
}

export async function insertConversationEventsIfAbsent(
  dataSource: DataSource,
  events: readonly ConversationEvent[],
): Promise<void> {
  assertCanonicalConversationEvents(events);
  await dataSource.transaction(async manager => {
    const inserted = await insertRawConversationEventsBatch(manager, events);
    if (inserted.length === 0) return;
    // Metadata creates the owning conversation; tombstones are projected
    // before messages so a tombstone-first and tombstone-late merge converge.
    const priority = (event: ConversationEvent): number => event.kind === 'metadataPatch' ? 0 : event.kind === 'tombstone' ? 1 : 2;
    inserted.sort((left, right) =>
      priority(left) - priority(right) ||
      left.lamportClock - right.lamportClock || compareCodeUnits(left.originNodeId, right.originNodeId) ||
      compareCodeUnits(left.eventId, right.eventId)
    );
    if (inserted.length <= LARGE_REMOTE_PROJECTION_BATCH) {
      for (const event of inserted) await projectConversationEvent(manager, event, { list: false });
    } else {
      // LWW metadata and tombstones are control records and remain cheap to
      // project individually. The high-cardinality message path is bulk-only.
      await insertConversationAttachmentReferences(manager, inserted);
      for (const event of inserted) {
        if (event.kind === 'metadataPatch' || event.kind === 'tombstone' || event.kind === 'loopCheckpoint') {
          await projectConversationEvent(manager, event, { attachments: false, timeline: false, list: false });
        }
      }
      const timelineConversations = await insertMessageProjectionsBatch(manager, inserted);
      for (const event of inserted) {
        if (event.kind === 'tombstone') timelineConversations.add(event.conversationId);
      }
      for (const conversationId of timelineConversations) {
        await rebuildConversationTimelineProjection(manager, conversationId);
      }
    }
    await finalizeTimelineRankCheckpoints(manager);
    await bumpConversationListRevision(manager);
  });
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

/** Maintenance/test hook: raw events remain untouched; derived rows are replayed deterministically. */
export async function rebuildConversationEventProjection(dataSource: DataSource, conversationId: string): Promise<void> {
  await dataSource.transaction(async manager => {
    await manager.getRepository(AgentInstanceMessageEntity).delete({ conversationId });
    await manager.getRepository(ConversationMessageDetailEntity).delete({ conversationId });
    await manager.getRepository(ConversationTurnTombstoneEntity).delete({ conversationId });
    await manager.getRepository(AgentLoopCheckpointEntity).delete({ conversationId });
    await manager.getRepository(ConversationMetadataFieldEntity).delete({ conversationId });
    await manager.getRepository(ConversationAttachmentReferenceEntity).delete({ conversationId });
    await manager.getRepository(ConversationTimelineEntryEntity).delete({ conversationId });
    await manager.getRepository(ConversationTimelineRankCheckpointEntity).delete({ conversationId });
    await manager.getRepository(ConversationTimelineStateEntity).delete({ conversationId });
    const rows = await manager.getRepository(ConversationEventEntity).find({
      where: { conversationId },
      order: { lamportClock: 'ASC', originNodeId: 'ASC', eventId: 'ASC' },
    });
    const events = rows.map(row => parseStoredConversationEvent(row.eventJson));
    const priority = (event: ConversationEvent): number => event.kind === 'metadataPatch' ? 0 : event.kind === 'tombstone' ? 1 : 2;
    events.sort((left, right) =>
      priority(left) - priority(right) ||
      left.lamportClock - right.lamportClock || compareCodeUnits(left.originNodeId, right.originNodeId) ||
      compareCodeUnits(left.eventId, right.eventId)
    );
    await insertConversationAttachmentReferences(manager, events);
    for (const event of events) {
      await projectConversationEvent(manager, event, { attachments: false, timeline: false, list: false });
    }
    await rebuildConversationTimelineProjection(manager, conversationId);
    await bumpConversationListRevision(manager);
  });
}
