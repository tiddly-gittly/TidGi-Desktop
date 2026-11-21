/** Event-to-SQL projections inside the caller-owned transaction. */
import { PERSISTED_MESSAGE_LIST_PROJECTION_BYTES, REMOTE_PROJECTION_CHUNK_SIZE } from '@/constants/agentStorage';
import { AgentDefinitionEntity, AgentInstanceEntity, AgentInstanceMessageEntity } from '@services/database/schema/agent';
import { ConversationBranchEntity } from '@services/database/schema/conversationEditing';
import {
  AgentLoopCheckpointEntity,
  ConversationAttachmentReferenceEntity,
  ConversationMessageDetailEntity,
  ConversationMetadataFieldEntity,
  ConversationTurnTombstoneEntity,
} from '@services/database/schema/conversationEvent';
import { pick } from 'lodash';
import type { ChatMessage, ConversationEvent } from 'memeloop';
import { compareConversationLoopCheckpointEvents, conversationBranchIdentity, conversationEventAttachmentReferences, projectConversationMessageForList } from 'memeloop';
import { EntityManager } from 'typeorm';
import { bumpConversationListRevision, canonicalJson, compareLww, conversationEventProjectionMessage, eventStoreError } from './conversationStorageUtilities';
import { projectTimelineCompaction, projectTimelineMessage, projectTimelineTombstone } from './conversationTimelineProjection';
import { CANONICAL_MESSAGE_FIELDS, projectChatMessageEntity } from './messageEntityProjection';

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

export async function insertConversationAttachmentReferences(
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

export async function projectConversationEvent(
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
  if (message.role === 'user' && message.metadata?.memeloopBranch !== undefined) {
    const identity = conversationBranchIdentity(message);
    await manager.getRepository(ConversationBranchEntity).createQueryBuilder().insert().values([
      {
        ...identity,
        variantConversationId: identity.rootConversationId,
        variantMessageId: identity.rootMessageId,
        createdAt: 0,
      },
      { ...identity, createdAt: message.timestamp },
    ]).orIgnore().execute();
  }
  if (projectTimeline) {
    if (event.kind === 'message') await projectTimelineMessage(manager, event);
    else await projectTimelineCompaction(manager, event);
  }
}

/**
 * Materialize a large immutable event batch without one SELECT/INSERT pair per
 * message. Raw events remain authoritative; this table is a disposable read
 * projection and can therefore be inserted in bounded multi-row statements.
 */
export async function insertMessageProjectionsBatch(
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
