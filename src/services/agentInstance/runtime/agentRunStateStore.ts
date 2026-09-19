import {
  type AgentRunRecord,
  AgentRunRequestConflictError,
  type AgentRunState,
  assertAgentRunError,
  assertAtomicAgentRetryResult,
  assertAtomicAgentRetrySourceMessage,
  assertCanonicalChatMessageProjection,
  assertCanonicalConversationEvent,
  type AtomicAgentRetryInput,
  type AtomicAgentRetryResult,
  type AtomicAgentRetryStore,
  canonicalConversationEventBytes,
  canonicalJsonBytes,
  type ChatMessage,
  type ConversationEvent,
  conversationEventToMessage,
  type ConversationMessagePayload,
  createAtomicAgentRetryEventDrafts,
} from 'memeloop';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import { In, LessThan } from 'typeorm';

import { appendLocalConversationEventsInTransaction } from '@/services/agentInstance/agentRepository';
import { AgentRunStateEntity, ConversationEventEntity } from '@/services/database/schema/conversationEvent';

const ACTIVE_STATES: readonly AgentRunState[] = ['accepted', 'queued', 'running'];
const TERMINAL_STATES: readonly AgentRunState[] = ['completed', 'failed', 'cancelled'];
const LEGAL_NEXT: Readonly<Record<'accepted' | 'queued' | 'running', readonly AgentRunState[]>> = {
  accepted: ['queued', 'failed', 'cancelled'],
  queued: ['running', 'failed', 'cancelled'],
  running: ['completed', 'failed', 'cancelled'],
};

/** TypeORM/SQLite implementation of Core's durable run idempotency port. */
export class DesktopAgentRunStateStore implements AtomicAgentRetryStore {
  public constructor(private readonly dataSource: DataSource) {}

  public async createOrGet(input: AgentRunRecord): Promise<AgentRunRecord> {
    const record = normalizeRecord(input);
    return this.dataSource.transaction(async manager => (await createOrGetWithManager(manager, record)).run);
  }

  public async get(runId: string): Promise<AgentRunRecord | undefined> {
    assertIdentifier(runId, 'runId');
    const entity = await this.repository().findOneBy({ runId });
    return entity ? fromEntity(entity) : undefined;
  }

  public async getByTurn(
    conversationId: string,
    turnId: string,
    requestPeerId: string,
  ): Promise<AgentRunRecord | undefined> {
    assertIdentifier(conversationId, 'conversationId');
    assertIdentifier(turnId, 'turnId');
    assertIdentifier(requestPeerId, 'requestPeerId');
    const entity = await this.repository().findOne({
      where: { conversationId, turnId, requestPeerId },
      order: { acceptedAt: 'DESC', runId: 'DESC' },
    });
    return entity ? fromEntity(entity) : undefined;
  }

  public async getByRequest(requestPeerId: string, requestId: string): Promise<AgentRunRecord | undefined> {
    assertIdentifier(requestPeerId, 'requestPeerId');
    assertIdentifier(requestId, 'requestId');
    const entity = await this.repository().findOneBy({ requestPeerId, requestId });
    return entity ? fromEntity(entity) : undefined;
  }

  /**
   * Commit retry request idempotency, the old-turn tombstone, and the cloned
   * user root in one physical SQLite transaction. No process-local lock is
   * involved; replay is proven by the unique peer/request row and canonical
   * append-only events.
   */
  public async retryTurnAtomic(input: AtomicAgentRetryInput): Promise<AtomicAgentRetryResult> {
    const candidateRun = normalizeAtomicRetryCandidate(input);
    const originNodeId = assertIdentifier(input.originNodeId, 'originNodeId');
    return this.dataSource.transaction(async manager => {
      const existingEntity = await findRequestOrRun(manager, candidateRun);
      if (existingEntity) {
        const run = assertMatchingRequest(existingEntity, candidateRun);
        return readPersistedRetryResult(manager, input, run);
      }
      if (input.mode !== 'fresh') throw new Error('atomic_agent_retry_replay_not_found');

      const source = await readCanonicalSourceMessage(
        manager,
        candidateRun.conversationId,
        input.sourceTurnId,
      );
      assertAtomicAgentRetrySourceMessage(input.expectedSourceMessage, source);
      assertRetryReplacementPayload(source, candidateRun.turnId, input.replacementPayload);

      const created = await createOrGetWithManager(manager, candidateRun);
      if (!created.created) {
        return readPersistedRetryResult(manager, input, created.run);
      }
      const drafts = createAtomicAgentRetryEventDrafts(created.run, {
        sourceTurnId: input.sourceTurnId,
        replacementPayload: input.replacementPayload,
        originNodeId,
      });
      const [tombstone, userEvent] = await appendLocalConversationEventsInTransaction(manager, drafts);
      if (tombstone?.kind !== 'tombstone' || userEvent?.kind !== 'message') {
        throw new Error('atomic_agent_retry_append_failed');
      }
      const result: AtomicAgentRetryResult = {
        run: created.run,
        created: true,
        tombstone,
        userEvent,
      };
      assertAtomicAgentRetryResult(input, result);
      return result;
    });
  }

