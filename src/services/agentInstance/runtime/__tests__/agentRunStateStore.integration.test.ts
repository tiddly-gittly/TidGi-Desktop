/** @vitest-environment node */
import 'reflect-metadata';

import {
  type AgentFrameworkContext,
  type AgentLoopInput,
  assertAtomicAgentRetryStoreConformance,
  type AtomicAgentRetryInput,
  type ChatMessage,
  type ConversationEvent,
  type ConversationEventDraft,
  conversationEventToMessage,
  type ConversationMessagePayload,
  createMemeLoopRuntime,
  type IAgentStorage,
  type MemeLoopRunState,
  type MemeLoopRuntime,
} from 'memeloop';
import { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentDefinitionEntity, AgentInstanceEntity, AgentInstanceMessageEntity } from '@/services/database/schema/agent';
import {
  AgentRunStateEntity,
  ConversationAttachmentReferenceEntity,
  ConversationEventEntity,
  ConversationEventSequenceEntity,
  ConversationListStateEntity,
  ConversationMessageDetailEntity,
  ConversationMetadataFieldEntity,
  ConversationTimelineEntryEntity,
  ConversationTimelineRankCheckpointEntity,
  ConversationTimelineStateEntity,
  ConversationTurnTombstoneEntity,
} from '@/services/database/schema/conversationEvent';
import { appendLocalConversationEvent } from '../../agentRepository';
import { DesktopAgentRunStateStore } from '../agentRunStateStore';

const ATOMIC_RETRY_ENTITIES = [
  AgentDefinitionEntity,
  AgentInstanceEntity,
  AgentInstanceMessageEntity,
  ConversationAttachmentReferenceEntity,
  AgentRunStateEntity,
  ConversationMessageDetailEntity,
  ConversationEventEntity,
  ConversationEventSequenceEntity,
  ConversationTurnTombstoneEntity,
  ConversationMetadataFieldEntity,
  ConversationListStateEntity,
  ConversationTimelineStateEntity,
  ConversationTimelineEntryEntity,
  ConversationTimelineRankCheckpointEntity,
] as const;

function createRuntimeContext(
  runAgentToolLoop: NonNullable<AgentFrameworkContext['runAgentToolLoop']>,
): AgentFrameworkContext {
  let sequence = 0;
  const storage = {
    getConversationMeta: vi.fn(async (conversationId: string) => ({
      conversationId,
      title: 'Conversation',
      definitionId: 'definition-1',
      lastMessagePreview: '',
      lastMessageTimestamp: 0,
      messageCount: 0,
      originNodeId: 'peer-desktop',
      originClock: sequence,
      isUserInitiated: true,
    })),
    appendLocalEvent: vi.fn(async (draft: ConversationEventDraft): Promise<ConversationEvent> => {
      sequence += 1;
      return { ...draft, originSequence: sequence, lamportClock: sequence };
    }),
  } as unknown as IAgentStorage;
  return {
    storage,
    localNodeId: 'peer-desktop',
    llmProvider: { name: 'test', chat: vi.fn().mockResolvedValue('') },
    tools: { registerTool: vi.fn(), getTool: vi.fn(), listTools: vi.fn().mockReturnValue([]) },
    syncAdapters: [],
    network: { start: vi.fn(), stop: vi.fn() },
    runAgentToolLoop,
  };
}

async function waitForState(runtime: MemeLoopRuntime, runId: string, state: MemeLoopRunState): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if ((await runtime.getRunStatus(runId))?.state === state) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error(`Run ${runId} did not reach ${state}`);
}

