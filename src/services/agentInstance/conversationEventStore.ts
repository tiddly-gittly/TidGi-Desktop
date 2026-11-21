/** Atomic event append, merge, and projection rebuild. Transaction ownership stays here or with the caller-supplied manager. */
import { LARGE_REMOTE_PROJECTION_BATCH, REMOTE_PROJECTION_CHUNK_SIZE } from '@/constants/agentStorage';
import { AgentInstanceMessageEntity } from '@services/database/schema/agent';
import {
  AgentLoopCheckpointEntity,
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
import type { AgentDeviceRpcDeleteTurnRequest, ConversationEvent, ConversationEventDraft, ConversationTombstoneEvent } from 'memeloop';
import { assertCanonicalConversationEvent, assertCanonicalConversationEventDraft, assertCanonicalConversationEventDrafts, assertCanonicalConversationEvents } from 'memeloop';
import { DataSource, EntityManager } from 'typeorm';
import { insertConversationAttachmentReferences, insertMessageProjectionsBatch, projectConversationEvent } from './conversationEventProjection';
import {
  bumpConversationListRevision,
  canonicalEventJson,
  canonicalJson,
  compareCodeUnits,
  eventStoreError,
  eventTurnId,
  parseStoredConversationEvent,
} from './conversationStorageUtilities';
import { finalizeTimelineRankCheckpoints, rebuildConversationTimelineProjection } from './conversationTimelineProjection';

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
