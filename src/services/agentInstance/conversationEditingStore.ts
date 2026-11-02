import { type IChatTab, type TabItem, TabType } from '@/pages/Agent/types/tab';
import { AgentInstanceEntity, AgentInstanceMessageEntity } from '@services/database/schema/agent';
import { AgentBrowserTabEntity } from '@services/database/schema/agentBrowser';
import { ConversationBranchEntity, ConversationEditDraftEntity, ConversationForkEntity, ConversationWorkspaceChoiceEntity } from '@services/database/schema/conversationEditing';
import { ConversationAttachmentReferenceEntity, ConversationMessageDetailEntity } from '@services/database/schema/conversationEvent';
import SQLite from 'better-sqlite3';
import { pick } from 'lodash';
import {
  assertConversationEditText,
  assertPendingAgentUserMessageWithinLimits,
  type ChatMessage,
  conversationBranchIdentity,
  type ConversationBranchState,
  type ConversationDraftWrite,
  type ConversationEditSource,
  type ConversationForkRequest,
  copyConversationBranchPrefix,
} from 'memeloop';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { appendLocalConversationEventsInTransaction } from './agentRepository';
import { CANONICAL_MESSAGE_FIELDS } from './messageEntityProjection';

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function fullMessage(manager: EntityManager, conversationId: string, messageId: string): Promise<ChatMessage> {
  const row = await manager.getRepository(AgentInstanceMessageEntity).findOne({ where: { conversationId, messageId } });
  if (!row) throw new Error('conversation_edit_message_missing');
  const tombstones: unknown[] = await manager.query('SELECT 1 FROM conversation_turn_tombstones WHERE conversationId = ? AND turnId = ? LIMIT 1', [conversationId, row.turnId]);
  if (tombstones.length) throw new Error('conversation_edit_message_deleted');
  const detail = await manager.getRepository(ConversationMessageDetailEntity).findOne({ where: { conversationId, messageId } });
  return detail
    ? JSON.parse(detail.canonicalJson.toString('utf8')) as ChatMessage
    : pick(row, CANONICAL_MESSAGE_FIELDS);
}

export async function loadConversationEditSource(database: DataSource, conversationId: string, messageId: string): Promise<ConversationEditSource> {
  const source = await fullMessage(database.manager, conversationId, messageId);
  if (source.role !== 'user') throw new Error('conversation_edit_requires_user_message');
  assertConversationEditText(source.content);
  const draft = await database.getRepository(ConversationEditDraftEntity).findOne({ where: { conversationId, messageId } });
  return { text: source.content, sourceRevision: digest(source), draft: draft ? { text: draft.text, revision: draft.revision } : null };
}

export async function saveConversationEditDraft(database: DataSource, input: ConversationDraftWrite): Promise<number> {
  if (input.text !== null) assertConversationEditText(input.text);
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error('conversation_draft_revision_invalid');
  if (database.options.type !== 'better-sqlite3' || database.options.database === ':memory:') throw new Error('conversation_draft_database_invalid');
  const revision = input.expectedRevision + 1;
  // An independent autocommit connection cannot accidentally join a suspended
  // TypeORM transaction and report success before that transaction rolls back.
  // Never block the main thread waiting for a writer: the editor retains dirty
  // text on SQLITE_BUSY and lets the user retry.
  const connection = new SQLite(database.options.database, {
    fileMustExist: true,
    timeout: 0,
    nativeBinding: database.options.nativeBinding,
  });
  try {
    const source = connection.prepare('SELECT role, turnId FROM agent_instance_messages WHERE conversationId = ? AND messageId = ?')
      .get(input.conversationId, input.messageId) as { role: string; turnId: string } | undefined;
    if (!source) throw new Error('conversation_edit_message_missing');
    if (source.role !== 'user') throw new Error('conversation_edit_requires_user_message');
    if (connection.prepare('SELECT 1 FROM conversation_turn_tombstones WHERE conversationId = ? AND turnId = ? LIMIT 1').get(input.conversationId, source.turnId)) {
      throw new Error('conversation_edit_message_deleted');
    }
    const written = input.expectedRevision === 0
      ? connection.prepare(
        `INSERT INTO conversation_edit_drafts (conversationId, messageId, text, revision) VALUES (?, ?, ?, ?)
         ON CONFLICT(conversationId, messageId) DO NOTHING RETURNING revision`,
      ).get(input.conversationId, input.messageId, input.text, revision)
      : connection.prepare(
        `UPDATE conversation_edit_drafts SET text = ?, revision = ?
         WHERE conversationId = ? AND messageId = ? AND revision = ? RETURNING revision`,
      ).get(input.text, revision, input.conversationId, input.messageId, input.expectedRevision);
    if (!written) throw new Error('conversation_draft_conflict');
    return revision;
  } finally {
    connection.close();
  }
}