  public async transition(
    runId: string,
    expectedStates: readonly AgentRunState[],
    input: AgentRunRecord,
  ): Promise<boolean> {
    assertIdentifier(runId, 'runId');
    if (expectedStates.length === 0 || expectedStates.some(state => !isRunState(state))) {
      throw new TypeError('invalid expected agent run states');
    }
    const next = normalizeRecord(input);
    if (next.runId !== runId) throw new Error('agent_run_immutable_identity_changed');
    return this.dataSource.transaction(async manager => {
      const repository = manager.getRepository(AgentRunStateEntity);
      const existing = await repository.findOneBy({ runId });
      if (!existing || !expectedStates.includes(existing.state)) return false;
      assertImmutableIdentity(existing, next);
      if (TERMINAL_STATES.includes(existing.state)) return false;
      const activeState = existing.state as keyof typeof LEGAL_NEXT;
      if (!LEGAL_NEXT[activeState].includes(next.state)) return false;
      const result = await manager.update(
        AgentRunStateEntity,
        { runId, state: In([...expectedStates]) },
        toEntity(next),
      );
      return result.affected === 1;
    });
  }

  public async listActive(): Promise<AgentRunRecord[]> {
    const entities = await this.repository().find({
      where: { state: In([...ACTIVE_STATES]) },
      order: { acceptedAt: 'ASC', runId: 'ASC' },
      take: 1024,
    });
    return entities.map(fromEntity);
  }

  public async prune(options: { finishedBefore: number; maxRecords: number }): Promise<void> {
    if (!Number.isSafeInteger(options.finishedBefore) || options.finishedBefore < 0) {
      throw new TypeError('invalid agent run prune timestamp');
    }
    if (!Number.isSafeInteger(options.maxRecords) || options.maxRecords < 1 || options.maxRecords > 100_000) {
      throw new TypeError('invalid agent run prune record limit');
    }
    await this.dataSource.transaction(async manager => {
      const repository = manager.getRepository(AgentRunStateEntity);
      await repository.delete({ finishedAt: LessThan(options.finishedBefore) });
      for (;;) {
        const count = await repository.count();
        const excess = count - options.maxRecords;
        if (excess <= 0) break;
        const rows = await repository.find({
          select: { runId: true },
          where: { state: In([...TERMINAL_STATES]) },
          order: { updatedAt: 'ASC', runId: 'ASC' },
          take: Math.min(excess, 256),
        });
        if (rows.length === 0) break;
        await repository.delete({ runId: In(rows.map(row => row.runId)) });
      }
    });
  }

  private repository(manager?: EntityManager): Repository<AgentRunStateEntity> {
    return (manager ?? this.dataSource.manager).getRepository(AgentRunStateEntity);
  }
}

async function findRequestOrRun(
  manager: EntityManager,
  record: AgentRunRecord,
): Promise<AgentRunStateEntity | null> {
  return manager.getRepository(AgentRunStateEntity).findOne({
    where: [
      { requestPeerId: record.requestPeerId, requestId: record.requestId },
      { runId: record.runId },
    ],
  });
}

async function createOrGetWithManager(
  manager: EntityManager,
  record: AgentRunRecord,
): Promise<{ run: AgentRunRecord; created: boolean }> {
  const existing = await findRequestOrRun(manager, record);
  if (existing) return { run: assertMatchingRequest(existing, record), created: false };

  await manager.createQueryBuilder()
    .insert()
    .into(AgentRunStateEntity)
    .values(toEntity(record))
    .orIgnore()
    .execute();
  const [changeRow] = await manager.query<Array<{ changes: number }>>('SELECT changes() AS changes');
  const persisted = await findRequestOrRun(manager, record);
  if (!persisted) throw new Error('agent_run_state_insert_failed');
  return {
    run: assertMatchingRequest(persisted, record),
    created: changeRow?.changes === 1,
  };
}