describe('DesktopAgentRunStateStore', () => {
  let dataSource: DataSource;
  let store: DesktopAgentRunStateStore;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AgentRunStateEntity],
      synchronize: true,
    });
    await dataSource.initialize();
    store = new DesktopAgentRunStateStore(dataSource);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('drives a real Core run from acceptance to a durable terminal state', async () => {
    const executed = vi.fn();
    const runtime = createMemeLoopRuntime(
      createRuntimeContext(async function*(input: AgentLoopInput) {
        executed(input.persistedUserMessage?.content);
        yield { type: 'thinking', data: 'done' };
      }),
      { runStateStore: store },
    );

    const handle = await runtime.sendMessage({
      conversationId: 'conversation-complete',
      definitionId: 'definition-1',
      message: 'hello',
      requestPeerId: 'peer-remote',
      requestId: 'request-complete',
      turnId: 'turn-complete',
    });

    expect(handle.state).toBe('accepted');
    await waitForState(runtime, handle.runId, 'completed');
    expect(executed).toHaveBeenCalledWith('hello');
    expect((await new DesktopAgentRunStateStore(dataSource).get(handle.runId))?.state).toBe('completed');
    await runtime.dispose();
  });

  it('persists cancellation and never allows a late generator completion to overwrite it', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const runtime = createMemeLoopRuntime(
      createRuntimeContext(async function*() {
        await gate;
        yield { type: 'thinking', data: 'late' };
      }),
      { runStateStore: store },
    );
    const handle = await runtime.sendMessage({
      conversationId: 'conversation-cancel',
      definitionId: 'definition-1',
      message: 'wait',
      requestPeerId: 'peer-remote',
      requestId: 'request-cancel',
      turnId: 'turn-cancel',
    });

    await waitForState(runtime, handle.runId, 'running');
    await expect(runtime.cancelRun(handle.runId)).resolves.toBe(true);
    release();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect((await store.get(handle.runId))?.state).toBe('cancelled');
    await runtime.dispose();
  });

  it('marks an active record interrupted when a new Core runtime opens the same store', async () => {
    const now = Date.now();
    await store.createOrGet({
      runId: 'run-before-restart',
      conversationId: 'conversation-restart',
      definitionId: 'definition-1',
      turnId: 'turn-before-restart',
      requestPeerId: 'peer-remote',
      requestId: 'request-before-restart',
      payloadDigest: 'a'.repeat(64),
      state: 'running',
      acceptedAt: now - 2,
      startedAt: now - 1,
      updatedAt: now - 1,
    });

    const runtime = createMemeLoopRuntime(createRuntimeContext(async function*() {}), { runStateStore: store });
    await expect(runtime.getRunStatus('run-before-restart')).resolves.toMatchObject({
      state: 'failed',
      error: { code: 'INTERRUPTED', retryable: true },
    });
    expect((await store.get('run-before-restart'))?.finishedAt).toEqual(expect.any(Number));
    await runtime.dispose();
  });

  it('deduplicates a stable request and rejects payload drift', async () => {
    const now = Date.now();
    const record = {
      runId: 'run-idempotent',
      conversationId: 'conversation-idempotent',
      definitionId: 'definition-1',
      turnId: 'turn-idempotent',
      requestPeerId: 'peer-remote',
      requestId: 'request-idempotent',
      payloadDigest: 'b'.repeat(64),
      state: 'accepted' as const,
      acceptedAt: now,
      updatedAt: now,
    };
    await expect(store.createOrGet(record)).resolves.toMatchObject(record);
    await expect(store.createOrGet({ ...record, runId: 'run-replayed' })).resolves.toMatchObject({ runId: record.runId });
    await expect(store.createOrGet({ ...record, payloadDigest: 'c'.repeat(64) })).rejects.toThrow('payload drift');
  });
});