/** One SQLite snapshot and transaction, bounded history reads, idempotent publication. */
export async function forkConversation(database: DataSource, input: ConversationForkRequest, originNodeId: string): Promise<string> {
  assertConversationEditText(input.text);
  if (!input.text.trim()) throw new Error('conversation_edit_empty');
  for (const value of [input.conversationId, input.messageId, input.requestId, input.targetConversationId, input.replacementMessageId]) {
    if (!value || value.length > 512) throw new Error('conversation_fork_identity_invalid');
  }
  const payloadDigest = digest(input);
  return database.transaction(async manager => {
    const forks = manager.getRepository(ConversationForkEntity);
    const existing = await forks.findOne({ where: { requestId: input.requestId } });
    if (existing) {
      if (existing.payloadDigest !== payloadDigest) throw new Error('conversation_fork_request_conflict');
      return existing.targetConversationId;
    }
    const source = await fullMessage(manager, input.conversationId, input.messageId);
    if (source.role !== 'user' || digest(source) !== input.sourceRevision) throw new Error('conversation_edit_source_changed');
    const instances = manager.getRepository(AgentInstanceEntity);
    const parent = await instances.findOne({ where: { id: input.conversationId } });
    if (!parent || parent.status.state === 'working') throw new Error('conversation_branch_source_busy');
    if (await instances.existsBy({ id: input.targetConversationId })) throw new Error('conversation_branch_target_exists');
    const now = Date.now();
    const { beforeCommitMap: _beforeCommitMap, ...metadata } = source.metadata ?? {};
    assertPendingAgentUserMessageWithinLimits({
      conversationId: input.targetConversationId,
      originNodeId,
      timestamp: now,
      message: {
        messageId: input.replacementMessageId,
        turnId: input.replacementMessageId,
        role: 'user',
        content: input.text,
        contentType: 'text/plain',
        parts: [{ type: 'text', text: input.text }, ...source.parts.filter(part => part.type === 'attachment')],
        ...(source.attachments === undefined ? {} : { attachments: source.attachments }),
        metadata: {
          ...metadata,
          memeloopBranch: {
            ...conversationBranchIdentity(source),
            variantConversationId: input.targetConversationId,
            variantMessageId: input.replacementMessageId,
          },
        },
      },
    });
    await instances.save(instances.create({
      id: input.targetConversationId,
      agentDefId: parent.agentDefId,
      name: parent.name,
      modelConfig: parent.modelConfig,
      agentFrameworkConfig: parent.agentFrameworkConfig,
      status: { state: 'completed', modified: new Date(now) },
      created: new Date(now),
      modified: new Date(now),
      closed: false,
      volatile: false,
      preview: false,
    }));
    await appendLocalConversationEventsInTransaction(manager, [{
      kind: 'metadataPatch',
      eventId: `fork:${input.requestId}:metadata`,
      conversationId: input.targetConversationId,
      originNodeId,
      timestamp: now,
      patch: { definitionId: parent.agentDefId, title: parent.name ?? '' },
    }]);
    async function* prefix(): AsyncGenerator<ChatMessage> {
      let cursor: [number, number, string, string] | undefined;
      for (;;) {
        const rows: Array<{ messageId: string; timestamp: number; lamportClock: number; originNodeId: string }> = await manager.query(
          `SELECT message.messageId, message.timestamp, message.lamportClock, message.originNodeId
           FROM agent_instance_messages message
           WHERE message.conversationId = ? AND message.isContextCompaction = 0
             AND (message.timestamp, message.lamportClock, message.originNodeId, message.messageId) < (?, ?, ?, ?)
             ${cursor ? 'AND (message.timestamp, message.lamportClock, message.originNodeId, message.messageId) > (?, ?, ?, ?)' : ''}
             AND NOT EXISTS (SELECT 1 FROM conversation_turn_tombstones t WHERE t.conversationId = message.conversationId AND t.turnId = message.turnId)
           ORDER BY message.timestamp, message.lamportClock, message.originNodeId, message.messageId LIMIT 64`,
          [input.conversationId, source.timestamp, source.lamportClock, source.originNodeId, source.messageId, ...(cursor ?? [])],
        );
        if (rows.length === 0) return;
        for (const row of rows) yield await fullMessage(manager, input.conversationId, row.messageId);
        const last = rows.at(-1)!;
        cursor = [last.timestamp, last.lamportClock, last.originNodeId, last.messageId];
      }
    }
    await copyConversationBranchPrefix({
      sourceConversationId: input.conversationId,
      targetConversationId: input.targetConversationId,
      originNodeId,
      messages: prefix(),
      createId: sourceId => `fork:${digest([input.requestId, sourceId])}`,
      append: async draft => {
        await appendLocalConversationEventsInTransaction(manager, [draft]);
      },
    });
    const identity = conversationBranchIdentity(source);
    const branchRepository = manager.getRepository(ConversationBranchEntity);
    await branchRepository.upsert([
      { ...identity, createdAt: source.timestamp },
    ], ['variantConversationId', 'variantMessageId']);
    for (const reference of source.attachments ?? []) {
      const authorized = await manager.getRepository(ConversationAttachmentReferenceEntity).findOne({
        where: { conversationId: input.conversationId, ...reference },
      });
      if (!authorized) throw new Error('conversation_branch_attachment_unauthorized');
      await manager.getRepository(ConversationAttachmentReferenceEntity).upsert({
        contentHash: authorized.contentHash,
        filename: authorized.filename,
        mimeType: authorized.mimeType,
        size: authorized.size,
        conversationId: input.targetConversationId,
      }, ['conversationId', 'contentHash', 'filename', 'mimeType', 'size']);
    }
    await forks.save({
      requestId: input.requestId,
      targetConversationId: input.targetConversationId,
      replacementMessageId: input.replacementMessageId,
      payloadDigest,
      source,
      replacementText: input.text,
    });
    const choice = await manager.getRepository(ConversationWorkspaceChoiceEntity).findOne({ where: { conversationId: input.conversationId } });
    if (choice) await manager.getRepository(ConversationWorkspaceChoiceEntity).save({ workspaceId: choice.workspaceId, conversationId: input.targetConversationId });
    if (input.navigation) {
      const tabs = manager.getRepository(AgentBrowserTabEntity);
      const tab = await tabs.findOneBy({ id: input.navigation.tabId });
      const patch = {
        agentId: input.targetConversationId,
        initialMessage: input.text,
        initialWikiTiddlers: undefined,
        initialEditSource: { conversationId: input.conversationId, messageId: input.messageId, draftRevision: input.navigation.draftRevision },
      };
      if (tab?.tabType === TabType.CHAT && tab.opened && tab.data?.agentId === input.conversationId) {
        tab.data = { ...tab.data, ...patch };
        await tabs.save(tab);
      } else {
        let updated = false;
        for (const split of await tabs.findBy({ tabType: TabType.SPLIT_VIEW, opened: true })) {
          const children = Array.isArray(split.data?.childTabs) ? split.data.childTabs as TabItem[] : [];
          const index = children.findIndex(child => child.id === input.navigation!.tabId && child.type === TabType.CHAT);
          if (index < 0 || (children[index] as IChatTab).agentId !== input.conversationId) continue;
          children[index] = { ...children[index], ...patch };
          split.data = { ...split.data, childTabs: children };
          await tabs.save(split);
          updated = true;
          break;
        }
        if (!updated) throw new Error('conversation_edit_tab_changed');
      }
    }
    return input.targetConversationId;
  });
}

export async function getConversationBranches(database: DataSource, conversationId: string, messageIds: readonly string[]): Promise<ConversationBranchState[]> {
  if (messageIds.length > 256) throw new Error('conversation_branch_page_limit');
  const result: ConversationBranchState[] = [];
  for (const messageId of new Set(messageIds)) {
    const row = await database.getRepository(AgentInstanceMessageEntity).findOne({
      where: { conversationId, messageId },
      select: { messageId: true, conversationId: true, metadata: true, role: true },
    });
    if (!row || row.role !== 'user') continue;
    const identity = conversationBranchIdentity(row);
    const variants = await database.getRepository(ConversationBranchEntity).find({
      where: { rootConversationId: identity.rootConversationId, rootMessageId: identity.rootMessageId },
      order: { createdAt: 'ASC', variantConversationId: 'ASC' },
      take: 128,
    });
    if (variants.length < 2) continue;
    result.push({
      messageId,
      selected: Math.max(0, variants.findIndex(item => item.variantConversationId === identity.variantConversationId && item.variantMessageId === identity.variantMessageId)),
      alternatives: variants.map(item => ({ conversationId: item.variantConversationId, messageId: item.variantMessageId })),
    });
  }
  return result;
}