function normalizeAtomicRetryCandidate(input: AtomicAgentRetryInput): AgentRunRecord {
  const record = normalizeRecord(input.candidateRun);
  const sourceTurnId = assertIdentifier(input.sourceTurnId, 'retrySourceTurnId');
  if (
    record.state !== 'accepted' ||
    record.retrySourceTurnId !== sourceTurnId ||
    record.turnId === sourceTurnId ||
    record.startedAt !== undefined ||
    record.finishedAt !== undefined ||
    record.cancelRequestedAt !== undefined ||
    record.error !== undefined
  ) throw new Error('atomic_agent_retry_invalid_candidate');
  if (
    input.replacementPayload.messageId !== record.turnId ||
    input.replacementPayload.turnId !== record.turnId ||
    input.replacementPayload.role !== 'user'
  ) throw new Error('atomic_agent_retry_identity');
  return record;
}

async function readCanonicalSourceMessage(
  manager: EntityManager,
  conversationId: string,
  sourceTurnId: string,
): Promise<ChatMessage> {
  const row = await manager.getRepository(ConversationEventEntity).findOne({
    where: { conversationId, eventId: sourceTurnId },
  });
  if (!row) throw new Error('atomic_agent_retry_source_not_found');
  const event = parseStoredConversationEvent(row);
  if (
    event.kind !== 'message' ||
    event.message.messageId !== sourceTurnId ||
    event.message.turnId !== sourceTurnId ||
    event.message.role !== 'user'
  ) throw new Error('atomic_agent_retry_source_not_found');
  const value = conversationEventToMessage(event);
  assertCanonicalChatMessageProjection(value, conversationId);
  return value;
}

function assertRetryReplacementPayload(
  source: ChatMessage,
  newTurnId: string,
  replacement: ConversationMessagePayload,
): void {
  const {
    messageId: _messageId,
    turnId: _turnId,
    conversationId: _conversationId,
    originNodeId: _originNodeId,
    originSequence: _originSequence,
    timestamp: _timestamp,
    lamportClock: _lamportClock,
    ...payload
  } = source;
  const expected: ConversationMessagePayload = {
    ...payload,
    messageId: newTurnId,
    turnId: newTurnId,
  };
  if (!bytesEqual(canonicalJsonBytes(expected), canonicalJsonBytes(replacement))) {
    throw new Error('atomic_agent_retry_replacement_drift');
  }
}

async function readPersistedRetryResult(
  manager: EntityManager,
  input: AtomicAgentRetryInput,
  run: AgentRunRecord,
): Promise<AtomicAgentRetryResult> {
  const rows = await manager.getRepository(ConversationEventEntity).find({
    where: { eventId: In([`tombstone:retry:${run.runId}`, run.turnId]) },
  });
  if (rows.length !== 2) throw new Error('atomic_agent_retry_partial_transaction');
  const events = rows.map(parseStoredConversationEvent);
  const tombstone = events.find(event => event.kind === 'tombstone');
  const userEvent = events.find(event => event.kind === 'message');
  if (!tombstone || !userEvent) throw new Error('atomic_agent_retry_partial_transaction');
  const result: AtomicAgentRetryResult = {
    run,
    created: false,
    tombstone,
    userEvent,
  };
  assertAtomicAgentRetryResult(input, result);
  if (
    tombstone.originNodeId !== input.originNodeId ||
    userEvent.originNodeId !== input.originNodeId ||
    tombstone.timestamp !== run.acceptedAt ||
    userEvent.timestamp !== run.acceptedAt + 1
  ) throw new Error('atomic_agent_retry_event_correlation');
  return result;
}