describe('DesktopAgentRunStateStore atomic retry', () => {
  let dataSource: DataSource;
  let store: DesktopAgentRunStateStore;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [...ATOMIC_RETRY_ENTITIES],
      synchronize: true,
    });
    await dataSource.initialize();
    store = new DesktopAgentRunStateStore(dataSource);
    await dataSource.getRepository(AgentDefinitionEntity).save({
      id: 'definition-atomic-retry',
      name: 'Atomic retry',
      description: '',
      systemPrompt: '',
      tools: [],
      version: '1.0.0',
      revision: 0,
      totalMessages: 0,
      totalTurns: 0,
      totalEntries: 0,
      lastMessagePreview: '',
      lastMessageTimestamp: 0,
    });
    await dataSource.getRepository(AgentInstanceEntity).save({
      id: 'conversation-atomic-retry',
      agentDefId: 'definition-atomic-retry',
      name: 'Atomic retry',
      status: { state: 'completed' },
      closed: false,
      volatile: false,
    });
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('commits idempotency and the complete structured retry event pair in one transaction', async () => {
    const source = await appendSourceUserMessage(dataSource);
    const input = createAtomicRetryInput(source);

    const first = await assertAtomicAgentRetryStoreConformance(store, input);

    expect(first.created).toBe(true);
    expect(first.userEvent.message).toEqual(input.replacementPayload);
    expect(await dataSource.getRepository(AgentRunStateEntity).count()).toBe(1);
    expect(await dataSource.getRepository(ConversationEventEntity).count()).toBe(3);
    expect(
      await dataSource.getRepository(ConversationTurnTombstoneEntity).findOneBy({
        conversationId: source.conversationId,
        turnId: source.turnId,
      }),
    ).toMatchObject({ eventId: `tombstone:retry:${input.candidateRun.runId}` });
    expect(
      await dataSource.getRepository(ConversationMessageDetailEntity).findOneBy({
        conversationId: source.conversationId,
        messageId: input.candidateRun.turnId,
      }),
    ).toMatchObject({ turnId: input.candidateRun.turnId });
  });

  it('rejects source drift before creating the durable run or retry events', async () => {
    const source = await appendSourceUserMessage(dataSource);
    const input = createAtomicRetryInput(source);
    const drifted: AtomicAgentRetryInput = {
      ...input,
      mode: 'fresh',
      expectedSourceMessage: { ...source, content: 'untrusted stale UI text' },
    };

    await expect(store.retryTurnAtomic(drifted)).rejects.toThrow('atomic_agent_retry_source_drift');
    expect(await dataSource.getRepository(AgentRunStateEntity).count()).toBe(0);
    expect(await dataSource.getRepository(ConversationEventEntity).count()).toBe(1);
  });

  it('rolls back the run row when conversation event projection fails after insertion', async () => {
    const source = await appendSourceUserMessage(dataSource);
    const input = createAtomicRetryInput(source);
    await appendLocalConversationEvent(dataSource, {
      kind: 'message',
      eventId: input.candidateRun.turnId,
      conversationId: source.conversationId,
      originNodeId: 'peer-conflict',
      timestamp: source.timestamp + 10,
      message: {
        messageId: input.candidateRun.turnId,
        turnId: input.candidateRun.turnId,
        role: 'user',
        content: 'conflicting durable event',
      },
    });

    await expect(store.retryTurnAtomic(input)).rejects.toThrow('already exists with a different payload');
    expect(await dataSource.getRepository(AgentRunStateEntity).count()).toBe(0);
    expect(
      await dataSource.getRepository(ConversationEventEntity).findOneBy({
        eventId: `tombstone:retry:${input.candidateRun.runId}`,
      }),
    ).toBeNull();
    expect(await dataSource.getRepository(ConversationEventEntity).count()).toBe(2);
  });

  it('fails closed when a replay has no durable peer/request row', async () => {
    const source = await appendSourceUserMessage(dataSource);
    const { expectedSourceMessage: _expectedSourceMessage, ...base } = createAtomicRetryInput(source);

    await expect(store.retryTurnAtomic({ ...base, mode: 'replay' })).rejects.toThrow(
      'atomic_agent_retry_replay_not_found',
    );
    expect(await dataSource.getRepository(AgentRunStateEntity).count()).toBe(0);
  });
});

async function appendSourceUserMessage(dataSource: DataSource): Promise<ChatMessage> {
  const event = await appendLocalConversationEvent(dataSource, {
    kind: 'message',
    eventId: 'turn-source',
    conversationId: 'conversation-atomic-retry',
    originNodeId: 'peer-source',
    timestamp: 1_000,
    message: {
      messageId: 'turn-source',
      turnId: 'turn-source',
      role: 'user',
      content: 'retry me',
      parts: [
        { type: 'text', text: 'retry me' },
        {
          type: 'attachment',
          attachment: {
            contentHash: `sha256:${'a'.repeat(64)}`,
            filename: 'context.txt',
            mimeType: 'text/plain',
            size: 42,
          },
        },
      ],
      attachments: [{
        contentHash: `sha256:${'a'.repeat(64)}`,
        filename: 'context.txt',
        mimeType: 'text/plain',
        size: 42,
      }],
      contentType: 'text/plain',
      metadata: { nested: { source: 'durable' }, tags: ['one', 'two'] },
    },
  });
  if (event.kind !== 'message') throw new Error('source event was not a message');
  return conversationEventToMessage(event);
}

function createAtomicRetryInput(source: ChatMessage): AtomicAgentRetryInput & { mode: 'fresh' } {
  const {
    messageId: _messageId,
    turnId: _turnId,
    conversationId: _conversationId,
    originNodeId: _originNodeId,
    originSequence: _originSequence,
    timestamp: _timestamp,
    lamportClock: _lamportClock,
    ...sourcePayload
  } = source;
  const replacementPayload: ConversationMessagePayload = {
    ...sourcePayload,
    messageId: 'turn-retry',
    turnId: 'turn-retry',
  };
  return {
    mode: 'fresh',
    candidateRun: {
      runId: 'run-retry',
      conversationId: source.conversationId,
      definitionId: 'definition-atomic-retry',
      turnId: 'turn-retry',
      retrySourceTurnId: source.turnId,
      requestPeerId: 'peer-requester',
      requestId: 'request-retry',
      payloadDigest: 'd'.repeat(64),
      state: 'accepted',
      acceptedAt: 2_000,
      updatedAt: 2_000,
    },
    sourceTurnId: source.turnId,
    expectedSourceMessage: source,
    replacementPayload,
    originNodeId: 'peer-desktop',
  };
}
