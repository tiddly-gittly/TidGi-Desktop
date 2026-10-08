/** @vitest-environment node */
import 'reflect-metadata';

import type { ChatMessage, ConversationEvent } from 'memeloop';
import type { Logger } from 'typeorm';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
  deleteConversationTurn,
  getConversationTimelinePage,
  getLatestContextCompactionSummary,
  getMessagePage,
  getMessageWindowAround,
  insertConversationEventsIfAbsent,
  rebuildTimelineRankCheckpoints,
} from '../agentRepository';

interface PagingPerformanceEvidence {
  seedMs?: number;
  tailPageMs?: number;
  tailPageBytes?: number;
  tailPageQueries?: number;
  timelineColdMs?: number;
  timelineHotMs?: number;
  timelineBytes?: number;
  timelineQueries?: number;
  loadAroundMs?: number;
  loadAroundBytes?: number;
}

class CountingQueryLogger implements Logger {
  public queries = 0;
  public statements: string[] = [];
  public parameters: unknown[][] = [];

  public logQuery(query: string, parameters?: unknown[]): void {
    this.queries += 1;
    this.statements.push(query);
    // TypeORM passes every bound value to the logger.  The remote-merge
    // fixture intentionally writes 100k events, so retaining those values
    // here would keep every multi-megabyte JSON batch (and every detail
    // buffer) alive for the lifetime of the worker.  We only inspect the
    // first query's parameters for the keyset EXPLAIN assertion; retain them
    // only when they are safely bounded and discard the rest.
    if (this.parameters.length === 0) {
      const bounded = parameters?.every(parameter => {
        if (typeof parameter === 'string') return Buffer.byteLength(parameter, 'utf8') <= 8 * 1024;
        if (Buffer.isBuffer(parameter)) return parameter.byteLength <= 8 * 1024;
        return parameter === null || typeof parameter !== 'object';
      }) ?? true;
      // Keep one placeholder even when the first query has a large value so
      // the parameters index remains aligned with statements[0].
      this.parameters.push(bounded ? (parameters ?? []) : []);
    }
  }

  public logQueryError(): void {}
  public logQuerySlow(): void {}
  public logSchemaBuild(): void {}
  public logMigration(): void {}
  public log(): void {}

  public reset(): void {
    this.queries = 0;
    this.statements = [];
    this.parameters = [];
  }
}