function parseStoredConversationEvent(row: ConversationEventEntity): ConversationEvent {
  let event: unknown;
  try {
    event = JSON.parse(row.eventJson);
    assertCanonicalConversationEvent(event);
  } catch (error) {
    throw new Error('atomic_agent_retry_event_corrupt', { cause: error });
  }
  if (!bytesEqual(Buffer.from(row.eventJson, 'utf8'), canonicalConversationEventBytes(event))) {
    throw new Error('atomic_agent_retry_event_not_canonical');
  }
  return event;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function assertMatchingRequest(entity: AgentRunStateEntity, requested: AgentRunRecord): AgentRunRecord {
  if (entity.requestPeerId !== requested.requestPeerId || entity.requestId !== requested.requestId) {
    throw new Error('agent_run_id_collision');
  }
  if (entity.payloadDigest !== requested.payloadDigest) {
    throw new AgentRunRequestConflictError(requested.requestPeerId, requested.requestId);
  }
  return fromEntity(entity);
}

function assertImmutableIdentity(entity: AgentRunStateEntity, next: AgentRunRecord): void {
  if (
    entity.runId !== next.runId || entity.requestPeerId !== next.requestPeerId ||
    entity.requestId !== next.requestId || entity.payloadDigest !== next.payloadDigest ||
    entity.conversationId !== next.conversationId || entity.definitionId !== next.definitionId ||
    entity.turnId !== next.turnId || (entity.retrySourceTurnId ?? undefined) !== next.retrySourceTurnId ||
    entity.acceptedAt !== next.acceptedAt
  ) throw new Error('agent_run_immutable_identity_changed');
}

function normalizeRecord(input: AgentRunRecord): AgentRunRecord {
  const record: AgentRunRecord = {
    runId: assertIdentifier(input.runId, 'runId'),
    conversationId: assertIdentifier(input.conversationId, 'conversationId'),
    definitionId: assertIdentifier(input.definitionId, 'definitionId'),
    turnId: assertIdentifier(input.turnId, 'turnId'),
    ...(input.retrySourceTurnId === undefined
      ? {}
      : { retrySourceTurnId: assertIdentifier(input.retrySourceTurnId, 'retrySourceTurnId') }),
    requestPeerId: assertIdentifier(input.requestPeerId, 'requestPeerId'),
    requestId: assertIdentifier(input.requestId, 'requestId'),
    payloadDigest: assertDigest(input.payloadDigest),
    state: assertRunState(input.state),
    acceptedAt: assertTimestamp(input.acceptedAt, 'acceptedAt'),
    updatedAt: assertTimestamp(input.updatedAt, 'updatedAt'),
    ...(input.startedAt === undefined ? {} : { startedAt: assertTimestamp(input.startedAt, 'startedAt') }),
    ...(input.finishedAt === undefined ? {} : { finishedAt: assertTimestamp(input.finishedAt, 'finishedAt') }),
    ...(input.cancelRequestedAt === undefined
      ? {}
      : { cancelRequestedAt: assertTimestamp(input.cancelRequestedAt, 'cancelRequestedAt') }),
    ...(input.error === undefined ? {} : { error: cloneError(input.error) }),
  };
  if (record.updatedAt < record.acceptedAt) throw new TypeError('agent run updatedAt predates acceptedAt');
  if (record.startedAt !== undefined && record.startedAt < record.acceptedAt) throw new TypeError('agent run startedAt predates acceptedAt');
  if (record.finishedAt !== undefined && record.finishedAt < record.acceptedAt) throw new TypeError('agent run finishedAt predates acceptedAt');
  return record;
}

function toEntity(record: AgentRunRecord): AgentRunStateEntity {
  return Object.assign(new AgentRunStateEntity(), record);
}

function fromEntity(entity: AgentRunStateEntity): AgentRunRecord {
  return normalizeRecord({
    runId: entity.runId,
    conversationId: entity.conversationId,
    definitionId: entity.definitionId,
    turnId: entity.turnId,
    ...(entity.retrySourceTurnId === null || entity.retrySourceTurnId === undefined
      ? {}
      : { retrySourceTurnId: entity.retrySourceTurnId }),
    requestPeerId: entity.requestPeerId,
    requestId: entity.requestId,
    payloadDigest: entity.payloadDigest,
    state: entity.state,
    acceptedAt: entity.acceptedAt,
    updatedAt: entity.updatedAt,
    ...(entity.startedAt === null || entity.startedAt === undefined ? {} : { startedAt: entity.startedAt }),
    ...(entity.finishedAt === null || entity.finishedAt === undefined ? {} : { finishedAt: entity.finishedAt }),
    ...(entity.cancelRequestedAt === null || entity.cancelRequestedAt === undefined
      ? {}
      : { cancelRequestedAt: entity.cancelRequestedAt }),
    ...(entity.error === null || entity.error === undefined ? {} : { error: entity.error }),
  });
}

function assertIdentifier(value: string, field: string): string {
  if (typeof value !== 'string' || value.length < 1 || Buffer.byteLength(value, 'utf8') > 512 || containsAsciiControl(value)) {
    throw new TypeError(`invalid agent run ${field}`);
  }
  return value;
}

function containsAsciiControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function assertDigest(value: string): string {
  if (!/^[0-9a-f]{64}$/u.test(value)) throw new TypeError('invalid agent run payloadDigest');
  return value;
}

function isRunState(value: unknown): value is AgentRunState {
  return [...ACTIVE_STATES, ...TERMINAL_STATES].includes(value as AgentRunState);
}

function assertRunState(value: AgentRunState): AgentRunState {
  if (!isRunState(value)) throw new TypeError('invalid agent run state');
  return value;
}

function assertTimestamp(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`invalid agent run ${field}`);
  return value;
}

function cloneError(value: AgentRunRecord['error']): NonNullable<AgentRunRecord['error']> {
  assertAgentRunError(value);
  return structuredClone(value);
}
