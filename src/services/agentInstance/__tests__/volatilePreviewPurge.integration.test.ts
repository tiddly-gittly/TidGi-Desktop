/** @vitest-environment node */
import 'reflect-metadata';

import { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AgentDefinitionEntity, AgentInstanceEntity, AgentInstanceMessageEntity, ScheduledTaskEntity } from '@services/database/schema/agent';
import {
  AgentLoopCheckpointEntity,
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
} from '@services/database/schema/conversationEvent';
import { appendLocalConversationEvent, discardVolatileAgentPreview } from '../agentRepository';

const entities = [
  AgentDefinitionEntity,
  AgentInstanceEntity,
  AgentInstanceMessageEntity,
  ScheduledTaskEntity,
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
  AgentLoopCheckpointEntity,
];

const PREVIEW_ID = 'preview-conversation';
const TEMPORARY_DEFINITION_ID = 'temp-preview-definition';
const UNRELATED_TEMPORARY_DEFINITION_ID = 'temp-unrelated-definition';
const DURABLE_ID = 'durable-conversation';
const DURABLE_DEFINITION_ID = 'durable-definition';

describe('volatile Agent preview purge', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities,
      synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.getRepository(AgentDefinitionEntity).insert([
      {
        id: TEMPORARY_DEFINITION_ID,
        name: 'Disposable preview',
        description: '',
        systemPrompt: '',
        tools: [],
        version: '1.0.0',
      },
      {
        id: UNRELATED_TEMPORARY_DEFINITION_ID,
        name: 'Unrelated temporary definition',
        description: '',
        systemPrompt: '',
        tools: [],
        version: '1.0.0',
      },
      {
        id: DURABLE_DEFINITION_ID,
        name: 'Durable agent',
        description: '',
        systemPrompt: '',
        tools: [],
        version: '1.0.0',
      },
    ]);
    await dataSource.getRepository(AgentInstanceEntity).insert([
      {
        id: PREVIEW_ID,
        agentDefId: TEMPORARY_DEFINITION_ID,
        status: { state: 'completed' },
        closed: false,
        volatile: true,
        preview: true,
      },
      {
        id: DURABLE_ID,
        agentDefId: DURABLE_DEFINITION_ID,
        status: { state: 'completed' },
        closed: false,
        volatile: false,
      },
    ]);

    await appendLocalConversationEvent(dataSource, {
      kind: 'metadataPatch',
      eventId: 'preview-metadata',
      conversationId: PREVIEW_ID,
      originNodeId: 'desktop',
      timestamp: 1,
      patch: { definitionId: TEMPORARY_DEFINITION_ID, title: 'Preview', isUserInitiated: false },
    });
    await appendLocalConversationEvent(dataSource, {
      kind: 'message',
      eventId: 'preview-user',
      conversationId: PREVIEW_ID,
      originNodeId: 'desktop',
      timestamp: 2,
      message: { messageId: 'preview-user', turnId: 'preview-user', role: 'user', content: 'hello', parts: [{ type: 'text', text: 'hello' }] },
    });
    await appendLocalConversationEvent(dataSource, {
      kind: 'message',
      eventId: 'preview-assistant',
      conversationId: PREVIEW_ID,
      originNodeId: 'desktop',
      timestamp: 3,
      message: { messageId: 'preview-assistant', turnId: 'preview-user', role: 'assistant', content: 'world', parts: [{ type: 'text', text: 'world' }] },
    });
    await appendLocalConversationEvent(dataSource, {
      kind: 'message',
      eventId: 'durable-user',
      conversationId: DURABLE_ID,
      originNodeId: 'desktop',
      timestamp: 4,
      message: { messageId: 'durable-user', turnId: 'durable-user', role: 'user', content: 'keep me', parts: [{ type: 'text', text: 'keep me' }] },
    });

    await dataSource.getRepository(ConversationTurnTombstoneEntity).insert({
      conversationId: PREVIEW_ID,
      turnId: 'old-preview-turn',
      eventId: 'preview-tombstone',
      originNodeId: 'desktop',
      originSequence: 4,
      lamportClock: 4,
      timestamp: 4,
    });
    await dataSource.getRepository(AgentRunStateEntity).insert({
      runId: 'preview-run',
      conversationId: PREVIEW_ID,
      definitionId: TEMPORARY_DEFINITION_ID,
      turnId: 'preview-user',
      requestPeerId: 'desktop',
      requestId: 'preview-request',
      payloadDigest: 'digest',
      state: 'completed',
      acceptedAt: 1,
      updatedAt: 2,
    });
    await dataSource.getRepository(ScheduledTaskEntity).insert({
      id: 'preview-task',
      agentInstanceId: PREVIEW_ID,
      agentDefinitionId: TEMPORARY_DEFINITION_ID,
      name: 'Disposable task',
      scheduleKind: 'cron',
      schedule: { kind: 'cron', expression: '* * * * *' },
      enabled: true,
      state: 'active',
      executionNodeId: 'desktop',
      originNodeId: 'desktop',
    });
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('removes canonical and derived rows before the volatile instance and temporary definition', async () => {
    expect(await dataSource.getRepository(AgentInstanceMessageEntity).countBy({ conversationId: PREVIEW_ID })).toBe(2);
    expect(await dataSource.getRepository(ConversationEventEntity).countBy({ conversationId: PREVIEW_ID })).toBe(3);
    expect(await dataSource.getRepository(ConversationTimelineEntryEntity).countBy({ conversationId: PREVIEW_ID })).toBeGreaterThan(0);

    await discardVolatileAgentPreview(dataSource, {
      agentId: PREVIEW_ID,
      temporaryDefinitionId: TEMPORARY_DEFINITION_ID,
    });
    await expect(discardVolatileAgentPreview(dataSource, {
      agentId: PREVIEW_ID,
      temporaryDefinitionId: TEMPORARY_DEFINITION_ID,
    })).resolves.toBeUndefined();

    for (
      const entity of [
        AgentInstanceMessageEntity,
        ConversationEventEntity,
        ConversationEventSequenceEntity,
        ConversationMessageDetailEntity,
        ConversationAttachmentReferenceEntity,
        ConversationTurnTombstoneEntity,
        ConversationMetadataFieldEntity,
        ConversationTimelineStateEntity,
        ConversationTimelineEntryEntity,
        ConversationTimelineRankCheckpointEntity,
        AgentLoopCheckpointEntity,
        AgentRunStateEntity,
      ]
    ) {
      expect(await dataSource.getRepository(entity).countBy({ conversationId: PREVIEW_ID })).toBe(0);
    }
    expect(await dataSource.getRepository(ScheduledTaskEntity).countBy({ agentInstanceId: PREVIEW_ID })).toBe(0);
    expect(await dataSource.getRepository(AgentInstanceEntity).findOneBy({ id: PREVIEW_ID })).toBeNull();
    expect(await dataSource.getRepository(AgentDefinitionEntity).findOneBy({ id: TEMPORARY_DEFINITION_ID })).toBeNull();

    expect(await dataSource.getRepository(AgentInstanceEntity).findOneBy({ id: DURABLE_ID })).not.toBeNull();
    expect(await dataSource.getRepository(AgentDefinitionEntity).findOneBy({ id: DURABLE_DEFINITION_ID })).not.toBeNull();
    expect(await dataSource.getRepository(AgentInstanceMessageEntity).countBy({ conversationId: DURABLE_ID })).toBe(1);
    expect(await dataSource.getRepository(ConversationEventEntity).countBy({ conversationId: DURABLE_ID })).toBe(1);
  });

  it('fails closed for durable instances and permanent definitions without changing either', async () => {
    await expect(discardVolatileAgentPreview(dataSource, { agentId: DURABLE_ID }))
      .rejects.toThrow(`Refusing to discard non-preview or non-volatile agent instance: ${DURABLE_ID}`);
    await expect(discardVolatileAgentPreview(dataSource, { temporaryDefinitionId: DURABLE_DEFINITION_ID }))
      .rejects.toThrow(`Refusing to discard non-temporary agent definition: ${DURABLE_DEFINITION_ID}`);
    await expect(discardVolatileAgentPreview(dataSource, {
      agentId: PREVIEW_ID,
      temporaryDefinitionId: UNRELATED_TEMPORARY_DEFINITION_ID,
    })).rejects.toThrow('Volatile preview does not belong to the supplied temporary definition');

    expect(await dataSource.getRepository(AgentInstanceEntity).findOneBy({ id: DURABLE_ID })).not.toBeNull();
    expect(await dataSource.getRepository(AgentDefinitionEntity).findOneBy({ id: DURABLE_DEFINITION_ID })).not.toBeNull();
    expect(await dataSource.getRepository(AgentInstanceMessageEntity).countBy({ conversationId: DURABLE_ID })).toBe(1);
    expect(await dataSource.getRepository(ConversationEventEntity).countBy({ conversationId: DURABLE_ID })).toBe(1);
    expect(await dataSource.getRepository(AgentInstanceEntity).findOneBy({ id: PREVIEW_ID })).not.toBeNull();
    expect(await dataSource.getRepository(AgentDefinitionEntity).findOneBy({ id: UNRELATED_TEMPORARY_DEFINITION_ID })).not.toBeNull();
  });

  it('does not let a volatile runtime sub-agent use the renderer preview purge path', async () => {
    await dataSource.getRepository(AgentInstanceEntity).insert({
      id: 'volatile-sub-agent',
      agentDefId: DURABLE_DEFINITION_ID,
      status: { state: 'completed' },
      closed: false,
      volatile: true,
      preview: false,
    });

    await expect(discardVolatileAgentPreview(dataSource, { agentId: 'volatile-sub-agent' }))
      .rejects.toThrow('Refusing to discard non-preview or non-volatile agent instance: volatile-sub-agent');
    expect(await dataSource.getRepository(AgentInstanceEntity).findOneBy({ id: 'volatile-sub-agent' })).not.toBeNull();
  });
});