describe('long conversation SQL paging', () => {
  let dataSource: DataSource;
  const queryLogger = new CountingQueryLogger();
  const performanceEvidence: PagingPerformanceEvidence = {};

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [
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
      ],
      synchronize: true,
      logging: ['query'],
      logger: queryLogger,
    });
    await dataSource.initialize();
    await dataSource.getRepository(AgentDefinitionEntity).save({
      id: 'definition',
      name: 'Long chat',
      description: 'Long chat performance fixture',
      systemPrompt: 'Assist the paging test.',
      tools: [],
      version: '1.0.0',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await dataSource.getRepository(AgentInstanceEntity).save({
      id: 'conversation',
      agentDefId: 'definition',
      status: { state: 'completed' },
      created: new Date(),
      closed: false,
      volatile: false,
    });
    const seedStartedAt = performance.now();
    const numberCte = `WITH digits(d) AS (
       VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9)
     ), numbers AS (
       SELECT ones.d + tens.d * 10 + hundreds.d * 100 +
         thousands.d * 1000 + ten_thousands.d * 10000 AS i
       FROM digits AS ones CROSS JOIN digits AS tens CROSS JOIN digits AS hundreds
       CROSS JOIN digits AS thousands CROSS JOIN digits AS ten_thousands
     )`;
    await dataSource.query(
      `${numberCte}
       INSERT INTO agent_instance_messages (
         messageId, conversationId, originNodeId, originSequence, turnId,
         timestamp, lamportClock, role, content, hidden, isContextCompaction
       )
       SELECT printf('m-%06d', i), 'conversation',
         CASE WHEN i % 2 = 0 THEN 'desktop' ELSE 'mobile' END,
         CAST(i / 2 AS INTEGER) + 1,
         printf('m-%06d', CAST(i / 2 AS INTEGER) * 2),
         1000 + CAST(i / 2 AS INTEGER), i + 1,
         CASE WHEN i % 2 = 0 THEN 'user' ELSE 'assistant' END,
         (CASE WHEN i % 2 = 0 THEN 'prompt ' ELSE 'response ' END) || i,
         0, 0
       FROM numbers`,
    );
    await dataSource.query(
      `${numberCte}, canonical AS (
         SELECT i, printf('m-%06d', i) AS messageId,
           printf('m-%06d', CAST(i / 2 AS INTEGER) * 2) AS turnId,
           CASE WHEN i % 2 = 0 THEN 'desktop' ELSE 'mobile' END AS originNodeId,
           CASE WHEN i % 2 = 0 THEN 'user' ELSE 'assistant' END AS role,
           (CASE WHEN i % 2 = 0 THEN 'prompt ' ELSE 'response ' END) || i AS content
         FROM numbers
       ), payload AS (
         SELECT messageId, turnId,
           '{"content":"' || content || '","conversationId":"conversation","hidden":false,' ||
           '"lamportClock":' || (i + 1) || ',"messageId":"' || messageId || '",' ||
           '"originNodeId":"' || originNodeId || '","originSequence":' ||
           (CAST(i / 2 AS INTEGER) + 1) || ',"role":"' || role || '",' ||
           '"timestamp":' || (1000 + CAST(i / 2 AS INTEGER)) || ',"turnId":"' || turnId || '"}' AS json
         FROM canonical
       )
       INSERT INTO conversation_message_details (
         conversationId, messageId, turnId, byteLength, canonicalJson,
         listProjectionByteLength, listProjectionJson
       )
       SELECT 'conversation', messageId, turnId,
         length(CAST(json AS BLOB)), CAST(json AS BLOB),
         length(CAST(json AS BLOB)), CAST(json AS BLOB)
       FROM payload`,
    );
    const timelineRepository = dataSource.getRepository(ConversationTimelineEntryEntity);
    await timelineRepository.query(
      `INSERT INTO conversation_timeline_entries (
         conversationId, messageId, cursor, kind, turnId,
         timestamp, lamportClock, originNodeId, turnIndex,
         role, actorId, actorLabel, preview
       )
       SELECT message.conversationId, message.messageId, message.messageId,
         'message', message.turnId, message.timestamp, message.lamportClock,
         message.originNodeId,
         CAST((ROW_NUMBER() OVER (
           ORDER BY message.timestamp, message.lamportClock,
             message.originNodeId, message.messageId
         ) - 1) / 2 AS INTEGER),
         message.role, message.originNodeId, message.originNodeId, message.content
       FROM agent_instance_messages AS message
       WHERE message.conversationId = 'conversation'
       ORDER BY message.timestamp, message.lamportClock,
         message.originNodeId, message.messageId`,
    );
    await dataSource.getRepository(ConversationTimelineStateEntity).insert({
      conversationId: 'conversation',
      revision: 1,
      totalMessages: 100_000,
      totalTurns: 50_000,
      totalEntries: 100_000,
    });
    await rebuildTimelineRankCheckpoints(dataSource.manager, 'conversation');
    performanceEvidence.seedMs = performance.now() - seedStartedAt;
  }, 60_000);

  afterAll(async () => {
    console.info('long-conversation-performance', performanceEvidence);
    const source = dataSource;
    await source.destroy();
    // Vitest reuses a fork for multiple files.  Drop the DataSource and
    // logger references after closing SQLite so the 100k-row fixture cannot
    // stay reachable until the worker exits.
    dataSource = undefined as unknown as DataSource;
    queryLogger.reset();
  });

  it('opens only the bounded tail and keyset-pages older rows', async () => {
    const repository = dataSource.getRepository(AgentInstanceMessageEntity);
    await expect(getMessagePage(repository, 'conversation', { limit: 81, maxBytes: 64 * 1024 }))
      .rejects.toThrow(/limit must be between 1 and 80/);
    await expect(getMessagePage(repository, 'conversation', { limit: 80, maxBytes: 4 * 1024 * 1024 + 1 }))
      .rejects.toThrow(/maxBytes/);
    queryLogger.reset();
    const tailStartedAt = performance.now();
    const tail = await getMessagePage(repository, 'conversation', { limit: 80, maxBytes: 64 * 1024 });
    performanceEvidence.tailPageMs = performance.now() - tailStartedAt;
    performanceEvidence.tailPageBytes = Buffer.byteLength(JSON.stringify(tail));
    performanceEvidence.tailPageQueries = queryLogger.queries;
    if (tail.reset) throw new Error('unexpected reset');
    expect(tail.items).toHaveLength(80);
    expect(tail.items[0].messageId).toBe('m-099920');
    expect(tail.items.at(-1)?.messageId).toBe('m-099999');
    expect(tail.hasMoreBefore).toBe(true);
    expect(tail.hasMoreAfter).toBe(false);
    expect(performanceEvidence.tailPageMs).toBeLessThan(100);
    expect(performanceEvidence.tailPageBytes).toBeLessThan(50_000);
    expect(performanceEvidence.tailPageQueries).toBeLessThanOrEqual(5);

    const older = await getMessagePage(repository, 'conversation', {
      limit: 80,
      maxBytes: 64 * 1024,
      before: tail.startCursor,
      expectedRevision: tail.revision,
    });
    if (older.reset) throw new Error('unexpected reset');
    expect(older.items).toHaveLength(80);
    expect(older.items.at(-1)?.messageId).toBe('m-099919');
  });

  it('returns only the revisioned latest timeline page from a 100k-message projection', async () => {
    queryLogger.reset();
    const coldStartedAt = performance.now();
    const timeline = await getConversationTimelinePage(
      dataSource.getRepository(AgentInstanceMessageEntity),
      'conversation',
      { limit: 64, maxBytes: 64 * 1024, previewLength: 40 },
    );
    performanceEvidence.timelineColdMs = performance.now() - coldStartedAt;
    performanceEvidence.timelineQueries = queryLogger.queries;
    const hotStartedAt = performance.now();
    await getConversationTimelinePage(
      dataSource.getRepository(AgentInstanceMessageEntity),
      'conversation',
      { limit: 64, maxBytes: 64 * 1024, previewLength: 40 },
    );
    performanceEvidence.timelineHotMs = performance.now() - hotStartedAt;
    performanceEvidence.timelineBytes = Buffer.byteLength(JSON.stringify(timeline));
    expect(timeline.reset).toBe(false);
    if (timeline.reset) throw new Error('unexpected reset');
    expect(timeline.totalMessages).toBe(100_000);
    expect(timeline.totalTurns).toBe(50_000);
    expect(timeline.totalEntries).toBe(100_000);
    expect(timeline.items).toHaveLength(64);
    expect(timeline.items[0]).toMatchObject({
      messageId: 'm-099936',
      entryIndex: 99_936,
    });
    expect(timeline.items.at(-1)?.entryIndex).toBe(99_999);

    expect(performanceEvidence.timelineColdMs).toBeLessThan(200);
    expect(performanceEvidence.timelineHotMs).toBeLessThan(200);
    expect(performanceEvidence.timelineBytes).toBeLessThan(64 * 1024);
    expect(performanceEvidence.timelineQueries).toBeLessThanOrEqual(5);
  });

  it('centers an arbitrary 50k-turn position and uses opaque cursor paging', async () => {
    queryLogger.reset();
    const startedAt = performance.now();
    const around = await getConversationTimelinePage(
      dataSource.getRepository(AgentInstanceMessageEntity),
      'conversation',
      { limit: 64, maxBytes: 64 * 1024, aroundEntryIndex: 50_000 },
    );
    performanceEvidence.loadAroundMs = performance.now() - startedAt;
    performanceEvidence.loadAroundBytes = Buffer.byteLength(JSON.stringify(around));
    expect(around.reset).toBe(false);
    if (around.reset) throw new Error('unexpected reset');
    expect(around.items[32]).toMatchObject({ messageId: 'm-050000', entryIndex: 50_000, turnIndex: 25_000 });
    expect(around.items).toHaveLength(64);
    expect(queryLogger.queries).toBeLessThanOrEqual(5);
    expect(performanceEvidence.loadAroundBytes).toBeLessThan(64 * 1024);
    expect(performanceEvidence.loadAroundMs).toBeLessThan(200);
    const seekStatement = queryLogger.statements[0];
    const seekParameters = queryLogger.parameters[0];
    expect(seekStatement).not.toMatch(/\bOFFSET\b/i);
    expect(seekStatement).not.toMatch(/COUNT\(\*\).*conversation_timeline_entries AS (?:prior|distance)/is);
    const plan = await dataSource.query<Array<{ detail: string }>>(
      `EXPLAIN QUERY PLAN ${seekStatement}`,
      seekParameters,
    );
    const planText = plan.map(row => row.detail).join('\n');
    expect(planText).not.toMatch(/SCAN (?:entry|conversation_timeline_entries)\b/i);
    expect(planText).toMatch(/SEARCH (?:entry|checkpoint).*INDEX/i);

    queryLogger.reset();
    const [before, after] = await Promise.all([
      getConversationTimelinePage(
        dataSource.getRepository(AgentInstanceMessageEntity),
        'conversation',
        { limit: 8, maxBytes: 16 * 1024, expectedRevision: around.revision, beforeCursor: around.startCursor! },
      ),
      getConversationTimelinePage(
        dataSource.getRepository(AgentInstanceMessageEntity),
        'conversation',
        { limit: 8, maxBytes: 16 * 1024, expectedRevision: around.revision, afterCursor: around.endCursor! },
      ),
    ]);
    expect(queryLogger.queries).toBe(2);
    expect(before.reset).toBe(false);
    if (!before.reset) expect(before.endEntryIndex).toBe(around.startEntryIndex! - 1);
    expect(after.reset).toBe(false);
    if (!after.reset) expect(after.startEntryIndex).toBe(around.endEntryIndex! + 1);
  });

  it('resolves and pages an arbitrary turn in one revision-consistent SQL transaction', async () => {
    const timeline = await getConversationTimelinePage(
      dataSource.getRepository(AgentInstanceMessageEntity),
      'conversation',
      { limit: 8, maxBytes: 16 * 1024, aroundEntryIndex: 50_000 },
    );
    if (timeline.reset) throw new Error('unexpected reset');
    const entry = timeline.items.find(item => item.kind === 'message' && item.messageId === 'm-050000');
    if (!entry || entry.kind !== 'message') throw new Error('message fixture missing');
    queryLogger.reset();
    const result = await getMessageWindowAround(dataSource, 'conversation', {
      focus: { kind: 'timeline-entry', entryId: entry.entryId, cursor: entry.cursor },
      expectedRevision: timeline.revision,
      maxMessages: 80,
      maxBytes: 64 * 1024,
    });
    expect(result.reset).toBe(false);
    if (result.reset) throw new Error('unexpected reset');
    expect(result.focus).toEqual({
      kind: 'message',
      messageId: entry.messageId,
      turnId: entry.turnId,
      entryId: entry.entryId,
      cursor: entry.cursor,
    });
    expect(result.recenterAnchor).toEqual({ messageId: entry.messageId, turnId: entry.turnId });
    expect(result.items.some(message => message.messageId === entry.messageId)).toBe(true);
    expect(result.items.some(message => message.turnId === entry.turnId)).toBe(true);
    expect(result.items).toHaveLength(80);
    expect(queryLogger.queries).toBeLessThanOrEqual(3);
  });

  it('returns a typed reset rather than mixing revisions', async () => {
    await expect(getConversationTimelinePage(
      dataSource.getRepository(AgentInstanceMessageEntity),
      'conversation',
      { limit: 8, maxBytes: 16 * 1024, expectedRevision: 'stale', aroundEntryIndex: 100 },
    )).resolves.toEqual({ reset: true, revision: '1' });
  });

  it('merges 100k shuffled remote events with tombstone/compaction without suffix rewrites', async () => {
    const previous = await getConversationTimelinePage(
      dataSource.getRepository(AgentInstanceMessageEntity),
      'conversation',
      { limit: 8, maxBytes: 16 * 1024, aroundEntryIndex: 10 },
    );
    if (previous.reset) throw new Error('unexpected reset');
    const ordered: ConversationEvent[] = Array.from({ length: 99_998 }, (_, index) => {
      const turnIndex = Math.floor(index / 2);
      const user = index % 2 === 0;
      const turnId = `remote-turn-${turnIndex.toString().padStart(5, '0')}`;
      const eventId = user ? turnId : `remote-answer-${turnIndex.toString().padStart(5, '0')}`;
      return {
        kind: 'message',
        eventId,
        conversationId: 'conversation',
        originNodeId: 'remote-bulk',
        originSequence: index + 1,
        lamportClock: 200_000 + index,
        timestamp: 500 + turnIndex,
        message: {
          messageId: eventId,
          turnId,
          role: user ? 'user' : 'assistant',
          content: `${user ? 'old question' : 'old answer'} ${turnIndex}`,
          parts: [{ type: 'text', text: `${user ? 'old question' : 'old answer'} ${turnIndex}` }],
        },
      };
    });
    ordered.push(
      {
        kind: 'tombstone',
        eventId: 'remote-delete-old-turn',
        conversationId: 'conversation',
        originNodeId: 'remote-bulk',
        originSequence: 99_999,
        lamportClock: 299_998,
        timestamp: 503,
        targetTurnId: 'm-000010',
        reason: 'user-delete',
      },
      {
        kind: 'compaction',
        mode: 'summary',
        eventId: 'remote-summary',
        conversationId: 'conversation',
        originNodeId: 'remote-bulk',
        originSequence: 100_000,
        lamportClock: 299_999,
        timestamp: 502,
        boundary: {
          version: 2,
          coveredVersion: { 'remote-bulk': 2 },
          coveredMessageCountByOrigin: { 'remote-bulk': 2 },
          coveredUserTurnCountByOrigin: { 'remote-bulk': 1 },
          droppedMessageCount: 2,
          droppedTurnCount: 1,
        },
        summary: { turnId: 'remote-summary-turn', content: 'bounded compacted history' },
      },
    );
    // Deterministic full permutation: 65,537 is coprime to 100,000.
    const shuffled = Array.from(
      { length: ordered.length },
      (_, index) => ordered[(index * 65_537 + 12_345) % ordered.length],
    );
    queryLogger.reset();
    const startedAt = performance.now();
    await insertConversationEventsIfAbsent(dataSource, shuffled);
    const mergeMs = performance.now() - startedAt;
    const writes = queryLogger.queries;
    // The query-count and suffix-rewrite assertions below are the stable
    // complexity gates. Keep a generous wall-clock ceiling as a regression
    // smoke test because this suite shares CPU with up to five Vitest forks.
    expect(mergeMs).toBeLessThan(45_000);
    expect(writes).toBeLessThan(900);
    const rankRewrites = queryLogger.statements.filter(sql => /UPDATE\s+conversation_timeline_entries[\s\S]*SET\s+turnIndex/i.test(sql));
    expect(rankRewrites).toHaveLength(1);
    expect(rankRewrites[0]).toMatch(/WITH ranked AS MATERIALIZED/i);
    expect(queryLogger.statements.some(sql => /SET\s+entryIndex/i.test(sql))).toBe(false);
    expect(await dataSource.getRepository(ConversationEventEntity).countBy({ originNodeId: 'remote-bulk' })).toBe(100_000);
    expect(
      await dataSource.getRepository(ConversationEventSequenceEntity).findOneByOrFail({
        conversationId: 'conversation',
        originNodeId: 'remote-bulk',
      }),
    ).toMatchObject({ lastSequence: 100_000, contiguousFrontier: 100_000 });
    const [projectionCounts] = await dataSource.query<
      Array<{
        eligibleUserRoots: number;
        messages: number;
        userRoots: number;
      }>
    >(
      `SELECT COUNT(*) AS messages,
         SUM(CASE WHEN role = 'user' AND messageId = turnId THEN 1 ELSE 0 END) AS userRoots,
         SUM(CASE WHEN conversationId = 'conversation' AND role = 'user'
           AND messageId = turnId AND hidden = 0 AND isContextCompaction = 0
           THEN 1 ELSE 0 END) AS eligibleUserRoots
       FROM agent_instance_messages WHERE originNodeId = 'remote-bulk'`,
    );
    expect(projectionCounts).toEqual({ messages: 99_999, userRoots: 49_999, eligibleUserRoots: 49_999 });
    const [timelineProjectionCounts] = await dataSource.query<Array<{ candidates: number; projected: number }>>(
      `SELECT
         (SELECT COUNT(*) FROM agent_instance_messages AS message
          WHERE message.conversationId = 'conversation'
            AND message.role IN ('user', 'assistant', 'agent') AND message.hidden = 0
            AND message.isContextCompaction = 0
            AND NOT EXISTS (
              SELECT 1 FROM conversation_turn_tombstones AS tombstone
              WHERE tombstone.conversationId = message.conversationId
                AND tombstone.turnId = message.turnId
            )) AS candidates,
         (SELECT COUNT(*) FROM conversation_timeline_entries
          WHERE conversationId = 'conversation' AND kind = 'message') AS projected`,
    );
    expect(timelineProjectionCounts).toEqual({ candidates: 199_996, projected: 199_996 });

    await expect(getConversationTimelinePage(
      dataSource.getRepository(AgentInstanceMessageEntity),
      'conversation',
      { limit: 8, maxBytes: 16 * 1024, expectedRevision: previous.revision, beforeCursor: previous.startCursor! },
    )).resolves.toMatchObject({ reset: true, revision: '2' });
    const around = await getConversationTimelinePage(
      dataSource.getRepository(AgentInstanceMessageEntity),
      'conversation',
      { limit: 8, maxBytes: 16 * 1024, aroundEntryIndex: 0 },
    );
    if (around.reset) throw new Error('unexpected reset');
    expect(around).toMatchObject({ totalMessages: 199_996, totalTurns: 99_998, totalEntries: 199_997 });
    expect(around.items.some(item => item.kind === 'message' && item.messageId === 'remote-turn-00000')).toBe(true);
    expect(around.items).toContainEqual(expect.objectContaining({
      entryId: 'remote-summary',
      kind: 'compaction',
      compactedMessageCount: 2,
    }));
    const compaction = around.items.find(item => item.kind === 'compaction' && item.entryId === 'remote-summary');
    if (!compaction) throw new Error('compaction fixture missing');
    queryLogger.reset();
    const compactionWindow = await getMessageWindowAround(dataSource, 'conversation', {
      focus: { kind: 'timeline-entry', entryId: compaction.entryId, cursor: compaction.cursor },
      expectedRevision: around.revision,
      maxMessages: 80,
      maxBytes: 64 * 1024,
    });
    expect(queryLogger.queries).toBe(1);
    expect(compactionWindow.reset).toBe(false);
    if (compactionWindow.reset || compactionWindow.focus.kind !== 'compaction') {
      throw new Error('expected a compaction focus');
    }
    expect(compactionWindow.focus.entry).toMatchObject({ entryId: 'remote-summary', kind: 'compaction' });
    expect(compactionWindow.items.length).toBeLessThanOrEqual(80);
    if ('nearestTurnId' in compactionWindow.focus) {
      const nearestTurnId = compactionWindow.focus.nearestTurnId;
      expect(compactionWindow.items.some(message => message.turnId === nearestTurnId)).toBe(true);
    }
    await expect(getMessageWindowAround(dataSource, 'conversation', {
      focus: { kind: 'timeline-entry', entryId: compaction.entryId, cursor: compaction.cursor },
      expectedRevision: previous.revision,
      maxMessages: 80,
      maxBytes: 64 * 1024,
    })).resolves.toEqual({ reset: true, conversationId: 'conversation', revision: '2' });
    console.info('long-conversation-remote-merge', { mergeMs, statements: writes });
  }, 60_000);

  it('loads a bounded window around a far-away timeline marker', async () => {
    const repository = dataSource.getRepository(AgentInstanceMessageEntity);
    const startedAt = performance.now();
    // This performance fixture intentionally seeds only the materialized SQL
    // projection. Point reads used by retry are covered by the canonical event
    // store suite; paging accepts the same stable cursor fields directly.
    const anchor: ChatMessage = {
      messageId: 'm-050000',
      conversationId: 'conversation',
      originNodeId: 'desktop',
      originSequence: 25_001,
      turnId: 'm-050000',
      timestamp: 26_000,
      lamportClock: 50_001,
      role: 'user',
      content: 'prompt 50000',
      parts: [{ type: 'text', text: 'prompt 50000' }],
      hidden: false,
    };
    const revision = String(
      (await dataSource.getRepository(ConversationTimelineStateEntity).findOneByOrFail({
        conversationId: 'conversation',
      })).revision,
    );
    const [before, after] = await Promise.all([
      getMessagePage(repository, 'conversation', { before: anchor, expectedRevision: revision, limit: 60, maxBytes: 64 * 1024 }),
      getMessagePage(repository, 'conversation', { after: anchor, expectedRevision: revision, direction: 'forward', limit: 60, maxBytes: 64 * 1024 }),
    ]);
    if (before.reset || after.reset) throw new Error('unexpected reset');
    const result = { anchor, before, after };
    performanceEvidence.loadAroundMs = performance.now() - startedAt;
    performanceEvidence.loadAroundBytes = Buffer.byteLength(JSON.stringify(result));
    expect(before.items).toHaveLength(60);
    expect(after.items).toHaveLength(60);
    expect(performanceEvidence.loadAroundMs).toBeLessThan(100);
    expect(performanceEvidence.loadAroundBytes).toBeLessThan(75_000);
  }, 60_000);

  it('creates the composite keyset index', async () => {
    const indexes = await dataSource.query<Array<{ name: string }>>('PRAGMA index_list("agent_instance_messages")');
    expect(indexes.map(index => index.name)).toContain('IDX_agent_message_conversation_order');
    const timelineIndexes = await dataSource.query<Array<{ name: string }>>('PRAGMA index_list("conversation_timeline_entries")');
    expect(timelineIndexes.map(index => index.name)).toContain('IDX_conversation_timeline_order');
    expect(timelineIndexes.map(index => index.name)).toContain('IDX_conversation_timeline_kind_order');
  });

  it('selects a full non-resident turn without physically deleting its projection', async () => {
    const repository = dataSource.getRepository(AgentInstanceMessageEntity);
    const deleted = await deleteConversationTurn(repository, 'conversation', 'm-000010');
    expect(deleted?.messageIds).toEqual(['m-000010', 'm-000011']);
    expect(await repository.findOne({ where: { messageId: 'm-000011' } })).not.toBeNull();
    expect(await repository.findOne({ where: { messageId: 'm-000012' } })).not.toBeNull();
  });

  it('finds only the newest durable compaction summary', async () => {
    const repository = dataSource.getRepository(AgentInstanceMessageEntity);
    await repository.insert([
      {
        messageId: 'summary-old',
        conversationId: 'conversation',
        originNodeId: 'desktop',
        originSequence: 50_001,
        turnId: 'summary-turn-old',
        timestamp: 20_000,
        lamportClock: 20_001,
        role: 'assistant',
        content: 'old',
        metadata: { contextCompaction: { version: 1 } },
        isContextCompaction: true,
      },
      {
        messageId: 'summary-new',
        conversationId: 'conversation',
        originNodeId: 'desktop',
        originSequence: 50_002,
        turnId: 'summary-turn-new',
        timestamp: 20_001,
        lamportClock: 20_002,
        role: 'assistant',
        content: 'new',
        metadata: { contextCompaction: { version: 1 } },
        isContextCompaction: true,
      },
    ]);
    expect((await getLatestContextCompactionSummary(repository, 'conversation'))?.messageId).toBe('summary-new');
    await repository.delete(['summary-old', 'summary-new']);
  });
});
