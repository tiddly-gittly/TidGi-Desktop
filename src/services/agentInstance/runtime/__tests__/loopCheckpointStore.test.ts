/** @vitest-environment node */
import 'reflect-metadata';

import { DataSource } from 'typeorm';
import { afterEach, describe, expect, it } from 'vitest';

import { AgentDefinitionEntity, AgentInstanceEntity, AgentInstanceMessageEntity } from '@/services/database/schema/agent';
import {
  AgentLoopCheckpointEntity,
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
import type { ConversationEvent, LoopCheckpointScope } from 'memeloop';
import { appendLocalConversationEvent, insertConversationEventsIfAbsent, rebuildConversationEventProjection } from '../../agentRepository';
import { DesktopLoopCheckpointStore } from '../loopCheckpointStore';

let dataSource: DataSource | undefined;
let secondDataSource: DataSource | undefined;

afterEach(async () => {
  if (dataSource?.isInitialized) await dataSource.destroy();
  if (secondDataSource?.isInitialized) await secondDataSource.destroy();
  dataSource = undefined;
  secondDataSource = undefined;
});

describe('DesktopLoopCheckpointStore', () => {
  it('persists, synchronizes, and deterministically replays canonical MJS milestones', async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [
        AgentDefinitionEntity,
        AgentInstanceEntity,
        AgentInstanceMessageEntity,
        AgentLoopCheckpointEntity,
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
    });
    await dataSource.initialize();
    await dataSource.getRepository(AgentDefinitionEntity).save({
      id: 'definition',
      name: 'Definition',
      description: 'Definition',
      systemPrompt: '',
      tools: [],
      version: '1',
      isCustomized: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    await appendLocalConversationEvent(dataSource, {
      kind: 'metadataPatch',
      eventId: 'metadata:create',
      conversationId: 'conversation-1',
      originNodeId: 'desktop',
      timestamp: 1,
      patch: { definitionId: 'definition', title: 'Conversation' },
    });
    const store = new DesktopLoopCheckpointStore(dataSource, async () => 'desktop');
    await store.saveCheckpoint('conversation-1', 'build:compiled', { artifact: 'sha256:first' });
    await expect(store.loadCheckpoint('conversation-1', 'build:compiled'))
      .resolves.toEqual({ artifact: 'sha256:first' });
    await store.saveCheckpoint('conversation-1', 'build:compiled', { artifact: 'sha256:second' });
    const restarted = new DesktopLoopCheckpointStore(dataSource, async () => 'desktop');
    await expect(restarted.loadCheckpoint('conversation-1', 'build:compiled'))
      .resolves.toEqual({ artifact: 'sha256:second' });

    await insertConversationEventsIfAbsent(dataSource, [{
      kind: 'loopCheckpoint',
      eventId: 'remote-newer',
      conversationId: 'conversation-1',
      originNodeId: 'remote-z',
      originSequence: 1,
      lamportClock: 100,
      timestamp: 100,
      checkpoint: { key: 'build:compiled', result: { artifact: 'sha256:remote' } },
    }]);
    await expect(restarted.loadCheckpoint('conversation-1', 'build:compiled'))
      .resolves.toEqual({ artifact: 'sha256:remote' });

    await insertConversationEventsIfAbsent(dataSource, [{
      kind: 'loopCheckpoint',
      eventId: 'remote-older-late-arrival',
      conversationId: 'conversation-1',
      originNodeId: 'remote-a',
      originSequence: 1,
      lamportClock: 50,
      timestamp: 101,
      checkpoint: { key: 'build:compiled', result: { artifact: 'sha256:stale' } },
    }]);
    await rebuildConversationEventProjection(dataSource, 'conversation-1');
    await expect(restarted.loadCheckpoint('conversation-1', 'build:compiled'))
      .resolves.toEqual({ artifact: 'sha256:remote' });

    await insertConversationEventsIfAbsent(
      dataSource,
      Array.from({ length: 257 }, (_, index) => ({
        kind: 'loopCheckpoint' as const,
        eventId: `bulk-checkpoint-${index + 1}`,
        conversationId: 'conversation-1',
        originNodeId: 'remote-bulk',
        originSequence: index + 1,
        lamportClock: 200 + index,
        timestamp: 200 + index,
        checkpoint: { key: 'state:bulk-progress', result: index + 1 },
      })),
    );
    await expect(restarted.loadCheckpoint('conversation-1', 'state:bulk-progress')).resolves.toBe(257);
  });

  it('hands raw checkpoint events from one independent store to another with fence conflict resolution', async () => {
    const entities = [
      AgentDefinitionEntity,
      AgentInstanceEntity,
      AgentInstanceMessageEntity,
      AgentLoopCheckpointEntity,
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
    ];
    dataSource = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities, synchronize: true });
    secondDataSource = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities, synchronize: true });
    await dataSource.initialize();
    await secondDataSource.initialize();
    const scope: LoopCheckpointScope = {
      scriptDigest: `sha256:${'1'.repeat(64)}`,
      apiVersion: 'loops.memeloop.io/v1alpha1',
      schemaVersion: '1',
      runId: 'handoff-run',
    };
    const sourceStore = new DesktopLoopCheckpointStore(dataSource, async () => 'source');
    await sourceStore.saveCheckpoint('handoff-conversation', 'phase', { value: 'fenced' }, {
      scope,
      fencingEpoch: 2,
      expectedRevision: 0,
    });
    const sourceRow = await dataSource.getRepository(ConversationEventEntity).findOneOrFail({
      where: { conversationId: 'handoff-conversation', kind: 'loopCheckpoint' },
    });
    const rawEvent = JSON.parse(sourceRow.eventJson) as ConversationEvent;
    if (rawEvent.kind !== 'loopCheckpoint') throw new Error('expected checkpoint event');
    await insertConversationEventsIfAbsent(secondDataSource, [rawEvent]);
    const targetStore = new DesktopLoopCheckpointStore(secondDataSource, async () => 'target');
    await expect(targetStore.loadCheckpoint('handoff-conversation', 'phase', { scope }))
      .resolves.toEqual({ value: 'fenced' });
    await expect(targetStore.loadCheckpoint('handoff-conversation', 'phase', {
      scope: {
        ...scope,
        scriptDigest: `sha256:${'2'.repeat(64)}`,
      },
    })).resolves.toBeUndefined();

    await insertConversationEventsIfAbsent(secondDataSource, [{
      ...rawEvent,
      eventId: 'stale-fence-event',
      originNodeId: 'stale-source',
      originSequence: 1,
      lamportClock: rawEvent.lamportClock + 100,
      checkpoint: {
        ...rawEvent.checkpoint,
        result: { value: 'stale' },
        fencingEpoch: 1,
        revision: 99,
      },
    }]);
    await expect(targetStore.loadCheckpoint('handoff-conversation', 'phase', { scope }))
      .resolves.toEqual({ value: 'fenced' });
  });
});
