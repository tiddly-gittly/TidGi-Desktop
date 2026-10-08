/** @vitest-environment node */
import 'reflect-metadata';

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
import { getConversationListPage } from '../agentRepository';

class ListQueryLogger implements Logger {
  public statements: string[] = [];
  public logQuery(query: string): void {
    this.statements.push(query);
  }
  public logQueryError(): void {}
  public logQuerySlow(): void {}
  public logSchemaBuild(): void {}
  public logMigration(): void {}
  public log(): void {}
  public reset(): void {
    this.statements = [];
  }
}

describe('revisioned conversation directory paging', () => {
  let dataSource: DataSource;
  const logger = new ListQueryLogger();

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
        ConversationMetadataFieldEntity,
        ConversationTimelineEntryEntity,
        ConversationTimelineRankCheckpointEntity,
        ConversationTimelineStateEntity,
        ConversationTurnTombstoneEntity,
      ],
      synchronize: true,
      logging: ['query'],
      logger,
    });
    await dataSource.initialize();
    await dataSource.getRepository(AgentDefinitionEntity).insert({
      id: 'definition',
      name: 'Directory test',
      description: '',
      systemPrompt: '',
      tools: [],
      version: '1.0.0',
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    for (let start = 0; start < 10_000; start += 500) {
      const instances = Array.from({ length: 500 }, (_, offset) => {
        const index = start + offset;
        const id = `conversation-${index.toString().padStart(5, '0')}`;
        return {
          id,
          agentDefId: 'definition',
          name: `Conversation ${index}`,
          status: { state: 'completed' as const },
          created: new Date(index),
          modified: new Date(index),
          closed: false,
          volatile: false,
        };
      });
      await dataSource.getRepository(AgentInstanceEntity).insert(instances);
      await dataSource.getRepository(ConversationTimelineStateEntity).insert(instances.map((instance, offset) => {
        const index = start + offset;
        return {
          conversationId: instance.id,
          revision: 1,
          totalMessages: index,
          totalTurns: Math.floor(index / 2),
          totalEntries: Math.floor(index / 2),
          lastMessagePreview: `last ${index}`,
          lastMessageTimestamp: index,
        };
      }));
    }
    await dataSource.getRepository(ConversationListStateEntity).insert({ id: 1, revision: 7 });
  }, 30_000);

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('reads 200 of 10k conversations with constant query count and no OFFSET', async () => {
    logger.reset();
    const startedAt = performance.now();
    const first = await getConversationListPage(dataSource, 'desktop-node', {
      limit: 100,
      maxBytes: 256 * 1024,
    });
    expect(first.reset).toBe(false);
    if (first.reset) throw new Error('unexpected reset');
    const second = await getConversationListPage(dataSource, 'desktop-node', {
      limit: 100,
      maxBytes: 256 * 1024,
      expectedRevision: first.revision,
      beforeCursor: first.endCursor,
    });
    const elapsedMs = performance.now() - startedAt;
    expect(second.reset).toBe(false);
    if (second.reset) throw new Error('unexpected reset');
    expect(first.total).toBe(10_000);
    expect(first.items).toHaveLength(100);
    expect(second.items).toHaveLength(100);
    expect(first.items[0]?.conversationId).toBe('conversation-09999');
    expect(second.items[0]?.conversationId).toBe('conversation-09899');
    expect(logger.statements).toHaveLength(4);
    expect(logger.statements.some(statement => /\bOFFSET\b/i.test(statement))).toBe(false);
    expect(Buffer.byteLength(JSON.stringify(first), 'utf8')).toBeLessThan(256 * 1024);
    expect(elapsedMs).toBeLessThan(300);
    console.info('conversation-list-performance', { elapsedMs, statements: logger.statements.length });
  });

  it('binds cursors to revision and exact query scope', async () => {
    const page = await getConversationListPage(dataSource, 'desktop-node', {
      limit: 10,
      maxBytes: 64 * 1024,
    });
    if (page.reset) throw new Error('unexpected reset');
    await expect(getConversationListPage(dataSource, 'desktop-node', {
      limit: 10,
      maxBytes: 64 * 1024,
      expectedRevision: '6',
      beforeCursor: page.endCursor,
    })).resolves.toEqual({ reset: true, revision: '7' });
    await expect(getConversationListPage(dataSource, 'desktop-node', {
      limit: 10,
      maxBytes: 64 * 1024,
      expectedRevision: page.revision,
      beforeCursor: page.endCursor,
      query: { definitionId: 'different' },
    })).resolves.toEqual({ reset: true, revision: '7' });
  });
});
