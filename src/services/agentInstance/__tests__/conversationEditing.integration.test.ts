/** @vitest-environment node */
import 'reflect-metadata';
import { TabState, TabType } from '@/pages/Agent/types/tab';
import { AgentBrowserService } from '@services/agentBrowser';
import { AgentDefinitionEntity, AgentInstanceEntity, AgentInstanceMessageEntity } from '@services/database/schema/agent';
import { AgentBrowserTabEntity } from '@services/database/schema/agentBrowser';
import * as editingEntities from '@services/database/schema/conversationEditing';
import * as conversationEntities from '@services/database/schema/conversationEvent';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendLocalConversationEventsAtomic } from '../agentRepository';
import { forkConversation, getConversationBranches, loadConversationEditSource, saveConversationEditDraft } from '../conversationEditingStore';

describe('durable conversation editing', () => {
  let database: DataSource;
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tidgi-editing-'));
    database = new DataSource({
      type: 'better-sqlite3',
      database: join(directory, 'test.sqlite'),
      synchronize: true,
      entities: [
        AgentBrowserTabEntity,
        AgentDefinitionEntity,
        AgentInstanceEntity,
        AgentInstanceMessageEntity,
        ...Object.values(conversationEntities),
        ...Object.values(editingEntities),
      ],
    });
    await database.initialize();
    await database.query('PRAGMA journal_mode = WAL');
    await database.getRepository(AgentDefinitionEntity).save({
      id: 'definition',
      name: 'Branch test',
      description: '',
      systemPrompt: '',
      tools: [],
      version: '1.0.0',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await database.getRepository(AgentInstanceEntity).save({
      id: 'parent',
      agentDefId: 'definition',
      status: { state: 'completed' },
      created: new Date(),
      closed: false,
      volatile: false,
    });
    await appendLocalConversationEventsAtomic(
      database,
      [
        ['u1', 'user', 'First question', 'u1'],
        ['a1', 'assistant', 'First answer', 'u1'],
        ['u2', 'user', 'Second question with full source', 'u2'],
        ['a2', 'assistant', 'Original continuation', 'u2'],
      ].map(([messageId, role, content, turnId], index) => ({
        kind: 'message' as const,
        eventId: messageId,
        conversationId: 'parent',
        originNodeId: 'node',
        timestamp: index + 1,
        message: { messageId, turnId, role: role as 'user' | 'assistant', content, parts: [{ type: 'text' as const, text: content }] },
      })),
    );
  });
  afterEach(async () => {
    await database?.destroy();
    await rm(directory, { recursive: true, force: true });
  });

  it('keeps revision tombstones so a stale autosave cannot resurrect discarded text', async () => {
    const revision = await saveConversationEditDraft(database, { conversationId: 'parent', messageId: 'u2', text: 'draft', expectedRevision: 0 });
    await saveConversationEditDraft(database, { conversationId: 'parent', messageId: 'u2', text: null, expectedRevision: revision });
    await expect(saveConversationEditDraft(database, { conversationId: 'parent', messageId: 'u2', text: 'stale', expectedRevision: revision })).rejects.toThrow('conflict');
    expect((await loadConversationEditSource(database, 'parent', 'u2')).draft).toEqual({ text: null, revision: 2 });
  });

  it('allows exactly one competing write for the same draft revision', async () => {
    await saveConversationEditDraft(database, { conversationId: 'parent', messageId: 'u2', text: 'initial', expectedRevision: 0 });
    const outcomes = await Promise.allSettled(
      ['first window', 'second window'].map(text => saveConversationEditDraft(database, { conversationId: 'parent', messageId: 'u2', text, expectedRevision: 1 })),
    );
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === 'rejected')).toHaveLength(1);
    const draft = (await loadConversationEditSource(database, 'parent', 'u2')).draft;
    expect(draft?.revision).toBe(2);
    expect(['first window', 'second window']).toContain(draft?.text);
  });

  it('preserves a successful draft save when another connection transaction rolls back', async () => {
    await expect(database.transaction(async manager => {
      await manager.query('SELECT * FROM conversation_edit_drafts');
      expect(await saveConversationEditDraft(database, { conversationId: 'parent', messageId: 'u2', text: 'durable', expectedRevision: 0 })).toBe(1);
      throw new Error('outer_rollback');
    })).rejects.toThrow('outer_rollback');
    expect((await loadConversationEditSource(database, 'parent', 'u2')).draft).toEqual({ text: 'durable', revision: 1 });
  });

  it('rejects a locked draft save instead of reporting success inside another transaction', async () => {
    await expect(database.transaction(async manager => {
      await manager.query("UPDATE agent_instances SET name = 'uncommitted' WHERE id = 'parent'");
      await expect(saveConversationEditDraft(database, { conversationId: 'parent', messageId: 'u2', text: 'retry me', expectedRevision: 0 }))
        .rejects.toThrow('database is locked');
      throw new Error('outer_rollback');
    })).rejects.toThrow('outer_rollback');
    expect((await loadConversationEditSource(database, 'parent', 'u2')).draft).toBeNull();
    expect(await saveConversationEditDraft(database, { conversationId: 'parent', messageId: 'u2', text: 'retry me', expectedRevision: 0 })).toBe(1);
  });

  it('atomically forks only the prefix, preserves the original continuation and replays idempotently', async () => {
    const source = await loadConversationEditSource(database, 'parent', 'u2');
    const request = {
      conversationId: 'parent',
      messageId: 'u2',
      sourceRevision: source.sourceRevision,
      text: 'Edited second question',
      requestId: 'request-1',
      targetConversationId: 'child',
      replacementMessageId: 'replacement',
    };
    expect(await forkConversation(database, request, 'node')).toBe('child');
    expect(await forkConversation(database, request, 'node')).toBe('child');
    const parent = await database.getRepository(AgentInstanceMessageEntity).find({ where: { conversationId: 'parent' }, order: { timestamp: 'ASC' } });
    const child = await database.getRepository(AgentInstanceMessageEntity).find({ where: { conversationId: 'child' }, order: { timestamp: 'ASC' } });
    expect(parent.map(row => row.content)).toEqual(['First question', 'First answer', 'Second question with full source', 'Original continuation']);
    expect(child.map(row => row.content)).toEqual(['First question', 'First answer']);
    expect(child[0].messageId).not.toBe('u1');
    expect(child[1].turnId).toBe(child[0].turnId);
    // Pending branches stay hidden until the edited root is durably accepted.
    expect(await getConversationBranches(database, 'parent', ['u2'])).toEqual([]);
    await appendLocalConversationEventsAtomic(database, [{
      kind: 'message',
      eventId: 'replacement',
      conversationId: 'child',
      originNodeId: 'node',
      timestamp: Date.now(),
      message: {
        messageId: 'replacement',
        turnId: 'replacement',
        role: 'user',
        content: request.text,
        parts: [{ type: 'text', text: request.text }],
        metadata: {
          memeloopBranch: {
            rootConversationId: 'parent',
            rootMessageId: 'u2',
            variantConversationId: 'child',
            variantMessageId: 'replacement',
          },
        },
      },
    }]);
    expect(await getConversationBranches(database, 'parent', ['u2'])).toMatchObject([{
      messageId: 'u2',
      selected: 0,
      alternatives: [{ conversationId: 'parent' }, { conversationId: 'child' }],
    }]);
    await expect(forkConversation(database, { ...request, text: 'conflicting retry' }, 'node')).rejects.toThrow('request_conflict');
    await expect(forkConversation(database, { ...request, requestId: 'stale', targetConversationId: 'stale-child', sourceRevision: 'stale' }, 'node')).rejects.toThrow(
      'source_changed',
    );
    expect(await database.getRepository(AgentInstanceEntity).findOneBy({ id: 'stale-child' })).toBeNull();
  });

  it('rejects an oversized edit before creating a branch or navigation state', async () => {
    const source = await loadConversationEditSource(database, 'parent', 'u2');
    await expect(forkConversation(database, {
      conversationId: 'parent',
      messageId: 'u2',
      sourceRevision: source.sourceRevision,
      text: 'x'.repeat(300 * 1024),
      requestId: 'oversized',
      targetConversationId: 'too-large',
      replacementMessageId: 'replacement',
    }, 'node')).rejects.toThrow();
    expect(await database.getRepository(AgentInstanceEntity).findOneBy({ id: 'too-large' })).toBeNull();
    expect(await database.getRepository(editingEntities.ConversationForkEntity).count()).toBe(0);
  });

  it('rolls back the entire fork if its tab was changed concurrently', async () => {
    const source = await loadConversationEditSource(database, 'parent', 'u2');
    await expect(forkConversation(database, {
      conversationId: 'parent',
      messageId: 'u2',
      sourceRevision: source.sourceRevision,
      text: 'branch',
      requestId: 'tab-race',
      targetConversationId: 'tab-child',
      replacementMessageId: 'replacement',
      navigation: { tabId: 'missing-tab', draftRevision: 1 },
    }, 'node')).rejects.toThrow('tab_changed');
    expect(await database.getRepository(AgentInstanceEntity).findOneBy({ id: 'tab-child' })).toBeNull();
    expect(await database.getRepository(editingEntities.ConversationForkEntity).count()).toBe(0);
  });

  it.each([false, true])('commits pending navigation and clears its draft only after the edited root exists (split=%s)', async split => {
    const tabs = database.getRepository(AgentBrowserTabEntity);
    const child = { id: 'tab', type: TabType.CHAT, agentId: 'parent' };
    await tabs.save({
      id: split ? 'split' : 'tab',
      tabType: split ? TabType.SPLIT_VIEW : TabType.CHAT,
      title: 'test',
      state: TabState.ACTIVE,
      opened: true,
      data: split ? { childTabs: [child] } : { agentId: 'parent' },
    });
    const revision = await saveConversationEditDraft(database, {
      conversationId: 'parent',
      messageId: 'u2',
      text: 'edited',
      expectedRevision: 0,
    });
    const source = await loadConversationEditSource(database, 'parent', 'u2');
    const messageId = 'initial:tab:child:turn';
    await forkConversation(database, {
      conversationId: 'parent',
      messageId: 'u2',
      sourceRevision: source.sourceRevision,
      text: 'edited',
      requestId: 'pending',
      targetConversationId: 'child',
      replacementMessageId: messageId,
      navigation: { tabId: 'tab', draftRevision: revision },
    }, 'node');
    const service = new AgentBrowserService();
    Object.assign(service, { dataSource: database, tabRepository: tabs, updateTabsObservable: vi.fn() });
    expect(await service.acknowledgeInitialMessage('tab', 'child', 'edited')).toBe(false);
    expect((await loadConversationEditSource(database, 'parent', 'u2')).draft?.text).toBe('edited');
    await appendLocalConversationEventsAtomic(database, [{
      kind: 'message',
      eventId: messageId,
      conversationId: 'child',
      originNodeId: 'node',
      timestamp: Date.now(),
      message: { messageId, turnId: messageId, role: 'user', content: 'edited', parts: [{ type: 'text', text: 'edited' }] },
    }]);
    expect(await service.acknowledgeInitialMessage('tab', 'child', 'edited')).toBe(true);
    expect((await loadConversationEditSource(database, 'parent', 'u2')).draft).toEqual({ text: null, revision: revision + 1 });
    expect(await service.acknowledgeInitialMessage('tab', 'child', 'edited')).toBe(false);
  });
});
