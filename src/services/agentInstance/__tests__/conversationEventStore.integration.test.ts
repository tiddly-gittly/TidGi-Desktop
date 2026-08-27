/** @vitest-environment node */
import 'reflect-metadata';

import { assertConversationTimelinePage, canonicalJsonBytes, MAX_CONVERSATION_EVENT_BYTES } from 'memeloop';
import type { ConversationEvent, ConversationEventDraft } from 'memeloop';
import { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentDefinitionEntity, AgentInstanceEntity, AgentInstanceMessageEntity } from '@services/database/schema/agent';
import {
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
} from '@services/database/schema/conversationEvent';
import {
  appendDeleteTurnTombstoneAtomic,
  appendLocalConversationEvent,
  appendLocalConversationEventsAtomic,
  conversationReferencesAttachment,
  getConversationEventPage,
  getConversationTimelinePage,
  getEventVersionFrontiers,
  getMessage,
  getMessageIdentity,
  getMessagePage,
  getMessageWindowAround,
  getRetainedCompactionControls,
  getTurnDetail,
  insertConversationEventsIfAbsent,
  readMessageDetailRange,
  rebuildConversationEventProjection,
} from '../agentRepository';

const entities = [
  AgentDefinitionEntity,
  AgentInstanceEntity,
  AgentInstanceMessageEntity,
  ConversationAttachmentReferenceEntity,
  ConversationEventEntity,
  ConversationEventSequenceEntity,
  ConversationListStateEntity,
  ConversationMessageDetailEntity,
  ConversationTurnTombstoneEntity,
  ConversationMetadataFieldEntity,
  ConversationTimelineStateEntity,
  ConversationTimelineEntryEntity,
  ConversationTimelineRankCheckpointEntity,
];

function messageEvent(input: {
  eventId: string;
  conversationId?: string;
  originNodeId: string;
  originSequence: number;
  lamportClock: number;
  turnId?: string;
  role?: 'user' | 'assistant';
  content?: string;
}): ConversationEvent {
  const conversationId = input.conversationId ?? 'conversation';
  const turnId = input.turnId ?? input.eventId;
  return {
    kind: 'message',
    eventId: input.eventId,
    conversationId,
    originNodeId: input.originNodeId,
    originSequence: input.originSequence,
    lamportClock: input.lamportClock,
    timestamp: input.lamportClock,
    message: {
      messageId: input.eventId,
      turnId,
      role: input.role ?? 'user',
      content: input.content ?? input.eventId,
    },
  };
}

describe('Desktop canonical conversation event store', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities,
      synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.getRepository(AgentDefinitionEntity).save({
      id: 'definition',
      name: 'Definition',
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    await appendLocalConversationEvent(dataSource, {
      kind: 'metadataPatch',
      eventId: 'metadata:create',
      conversationId: 'conversation',
      originNodeId: 'desktop',
      timestamp: 1,
      patch: { definitionId: 'definition', title: 'Conversation', isUserInitiated: true },
    });
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('atomically allocates local origin sequence and Lamport identity', async () => {
    const event = await appendLocalConversationEvent(dataSource, {
      kind: 'message',
      eventId: 'local-user',
      conversationId: 'conversation',
      originNodeId: 'desktop',
      timestamp: 2,
      message: { messageId: 'local-user', turnId: 'local-user', role: 'user', content: 'hello' },
    });
    expect(event).toMatchObject({ originSequence: 2, lamportClock: 2 });
    const messageRepository = dataSource.getRepository(AgentInstanceMessageEntity);
    const pointRead = await getMessage(messageRepository, 'local-user');
    expect(Object.getPrototypeOf(pointRead)).toBe(Object.prototype);
    expect(pointRead).not.toHaveProperty('hidden');
    expect(() => canonicalJsonBytes(pointRead)).not.toThrow();
    expect(pointRead).toEqual(expect.objectContaining({
      messageId: 'local-user',
      turnId: 'local-user',
      originSequence: 2,
      lamportClock: 2,
    }));
    await messageRepository.insert({
      messageId: 'projection-only',
      conversationId: 'conversation',
      originNodeId: 'desktop',
      originSequence: 999,
      turnId: 'projection-only',
      timestamp: 999,
      lamportClock: 999,
      role: 'user',
      content: 'orphaned projection',
    });
    await expect(getMessage(messageRepository, 'projection-only')).rejects.toThrow(
      'message projection projection-only has no authoritative event',
    );
    await messageRepository.delete({ messageId: 'projection-only' });
    const page = await getMessagePage(messageRepository, 'conversation', { limit: 20, maxBytes: 64 * 1024 });
    if (page.reset) throw new Error('unexpected reset');
    expect(page.items).toEqual([expect.objectContaining({
      messageId: 'local-user',
      turnId: 'local-user',
      originSequence: 2,
      lamportClock: 2,
    })]);
    await expect(getEventVersionFrontiers(dataSource, ['conversation'])).resolves.toEqual([
      { conversationId: 'conversation', originNodeId: 'desktop', maxContiguousOriginSequence: 2 },
    ]);
  });

  it('does not let a coverage-only checkpoint discard retained semantic summaries', async () => {
    await insertConversationEventsIfAbsent(dataSource, [
      {
        kind: 'compaction',
        mode: 'summary',
        eventId: 'summary-a',
        conversationId: 'conversation',
        originNodeId: 'summary-device-a',
        originSequence: 1,
        lamportClock: 10,
        timestamp: 10,
        boundary: {
          version: 2,
          coveredVersion: { 'messages-a': 10 },
          coveredMessageCountByOrigin: { 'messages-a': 10 },
          coveredUserTurnCountByOrigin: { 'messages-a': 5 },
          droppedMessageCount: 10,
          droppedTurnCount: 5,
        },
        summary: { turnId: 'summary-turn-a', content: 'semantic summary from device A' },
      },
      {
        kind: 'compaction',
        mode: 'summary',
        eventId: 'summary-b',
        conversationId: 'conversation',
        originNodeId: 'summary-device-b',
        originSequence: 1,
        lamportClock: 11,
        timestamp: 11,
        boundary: {
          version: 2,
          coveredVersion: { 'messages-b': 12 },
          coveredMessageCountByOrigin: { 'messages-b': 12 },
          coveredUserTurnCountByOrigin: { 'messages-b': 6 },
          droppedMessageCount: 12,
          droppedTurnCount: 6,
        },
        summary: { turnId: 'summary-turn-b', content: 'semantic summary from device B' },
      },
      {
        kind: 'compaction',
        mode: 'coverage-only',
        eventId: 'coverage-checkpoint',
        conversationId: 'conversation',
        originNodeId: 'checkpoint-device',
        originSequence: 1,
        lamportClock: 12,
        timestamp: 12,
        boundary: {
          version: 2,
          coveredVersion: { 'messages-a': 10, 'messages-b': 12 },
          coveredMessageCountByOrigin: { 'messages-a': 10, 'messages-b': 12 },
          coveredUserTurnCountByOrigin: { 'messages-a': 5, 'messages-b': 6 },
          droppedMessageCount: 22,
          droppedTurnCount: 11,
        },
        summary: null,
      },
    ]);

    const retained = await getRetainedCompactionControls(dataSource, 'conversation', {
      limit: 32,
      maxBytes: 256 * 1024,
    });
    expect(retained.items.map(event => event.eventId).sort()).toEqual([
      'coverage-checkpoint',
      'summary-a',
      'summary-b',
    ]);
    expect(
      retained.items
        .filter(event => event.mode === 'summary')
        .map(event => event.summary.content)
        .sort(),
    ).toEqual(['semantic summary from device A', 'semantic summary from device B']);
  });

  it('authorizes only attachment hashes referenced by the requested conversation', async () => {
    const legacyHash = `sha256:${'a'.repeat(64)}`;
    const partHash = `sha256:${'b'.repeat(64)}`;
    await appendLocalConversationEvent(dataSource, {
      kind: 'message',
      eventId: 'attachment-message',
      conversationId: 'conversation',
      originNodeId: 'desktop',
      timestamp: 2,
      message: {
        messageId: 'attachment-message',
        turnId: 'attachment-message',
        role: 'user',
        content: 'attachments',
        attachments: [{ contentHash: legacyHash, filename: 'legacy.txt', mimeType: 'text/plain', size: 1 }],
        parts: [{
          type: 'attachment',
          attachment: { contentHash: partHash, filename: 'part.txt', mimeType: 'text/plain', size: 1 },
        }],
      },
    });
    await expect(conversationReferencesAttachment(dataSource, 'conversation', legacyHash)).resolves.toBe(true);
    await expect(conversationReferencesAttachment(dataSource, 'conversation', partHash)).resolves.toBe(true);
    await expect(conversationReferencesAttachment(dataSource, 'other-conversation', legacyHash)).resolves.toBe(false);
    await expect(conversationReferencesAttachment(dataSource, 'conversation', `sha256:${'c'.repeat(64)}`)).resolves.toBe(false);
    await expect(conversationReferencesAttachment(dataSource, 'conversation', 'not-a-hash')).resolves.toBe(false);
    expect(await dataSource.getRepository(ConversationAttachmentReferenceEntity).countBy({ conversationId: 'conversation' }))
      .toBe(2);
    await rebuildConversationEventProjection(dataSource, 'conversation');
    await expect(conversationReferencesAttachment(dataSource, 'conversation', legacyHash)).resolves.toBe(true);
    expect(await dataSource.getRepository(ConversationAttachmentReferenceEntity).countBy({ conversationId: 'conversation' }))
      .toBe(2);
  });

  it('allocates an ordered local batch atomically and leaves no partial projection', async () => {
    const events = await appendLocalConversationEventsAtomic(dataSource, [
      {
        kind: 'message',
        eventId: 'batch-user',
        conversationId: 'conversation',
        originNodeId: 'desktop',
        timestamp: 2,
        message: { messageId: 'batch-user', turnId: 'batch-user', role: 'user', content: 'question' },
      },
      {
        kind: 'message',
        eventId: 'batch-answer',
        conversationId: 'conversation',
        originNodeId: 'desktop',
        timestamp: 3,
        message: { messageId: 'batch-answer', turnId: 'batch-user', role: 'assistant', content: 'answer' },
      },
    ]);
    expect(events.map(event => [event.originSequence, event.lamportClock])).toEqual([[2, 2], [3, 3]]);
    expect(await dataSource.getRepository(ConversationTimelineStateEntity).findOneByOrFail({ conversationId: 'conversation' }))
      .toMatchObject({ revision: 2, totalMessages: 2, totalTurns: 1, totalEntries: 1 });

    const valid: ConversationEventDraft = {
      kind: 'message',
      eventId: 'no-partial',
      conversationId: 'conversation',
      originNodeId: 'desktop',
      timestamp: 4,
      message: { messageId: 'no-partial', turnId: 'no-partial', role: 'user', content: 'valid' },
    };
    const invalid = { ...valid, eventId: 'invalid-second', message: { ...valid.message, messageId: 'drift' } };
    await expect(appendLocalConversationEventsAtomic(dataSource, [valid, invalid])).rejects.toThrow(/canonical conversation event/);
    expect(await dataSource.getRepository(ConversationEventEntity).findOneBy({ eventId: 'no-partial' })).toBeNull();
  });

  it('serves bounded turn detail with opaque cursors and seen-cursor checks', async () => {
    await appendLocalConversationEventsAtomic(dataSource, [
      {
        kind: 'message',
        eventId: 'detail-turn',
        conversationId: 'conversation',
        originNodeId: 'desktop',
        timestamp: 2,
        message: { messageId: 'detail-turn', turnId: 'detail-turn', role: 'user', content: 'question' },
      },
      ...Array.from({ length: 3 }, (_, index): ConversationEventDraft => ({
        kind: 'message',
        eventId: `detail-answer-${index}`,
        conversationId: 'conversation',
        originNodeId: 'desktop',
        timestamp: 3 + index,
        message: {
          messageId: `detail-answer-${index}`,
          turnId: 'detail-turn',
          role: 'assistant',
          content: `answer ${index}`,
        },
      })),
    ]);
    const repository = dataSource.getRepository(AgentInstanceMessageEntity);
    const tail = await getTurnDetail(repository, {
      conversationId: 'conversation',
      turnId: 'detail-turn',
      limit: 2,
      maxBytes: 64 * 1024,
    });
    expect(tail.items.map(message => message.messageId)).toEqual(['detail-answer-1', 'detail-answer-2']);
    expect(tail).toMatchObject({ hasMoreBefore: true, hasMoreAfter: false });
    expect(tail.previousCursor).toEqual(expect.any(String));
    const older = await getTurnDetail(repository, {
      conversationId: 'conversation',
      turnId: 'detail-turn',
      cursor: tail.previousCursor,
      seenCursor: tail.previousCursor,
      limit: 2,
      maxBytes: 64 * 1024,
    });
    expect(older.items.map(message => message.messageId)).toEqual(['detail-turn', 'detail-answer-0']);
    expect(older).toMatchObject({ hasMoreBefore: false, hasMoreAfter: true, seenCursorFound: true });
    await expect(getTurnDetail(repository, {
      conversationId: 'other-conversation',
      turnId: 'detail-turn',
      cursor: tail.previousCursor,
      maxBytes: 64 * 1024,
    })).rejects.toThrow(/invalid turn detail cursor/);
  });

  it('opens and seeks a one-megabyte message through the shared on-demand projection', async () => {
    const largeContent = `prefix-${'界🙂'.repeat(160_000)}`;
    await appendLocalConversationEvent(dataSource, {
      kind: 'message',
      eventId: 'large-turn',
      conversationId: 'conversation',
      originNodeId: 'desktop',
      timestamp: 2,
      message: {
        messageId: 'large-turn',
        turnId: 'large-turn',
        role: 'user',
        content: largeContent,
        parts: [{ type: 'text', text: largeContent }],
        toolCalls: [{ id: 'large-tool', toolName: 'example', arguments: { value: 'large' } }],
        attachments: [{
          contentHash: `sha256:${'a'.repeat(64)}`,
          filename: 'large.txt',
          mimeType: 'text/plain',
          size: Buffer.byteLength(largeContent, 'utf8'),
        }],
        reasoning_content: 'heavy reasoning',
        detailRef: { type: 'file', fileUri: 'memeloop://local/file/large-turn' },
        metadata: { agentRunError: { code: 'INTERRUPTED' } },
      },
    });
    const options = {
      limit: 8,
      maxBytes: 256 * 1024,
      mode: 'on-demand' as const,
    };
    const pageQuerySpy = vi.spyOn(dataSource, 'query');
    const page = await getMessagePage(
      dataSource.getRepository(AgentInstanceMessageEntity),
      'conversation',
      options,
    );
    if (page.reset) throw new Error('unexpected reset');
    expect(Buffer.byteLength(JSON.stringify(page), 'utf8')).toBeLessThanOrEqual(options.maxBytes);
    expect(page.items).toHaveLength(1);
    const [projection] = page.items;
    expect(projection.content.length).toBeLessThan(largeContent.length);
    expect(projection.content).not.toContain('\uFFFD');
    expect(projection).not.toHaveProperty('parts');
    expect(projection).not.toHaveProperty('toolCalls');
    expect(projection).not.toHaveProperty('attachments');
    expect(projection).not.toHaveProperty('reasoning_content');
    expect(projection.detailRef).toEqual({ type: 'file', fileUri: 'memeloop://local/file/large-turn' });
    expect(projection.metadata).toMatchObject({
      agentRunError: { code: 'INTERRUPTED' },
      displayTruncation: {
        contentTruncated: true,
        capability: 'detail',
        omittedFields: ['parts', 'toolCalls', 'attachments', 'reasoning_content'],
      },
    });
    const pageSql = pageQuerySpy.mock.calls.map(([sql]) => sql).join('\n');
    expect(pageSql).toContain('detail.listProjectionJson');
    expect(pageSql).not.toMatch(/SELECT eligible\.\* FROM agent_instance_messages/u);
    expect(pageSql).not.toContain('selected.content');
    pageQuerySpy.mockRestore();
    const [projectionSizes] = await dataSource.query<
      Array<{
        byteLength: number;
        listProjectionByteLength: number;
      }>
    >(
      `SELECT byteLength, listProjectionByteLength
       FROM conversation_message_details
       WHERE conversationId = ? AND messageId = ?`,
      ['conversation', 'large-turn'],
    );
    expect(projectionSizes.byteLength).toBeGreaterThan(1024 * 1024);
    expect(projectionSizes.listProjectionByteLength).toBeLessThanOrEqual(48 * 1024);

    const timeline = await getConversationTimelinePage(
      dataSource.getRepository(AgentInstanceMessageEntity),
      'conversation',
      { limit: 8, maxBytes: 16 * 1024 },
    );
    if (timeline.reset) throw new Error('unexpected reset');
    const entry = timeline.items.find(item => item.kind === 'turn' && item.turnId === 'large-turn');
    if (!entry) throw new Error('large turn timeline entry missing');
    const windowQuerySpy = vi.spyOn(dataSource, 'query');
    const window = await getMessageWindowAround(dataSource, 'conversation', {
      focus: { kind: 'timeline-entry', entryId: entry.entryId, cursor: entry.cursor },
      expectedRevision: timeline.revision,
      maxMessages: 8,
      maxBytes: 256 * 1024,
    });
    if (window.reset) throw new Error('unexpected reset');
    expect(Buffer.byteLength(JSON.stringify(window), 'utf8')).toBeLessThanOrEqual(256 * 1024);
    expect(window.items[0]?.metadata).toHaveProperty('displayTruncation.contentTruncated', true);
    const windowSql = windowQuerySpy.mock.calls.map(([sql]) => sql).join('\n');
    expect(windowSql).toContain('detail.listProjectionJson');
    expect(windowSql).not.toContain('message.*');
    windowQuerySpy.mockRestore();

    const identity = await getMessageIdentity(dataSource, 'conversation', 'large-turn');
    expect(identity).toMatchObject({
      messageId: 'large-turn',
      timestamp: 2,
      originNodeId: 'desktop',
    });
    const querySpy = vi.spyOn(dataSource, 'query');
    const chunks: Buffer[] = [];
    let detailOffset = 0;
    let totalBytes: number | undefined;
    do {
      const range = await readMessageDetailRange(
        dataSource,
        'conversation',
        'large-turn',
        detailOffset,
        65_537,
      );
      if (!range.found) throw new Error('large message detail missing');
      totalBytes ??= range.totalBytes;
      expect(range.totalBytes).toBe(totalBytes);
      expect(range.offset).toBe(detailOffset);
      expect(range.bytes.byteLength).toBeLessThanOrEqual(65_537);
      chunks.push(Buffer.from(range.bytes));
      detailOffset += range.bytes.byteLength;
    } while (totalBytes !== undefined && detailOffset < totalBytes);
    if (totalBytes === undefined) throw new Error('large message detail size missing');
    const parsedDetail = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
    ) as Record<string, unknown>;
    expect(parsedDetail).toMatchObject({
      messageId: 'large-turn',
      turnId: 'large-turn',
      conversationId: 'conversation',
      content: largeContent,
    });
    expect(querySpy.mock.calls.every(([sql]) => !/^SELECT detail\.canonicalJson\b/u.test(sql.trim()))).toBe(true);
    expect(querySpy.mock.calls.some(([sql]) => /substr\(detail\.canonicalJson/u.test(sql))).toBe(true);
    querySpy.mockRestore();

    const terminal = await readMessageDetailRange(
      dataSource,
      'conversation',
      'large-turn',
      totalBytes,
      1,
    );
    expect(terminal).toMatchObject({ found: true, offset: totalBytes, totalBytes });
    if (!terminal.found) throw new Error('large message terminal range missing');
    expect(terminal.bytes).toHaveLength(0);
    await expect(readMessageDetailRange(
      dataSource,
      'conversation',
      'large-turn',
      totalBytes + 1,
      1,
    )).rejects.toThrow(/offset exceeds total bytes/);
    await expect(readMessageDetailRange(
      dataSource,
      'conversation',
      'missing-message',
      0,
      1,
    )).resolves.toEqual({ found: false });
    const cancelled = new AbortController();
    cancelled.abort(new Error('detail read cancelled'));
    await expect(readMessageDetailRange(
      dataSource,
      'conversation',
      'large-turn',
      0,
      1,
      { signal: cancelled.signal },
    )).rejects.toThrow('detail read cancelled');

    await expect(getMessagePage(
      dataSource.getRepository(AgentInstanceMessageEntity),
      'conversation',
      { ...options, mode: 'full-content' },
    )).rejects.toMatchObject({ reason: 'message_page_item_oversize' });

    await appendLocalConversationEvent(dataSource, {
      kind: 'tombstone',
      eventId: 'delete-large-turn',
      conversationId: 'conversation',
      originNodeId: 'desktop',
      timestamp: 3,
      targetTurnId: 'large-turn',
      reason: 'user-delete',
    });
    await expect(getMessageIdentity(dataSource, 'conversation', 'large-turn')).resolves.toBeNull();
    await expect(readMessageDetailRange(
      dataSource,
      'conversation',
      'large-turn',
      0,
      1,
    )).resolves.toEqual({ found: false });
  });

  it('appends an idempotent typed delete control event', async () => {
    await appendLocalConversationEvent(dataSource, {
      kind: 'message',
      eventId: 'control-turn',
      conversationId: 'conversation',
      originNodeId: 'desktop',
      timestamp: 2,
      message: { messageId: 'control-turn', turnId: 'control-turn', role: 'user', content: 'old question' },
    });
    const deleteRequest = {
      conversationId: 'conversation',
      turnId: 'control-turn',
      requestId: 'delete-request',
      reason: 'user-delete' as const,
    };
    const deleted = await appendDeleteTurnTombstoneAtomic(dataSource, deleteRequest, 'desktop');
    const deleteReplay = await appendDeleteTurnTombstoneAtomic(dataSource, deleteRequest, 'desktop');
    expect(deleteReplay).toEqual(deleted);
    expect(await dataSource.getRepository(ConversationEventEntity).countBy({ eventId: 'delete-turn:delete-request' }))
      .toBe(1);
  });

  it('fails closed on conflicting canonical bytes and rolls a remote batch back completely', async () => {
    const draft: ConversationEventDraft = {
      kind: 'message',
      eventId: 'immutable',
      conversationId: 'conversation',
      originNodeId: 'desktop',
      timestamp: 2,
      message: { messageId: 'immutable', turnId: 'immutable', role: 'user', content: 'first' },
    };
    await appendLocalConversationEvent(dataSource, draft);
    const checkpointBefore = await dataSource.getRepository(ConversationTimelineRankCheckpointEntity).find({
      where: { conversationId: 'conversation' },
      order: { entryIndex: 'ASC' },
    });
    await expect(appendLocalConversationEvent(dataSource, {
      ...draft,
      message: { ...draft.message, content: 'rewritten' },
    })).rejects.toThrow(/different payload/);

    const first = messageEvent({ eventId: 'batch-a', originNodeId: 'remote', originSequence: 1, lamportClock: 10 });
    const conflicting = messageEvent({ eventId: 'batch-b', originNodeId: 'remote', originSequence: 1, lamportClock: 11 });
    await expect(insertConversationEventsIfAbsent(dataSource, [first, conflicting])).rejects.toThrow(/already occupied/);
    expect(await dataSource.getRepository(ConversationEventEntity).countBy({ originNodeId: 'remote' })).toBe(0);
    expect(await dataSource.getRepository(AgentInstanceMessageEntity).countBy({ messageId: 'batch-a' })).toBe(0);
    expect(
      await dataSource.getRepository(ConversationTimelineRankCheckpointEntity).find({
        where: { conversationId: 'conversation' },
        order: { entryIndex: 'ASC' },
      }),
    ).toEqual(checkpointBefore);
  });

  it('rebuilds sparse ranks once after small out-of-order insert, tombstone, and compaction', async () => {
    const roots = Array.from({ length: 520 }, (_, index): ConversationEvent =>
      messageEvent({
        eventId: `rank-turn-${index.toString().padStart(3, '0')}`,
        originNodeId: 'rank-seed',
        originSequence: index + 1,
        lamportClock: 1_000 + index,
      }));
    await insertConversationEventsIfAbsent(dataSource, roots);
    await insertConversationEventsIfAbsent(dataSource, [
      {
        ...messageEvent({
          eventId: 'rank-old-insert',
          originNodeId: 'rank-control',
          originSequence: 1,
          lamportClock: 10_000,
        }),
        timestamp: 50,
      },
      {
        kind: 'tombstone',
        eventId: 'rank-delete',
        conversationId: 'conversation',
        originNodeId: 'rank-control',
        originSequence: 2,
        lamportClock: 10_001,
        timestamp: 2_000,
        targetTurnId: 'rank-turn-100',
        reason: 'user-delete',
      },
      {
        kind: 'compaction',
        mode: 'summary',
        eventId: 'rank-summary',
        conversationId: 'conversation',
        originNodeId: 'rank-control',
        originSequence: 3,
        lamportClock: 10_002,
        timestamp: 51,
        boundary: {
          version: 2,
          coveredVersion: { 'rank-seed': 1 },
          coveredMessageCountByOrigin: { 'rank-seed': 1 },
          coveredUserTurnCountByOrigin: { 'rank-seed': 1 },
          droppedMessageCount: 1,
          droppedTurnCount: 1,
        },
        summary: { turnId: 'rank-summary-turn', content: 'bounded summary' },
      },
    ]);
    const [integrity] = await dataSource.query<Array<{ checkpoints: number; mismatches: number }>>(
      `WITH ranked AS (
         SELECT entry.messageId,
           ROW_NUMBER() OVER (
             ORDER BY entry.timestamp, entry.lamportClock,
               entry.originNodeId, entry.messageId
           ) - 1 AS entryIndex,
           COALESCE(SUM(CASE WHEN entry.kind = 'turn' THEN 1 ELSE 0 END) OVER (
             ORDER BY entry.timestamp, entry.lamportClock,
               entry.originNodeId, entry.messageId
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ), 0) AS turnIndex
         FROM conversation_timeline_entries AS entry
         WHERE entry.conversationId = 'conversation'
       )
       SELECT COUNT(*) AS checkpoints,
         SUM(CASE WHEN ranked.messageId IS NULL OR ranked.entryIndex <> checkpoint.entryIndex OR
           ranked.turnIndex <> checkpoint.turnIndex THEN 1 ELSE 0 END) AS mismatches
       FROM conversation_timeline_rank_checkpoints AS checkpoint
       LEFT JOIN ranked ON ranked.messageId = checkpoint.messageId
       WHERE checkpoint.conversationId = 'conversation'`,
    );
    expect(integrity).toEqual({ checkpoints: 3, mismatches: 0 });
    const page = await getConversationTimelinePage(
      dataSource.getRepository(AgentInstanceMessageEntity),
      'conversation',
      { limit: 8, maxBytes: 16 * 1024, aroundEntryIndex: 1 },
    );
    if (page.reset) throw new Error('unexpected reset');
    expect(page).toMatchObject({ totalTurns: 520, totalEntries: 521 });
    expect(page.items.slice(0, 3)).toEqual([
      expect.objectContaining({ entryId: 'rank-old-insert', entryIndex: 0, turnIndex: 0 }),
      expect.objectContaining({ entryId: 'rank-summary', entryIndex: 1, turnIndex: 1 }),
      expect.objectContaining({ entryId: 'rank-turn-000', entryIndex: 2, turnIndex: 1 }),
    ]);
  });

  it('strictly validates the whole batch before opening a transaction', async () => {
    const valid = messageEvent({ eventId: 'strict-valid', originNodeId: 'strict-remote', originSequence: 1, lamportClock: 10 });
    const invalid = {
      ...messageEvent({ eventId: 'strict-invalid', originNodeId: 'strict-remote', originSequence: 2, lamportClock: 11 }),
      message: { messageId: 'different-id', turnId: 'different-id', role: 'user', content: 'invalid' },
    } as ConversationEvent;
    await expect(insertConversationEventsIfAbsent(dataSource, [valid, invalid])).rejects.toThrow(/canonical conversation event/);
    expect(await dataSource.getRepository(ConversationEventEntity).countBy({ originNodeId: 'strict-remote' })).toBe(0);
  });

  it('rejects accessors, cycles, excessive depth, and max-size plus one before writing', async () => {
    const getter = vi.fn(() => 'getter-event');
    const accessorDraft = {
      kind: 'message',
      conversationId: 'conversation',
      originNodeId: 'desktop',
      timestamp: 2,
      message: { messageId: 'getter-event', turnId: 'getter-event', role: 'user', content: 'getter' },
    } as unknown as ConversationEventDraft;
    Object.defineProperty(accessorDraft, 'eventId', { enumerable: true, get: getter });
    await expect(appendLocalConversationEvent(dataSource, accessorDraft)).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const cyclicEvent = messageEvent({ eventId: 'cyclic', originNodeId: 'strict', originSequence: 1, lamportClock: 2 });
    if (cyclicEvent.kind !== 'message') throw new Error('test fixture');
    cyclicEvent.message.metadata = cyclic;
    await expect(insertConversationEventsIfAbsent(dataSource, [cyclicEvent])).rejects.toThrow(/canonical conversation event/);

    let deep: Record<string, unknown> = {};
    const deepRoot = deep;
    for (let index = 0; index < 70; index += 1) {
      deep.next = {};
      deep = deep.next as Record<string, unknown>;
    }
    const deepEvent = messageEvent({ eventId: 'deep', originNodeId: 'strict', originSequence: 1, lamportClock: 2 });
    if (deepEvent.kind !== 'message') throw new Error('test fixture');
    deepEvent.message.metadata = deepRoot;
    await expect(insertConversationEventsIfAbsent(dataSource, [deepEvent])).rejects.toThrow(/canonical conversation event/);

    const oversized = messageEvent({
      eventId: 'oversized',
      originNodeId: 'strict',
      originSequence: 1,
      lamportClock: 2,
      content: 'x'.repeat(MAX_CONVERSATION_EVENT_BYTES + 1),
    });
    await expect(insertConversationEventsIfAbsent(dataSource, [oversized])).rejects.toThrow(/canonical conversation event/);
    expect(await dataSource.getRepository(ConversationEventEntity).countBy({ originNodeId: 'strict' })).toBe(0);
  });

  it('tracks the maximum contiguous frontier rather than MAX(sequence)', async () => {
    await insertConversationEventsIfAbsent(dataSource, [
      messageEvent({ eventId: 'remote-2', originNodeId: 'remote', originSequence: 2, lamportClock: 20 }),
    ]);
    expect(await getEventVersionFrontiers(dataSource, ['conversation'])).not.toContainEqual(
      expect.objectContaining({ originNodeId: 'remote' }),
    );
    await insertConversationEventsIfAbsent(dataSource, [
      messageEvent({ eventId: 'remote-1', originNodeId: 'remote', originSequence: 1, lamportClock: 19 }),
    ]);
    expect(await getEventVersionFrontiers(dataSource, ['conversation'])).toContainEqual({
      conversationId: 'conversation',
      originNodeId: 'remote',
      maxContiguousOriginSequence: 2,
    });
  });

  it('resets revision-bound message pages after remote insert, tombstone, and compaction', async () => {
    await appendLocalConversationEvent(dataSource, {
      kind: 'message',
      eventId: 'revision-user',
      conversationId: 'conversation',
      originNodeId: 'desktop',
      timestamp: 2,
      message: { messageId: 'revision-user', turnId: 'revision-user', role: 'user', content: 'hello' },
    });
    const initial = await getMessagePage(
      dataSource.getRepository(AgentInstanceMessageEntity),
      'conversation',
      { limit: 20, maxBytes: 64 * 1024 },
    );
    if (initial.reset) throw new Error('unexpected reset');
    await insertConversationEventsIfAbsent(dataSource, [
      messageEvent({
        eventId: 'revision-answer',
        originNodeId: 'remote-revision',
        originSequence: 1,
        lamportClock: 10,
        turnId: 'revision-user',
        role: 'assistant',
      }),
    ]);
    await expect(getMessagePage(
      dataSource.getRepository(AgentInstanceMessageEntity),
      'conversation',
      {
        limit: 20,
        maxBytes: 64 * 1024,
        before: initial.startCursor,
        expectedRevision: initial.revision,
      },
    )).resolves.toMatchObject({ reset: true, conversationId: 'conversation' });

    const afterInsert = await getMessagePage(
      dataSource.getRepository(AgentInstanceMessageEntity),
      'conversation',
      { limit: 20, maxBytes: 64 * 1024 },
    );
    if (afterInsert.reset) throw new Error('unexpected reset');
    await insertConversationEventsIfAbsent(dataSource, [{
      kind: 'tombstone',
      eventId: 'revision-tombstone',
      conversationId: 'conversation',
      originNodeId: 'remote-revision',
      originSequence: 2,
      lamportClock: 11,
      timestamp: 11,
      targetTurnId: 'revision-user',
      reason: 'user-delete',
    }]);
    await expect(getMessagePage(
      dataSource.getRepository(AgentInstanceMessageEntity),
      'conversation',
      {
        limit: 20,
        maxBytes: 64 * 1024,
        before: afterInsert.startCursor,
        expectedRevision: afterInsert.revision,
      },
    )).resolves.toMatchObject({ reset: true, conversationId: 'conversation' });

    const afterTombstone = await getMessagePage(
      dataSource.getRepository(AgentInstanceMessageEntity),
      'conversation',
      { limit: 20, maxBytes: 64 * 1024 },
    );
    if (afterTombstone.reset) throw new Error('unexpected reset');
    await insertConversationEventsIfAbsent(dataSource, [{
      kind: 'compaction',
      mode: 'summary',
      eventId: 'revision-summary',
      conversationId: 'conversation',
      originNodeId: 'remote-revision',
      originSequence: 3,
      lamportClock: 12,
      timestamp: 12,
      boundary: {
        version: 2,
        coveredVersion: { 'remote-revision': 2 },
        coveredMessageCountByOrigin: { 'remote-revision': 1 },
        coveredUserTurnCountByOrigin: { 'remote-revision': 1 },
        droppedMessageCount: 1,
        droppedTurnCount: 1,
      },
      summary: { turnId: 'revision-summary-turn', content: 'history summary' },
    }]);
    await expect(getMessagePage(
      dataSource.getRepository(AgentInstanceMessageEntity),
      'conversation',
      { limit: 20, maxBytes: 64 * 1024, expectedRevision: afterTombstone.revision },
    )).resolves.toMatchObject({ reset: true, conversationId: 'conversation' });
  });

  it('converges for tombstone-before and tombstone-after without deleting raw or projected rows', async () => {
    const beforeTombstone = await appendLocalConversationEvent(dataSource, {
      kind: 'tombstone',
      eventId: 'tombstone-before',
      conversationId: 'conversation',
      originNodeId: 'desktop',
      timestamp: 2,
      targetTurnId: 'future-turn',
      reason: 'user-delete',
    });
    expect(beforeTombstone.kind).toBe('tombstone');
    await appendLocalConversationEvent(dataSource, {
      kind: 'message',
      eventId: 'future-turn',
      conversationId: 'conversation',
      originNodeId: 'desktop',
      timestamp: 3,
      message: { messageId: 'future-turn', turnId: 'future-turn', role: 'user', content: 'hidden before arrival' },
    });

    await appendLocalConversationEvent(dataSource, {
      kind: 'message',
      eventId: 'late-turn',
      conversationId: 'conversation',
      originNodeId: 'desktop',
      timestamp: 4,
      message: { messageId: 'late-turn', turnId: 'late-turn', role: 'user', content: 'visible briefly' },
    });
    await appendLocalConversationEvent(dataSource, {
      kind: 'tombstone',
      eventId: 'tombstone-late',
      conversationId: 'conversation',
      originNodeId: 'desktop',
      timestamp: 5,
      targetTurnId: 'late-turn',
      reason: 'user-delete',
    });

    const visible = await getMessagePage(dataSource.getRepository(AgentInstanceMessageEntity), 'conversation', { limit: 20, maxBytes: 64 * 1024 });
    if (visible.reset) throw new Error('unexpected reset');
    expect(visible.items).toEqual([]);
    expect(await dataSource.getRepository(ConversationEventEntity).count()).toBe(5);
    expect(await dataSource.getRepository(AgentInstanceMessageEntity).count()).toBe(2);
  });

  it('rebuilds projections idempotently from raw events', async () => {
    await appendLocalConversationEvent(dataSource, {
      kind: 'message',
      eventId: 'kept-user',
      conversationId: 'conversation',
      originNodeId: 'desktop',
      timestamp: 2,
      message: { messageId: 'kept-user', turnId: 'kept-user', role: 'user', content: 'kept' },
    });
    const rawCount = await dataSource.getRepository(ConversationEventEntity).count();
    const detailBefore = await readMessageDetailRange(dataSource, 'conversation', 'kept-user', 0, 1024);
    await rebuildConversationEventProjection(dataSource, 'conversation');
    const once = await getMessagePage(dataSource.getRepository(AgentInstanceMessageEntity), 'conversation', { limit: 20, maxBytes: 64 * 1024 });
    const detailOnce = await readMessageDetailRange(dataSource, 'conversation', 'kept-user', 0, 1024);
    await rebuildConversationEventProjection(dataSource, 'conversation');
    const twice = await getMessagePage(dataSource.getRepository(AgentInstanceMessageEntity), 'conversation', { limit: 20, maxBytes: 64 * 1024 });
    const detailTwice = await readMessageDetailRange(dataSource, 'conversation', 'kept-user', 0, 1024);
    expect(twice).toEqual(once);
    expect(detailOnce).toEqual(detailBefore);
    expect(detailTwice).toEqual(detailBefore);
    expect(await dataSource.getRepository(ConversationEventEntity).count()).toBe(rawCount);
  });

  it('keeps Unicode-safe exact previews identical across incremental projection and rebuild', async () => {
    const longEmojiLine = '😀'.repeat(241);
    await appendLocalConversationEventsAtomic(dataSource, [
      {
        kind: 'message',
        eventId: 'preview-user',
        conversationId: 'conversation',
        originNodeId: 'desktop',
        timestamp: 10,
        message: {
          messageId: 'preview-user',
          turnId: 'preview-user',
          role: 'user',
          content: `\n \t\n  ${longEmojiLine}  \nignored`,
        },
      },
      {
        kind: 'message',
        eventId: 'preview-assistant',
        conversationId: 'conversation',
        originNodeId: 'desktop',
        timestamp: 11,
        message: {
          messageId: 'preview-assistant',
          turnId: 'preview-user',
          role: 'assistant',
          content: '\n\n  答😀😀😀😀😀  ',
        },
      },
      {
        kind: 'compaction',
        mode: 'summary',
        eventId: 'preview-summary',
        conversationId: 'conversation',
        originNodeId: 'desktop',
        timestamp: 12,
        boundary: {
          version: 2,
          coveredVersion: { desktop: 2 },
          coveredMessageCountByOrigin: { desktop: 2 },
          coveredUserTurnCountByOrigin: { desktop: 1 },
          droppedMessageCount: 2,
          droppedTurnCount: 1,
        },
        summary: { turnId: 'preview-summary-turn', content: '\n \n  🧠🧠🧠🧠🧠  ' },
      },
    ]);
    const read = async () => {
      const page = await getConversationTimelinePage(
        dataSource.getRepository(AgentInstanceMessageEntity),
        'conversation',
        { limit: 8, maxBytes: 16 * 1024, previewLength: 4 },
      );
      if (page.reset) throw new Error('unexpected reset');
      return page;
    };
    const incremental = await read();
    expect(incremental.items).toEqual([
      expect.objectContaining({
        kind: 'turn',
        userPreview: '😀😀😀…',
        participantPreviews: [expect.objectContaining({ preview: '答😀😀…' })],
        responseCount: 1,
      }),
      expect.objectContaining({ kind: 'compaction', summaryPreview: '🧠🧠🧠…' }),
    ]);
    const incrementalStored = await dataSource.getRepository(ConversationTimelineEntryEntity).findOneByOrFail({
      conversationId: 'conversation',
      messageId: 'preview-user',
    });
    expect(
      Array.from(
        new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(incrementalStored.userPreview ?? ''),
      ),
    ).toHaveLength(240);
    expect(incrementalStored.userPreview?.endsWith('…')).toBe(true);

    await rebuildConversationEventProjection(dataSource, 'conversation');
    const rebuilt = await read();
    const stableFields = (page: typeof rebuilt) => page.items.map(({ cursor: _cursor, ...item }) => item);
    expect(stableFields(rebuilt)).toEqual(stableFields(incremental));
    const rebuiltStored = await dataSource.getRepository(ConversationTimelineEntryEntity).findOneByOrFail({
      conversationId: 'conversation',
      messageId: 'preview-user',
    });
    expect(rebuiltStored.userPreview).toBe(incrementalStored.userPreview);
    expect(rebuiltStored.participantPreviewsJson).toBe(incrementalStored.participantPreviewsJson);
    expect(rebuiltStored.responseCount).toBe(incrementalStored.responseCount);
  });

  it('persists bounded first/last participant previews for a multi-agent turn', async () => {
    await appendLocalConversationEventsAtomic(dataSource, [
      {
        kind: 'message',
        eventId: 'multi-turn',
        conversationId: 'conversation',
        originNodeId: 'desktop',
        timestamp: 20,
        message: { messageId: 'multi-turn', turnId: 'multi-turn', role: 'user', content: 'delegate widely' },
      },
      ...Array.from({ length: 6 }, (_, index): ConversationEventDraft => ({
        kind: 'message',
        eventId: `multi-response-${index + 1}`,
        conversationId: 'conversation',
        originNodeId: `worker-${index + 1}`,
        timestamp: 21 + index,
        message: {
          messageId: `multi-response-${index + 1}`,
          turnId: 'multi-turn',
          role: index % 2 === 0 ? 'agent' : 'assistant',
          content: `response-${index + 1}-${'界'.repeat(200)}`,
          metadata: { actorId: `agent-${index + 1}`, actorLabel: `Agent ${index + 1}` },
        },
      })),
    ]);
    const read = async () => {
      const options = { limit: 8, maxBytes: 16 * 1024, previewLength: 160 } as const;
      const page = await getConversationTimelinePage(
        dataSource.getRepository(AgentInstanceMessageEntity),
        'conversation',
        options,
      );
      assertConversationTimelinePage(page, 'conversation', options);
      if (page.reset) throw new Error('unexpected reset');
      const entry = page.items.find(item => item.kind === 'turn' && item.turnId === 'multi-turn');
      if (!entry || entry.kind !== 'turn') throw new Error('multi-agent timeline entry missing');
      return entry;
    };
    const incremental = await read();
    expect(incremental.responseCount).toBe(6);
    expect(incremental.participantPreviews.map(preview => preview.actorId))
      .toEqual(['agent-1', 'agent-2', 'agent-5', 'agent-6']);
    expect(incremental.participantPreviews).toHaveLength(4);
    expect(incremental.participantPreviews.every(preview => preview.preview.length <= 160)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(incremental), 'utf8')).toBeLessThanOrEqual(1024);

    await rebuildConversationEventProjection(dataSource, 'conversation');
    expect(await read()).toEqual(incremental);
  });

  it('uses a stable origin/sequence/eventId range cursor', async () => {
    await insertConversationEventsIfAbsent(
      dataSource,
      [1, 2, 3].map(sequence =>
        messageEvent({
          eventId: `range-${sequence}`,
          originNodeId: 'remote',
          originSequence: sequence,
          lamportClock: 10 + sequence,
        })
      ),
    );
    const range = [{ originNodeId: 'remote', fromExclusive: 0, toInclusive: 3 }];
    const first = await getConversationEventPage(dataSource, 'conversation', { limit: 2, ranges: range });
    expect(first.items.map(event => event.eventId)).toEqual(['range-1', 'range-2']);
    const second = await getConversationEventPage(dataSource, 'conversation', {
      limit: 2,
      ranges: range,
      after: first.endCursor,
    });
    expect(second.items.map(event => event.eventId)).toEqual(['range-3']);
  });

  it('projects metadata with deterministic Lamport/origin/event LWW ordering', async () => {
    await insertConversationEventsIfAbsent(dataSource, [
      {
        kind: 'metadataPatch',
        eventId: 'title-low',
        conversationId: 'conversation',
        originNodeId: 'z',
        originSequence: 1,
        lamportClock: 10,
        timestamp: 10,
        patch: { title: 'low' },
      },
      {
        kind: 'metadataPatch',
        eventId: 'title-high',
        conversationId: 'conversation',
        originNodeId: 'a',
        originSequence: 1,
        lamportClock: 11,
        timestamp: 11,
        patch: { title: 'high' },
      },
    ]);
    expect((await dataSource.getRepository(AgentInstanceEntity).findOneByOrFail({ id: 'conversation' })).name).toBe('high');
  });

  it('does not wedge remote chat sync while a custom definition is still unavailable', async () => {
    const metadata: ConversationEvent = {
      kind: 'metadataPatch',
      eventId: 'remote-metadata',
      conversationId: 'remote-conversation',
      originNodeId: 'remote',
      originSequence: 1,
      lamportClock: 1,
      timestamp: 1,
      patch: { definitionId: 'remote-custom-profile', title: 'Remote chat' },
    };
    await insertConversationEventsIfAbsent(dataSource, [
      metadata,
      messageEvent({
        eventId: 'remote-user',
        conversationId: 'remote-conversation',
        originNodeId: 'remote',
        originSequence: 2,
        lamportClock: 2,
      }),
    ]);
    expect(await dataSource.getRepository(AgentDefinitionEntity).findOneBy({ id: 'remote-custom-profile' })).toMatchObject({
      builtinVersion: 'remote-placeholder',
      isCustomized: false,
    });
    const remotePage = await getMessagePage(
      dataSource.getRepository(AgentInstanceMessageEntity),
      'remote-conversation',
      { limit: 20, maxBytes: 64 * 1024 },
    );
    if (remotePage.reset) throw new Error('unexpected reset');
    expect(remotePage.items).toHaveLength(1);
  });
});
