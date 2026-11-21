/** Scoped conversation directory queries and revision-bound cursors. */
import { logger } from '@services/libs/log';
import type { ConversationListPage, ConversationListProjectionCursor, GetConversationListPageOptions } from 'memeloop';
import type { ConversationMeta } from 'memeloop';
import { decodeConversationProjectionCursor, encodeConversationProjectionCursor } from 'memeloop';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { canonicalJson, eventStoreError } from './conversationStorageUtilities';

export interface ConversationListProjectionScope {
  allowedConversationIds?: readonly string[];
  allowedDefinitionIds?: readonly string[];
  scopeKey: string;
}

function conversationListQueryDigest(
  query: GetConversationListPageOptions['query'],
  scope?: ConversationListProjectionScope,
): string {
  return createHash('sha256').update(canonicalJson({ query: query ?? {}, scopeKey: scope?.scopeKey ?? 'local' }), 'utf8').digest('base64url');
}

interface ConversationListRow {
  conversationId: string | null;
  title: string | null;
  lastMessagePreview: string | null;
  lastMessageTimestamp: number | null;
  messageCount: number | null;
  originClock: number | null;
  definitionId: string | null;
  instanceDeltaJson: string | null;
  isUserInitiated: number;
  sourceChannelJson: string | null;
  total: number;
}

type ConversationListConcreteRow = ConversationListRow & {
  conversationId: string;
  title: string;
  lastMessagePreview: string;
  lastMessageTimestamp: number;
  messageCount: number;
  originClock: number;
  definitionId: string;
};

function conversationMetaFromRow(row: ConversationListConcreteRow, localNodeId: string): ConversationMeta {
  return {
    conversationId: row.conversationId,
    title: row.title,
    lastMessagePreview: row.lastMessagePreview,
    lastMessageTimestamp: row.lastMessageTimestamp,
    messageCount: row.messageCount,
    originNodeId: localNodeId,
    originClock: row.originClock,
    definitionId: row.definitionId,
    ...(row.instanceDeltaJson
      ? { instanceDelta: { agentFrameworkConfig: JSON.parse(row.instanceDeltaJson) as unknown } }
      : {}),
    isUserInitiated: Boolean(row.isUserInitiated),
    ...(row.sourceChannelJson
      ? { sourceChannel: JSON.parse(row.sourceChannelJson) as ConversationMeta['sourceChannel'] }
      : {}),
  };
}

/** Exact canonical metadata point read; runtime hosts consume no local DTO. */
export async function getConversationMeta(
  dataSource: DataSource,
  localNodeId: string,
  conversationId: string,
): Promise<ConversationMeta | null> {
  if (
    !localNodeId || Buffer.byteLength(localNodeId, 'utf8') > 512 ||
    !conversationId || Buffer.byteLength(conversationId, 'utf8') > 512
  ) {
    throw eventStoreError('VALIDATION_ERROR', 'invalid conversation metadata identity');
  }
  const rows = await dataSource.query<ConversationListConcreteRow[]>(
    `SELECT instance.id AS conversationId,
       COALESCE(instance.name, instance.agentDefId) AS title,
       COALESCE(timeline.lastMessagePreview, '') AS lastMessagePreview,
       COALESCE(timeline.lastMessageTimestamp, 0) AS lastMessageTimestamp,
       COALESCE(timeline.totalMessages, 0) AS messageCount,
       COALESCE((
         SELECT MAX(event.lamportClock) FROM conversation_events AS event
         WHERE event.conversationId = instance.id AND event.originNodeId = ?
       ), 1) AS originClock,
       instance.agentDefId AS definitionId,
       instance.agentFrameworkConfig AS instanceDeltaJson,
       COALESCE((
         SELECT CAST(json_extract(initiated.valueJson, '$') AS INTEGER)
         FROM conversation_metadata_fields AS initiated
         WHERE initiated.conversationId = instance.id AND initiated.field = 'isUserInitiated'
       ), 1) AS isUserInitiated,
       (
         SELECT source.valueJson FROM conversation_metadata_fields AS source
         WHERE source.conversationId = instance.id AND source.field = 'sourceChannel'
       ) AS sourceChannelJson,
       1 AS total
     FROM agent_instances AS instance
     LEFT JOIN conversation_timeline_states AS timeline
       ON timeline.conversationId = instance.id
     WHERE instance.id = ?
     LIMIT 1`,
    [localNodeId, conversationId],
  );
  return rows[0] ? conversationMetaFromRow(rows[0], localNodeId) : null;
}

/** Constant-query-count, revisioned conversation directory page. */
export async function getConversationListPage(
  dataSource: DataSource,
  localNodeId: string,
  options: GetConversationListPageOptions,
  scope?: ConversationListProjectionScope,
): Promise<ConversationListPage> {
  if (
    !Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 100 ||
    !Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1 || options.maxBytes > 1024 * 1024
  ) throw eventStoreError('VALIDATION_ERROR', 'invalid conversation list page bounds');
  if (!localNodeId || Buffer.byteLength(localNodeId, 'utf8') > 512) {
    throw eventStoreError('VALIDATION_ERROR', 'invalid local node identity');
  }
  const selectors = [options.beforeCursor, options.afterCursor].filter(value => value !== undefined);
  if (selectors.length > 1) throw eventStoreError('VALIDATION_ERROR', 'conversation list cursor conflict');
  if (selectors.length === 1 && options.expectedRevision === undefined) {
    throw eventStoreError('VALIDATION_ERROR', 'conversation list cursor requires revision');
  }
  const query = options.query ?? {};
  if (scope) assertConversationListProjectionScope(scope);
  if (
    query.definitionId !== undefined && (query.definitionId.length === 0 || Buffer.byteLength(query.definitionId, 'utf8') > 512) ||
    query.sourceChannelId !== undefined && (query.sourceChannelId.length === 0 || Buffer.byteLength(query.sourceChannelId, 'utf8') > 512) ||
    query.isUserInitiated !== undefined && typeof query.isUserInitiated !== 'boolean'
  ) throw eventStoreError('VALIDATION_ERROR', 'invalid conversation list query');
  const [revisionRow] = await dataSource.query<Array<{ revision: number }>>(
    'SELECT revision FROM conversation_list_state WHERE id = 1',
  );
  const revision = String(revisionRow?.revision ?? 0);
  const reset = (): ConversationListPage => {
    const page = { reset: true as const, revision };
    if (Buffer.byteLength(canonicalJson(page), 'utf8') > options.maxBytes) {
      throw new Error('conversation_list_page_exceeds_byte_budget');
    }
    return page;
  };
  if (options.expectedRevision !== undefined && options.expectedRevision !== revision) return reset();
  const queryDigest = conversationListQueryDigest(query, scope);
  const encodedCursor = options.beforeCursor ?? options.afterCursor;
  let cursor: ConversationListProjectionCursor | undefined;
  if (encodedCursor !== undefined) {
    try {
      const decoded = decodeConversationProjectionCursor(encodedCursor, {
        kind: 'conversation-list',
        revision,
        queryDigest,
      });
      cursor = decoded.kind === 'conversation-list' ? decoded : undefined;
    } catch (error: unknown) {
      logger.debug('Resetting conversation list after invalid cursor', { error });
      return reset();
    }
  }

  const filters = ['instance.volatile = 0', 'instance.closed = 0'];
  const parameters: Array<string | number> = [];
  if (scope?.allowedConversationIds) {
    filters.push(`instance.id IN (${scope.allowedConversationIds.map(() => '?').join(', ')})`);
    parameters.push(...scope.allowedConversationIds);
  }
  if (scope?.allowedDefinitionIds) {
    filters.push(`instance.agentDefId IN (${scope.allowedDefinitionIds.map(() => '?').join(', ')})`);
    parameters.push(...scope.allowedDefinitionIds);
  }
  if (query.definitionId !== undefined) {
    filters.push('instance.agentDefId = ?');
    parameters.push(query.definitionId);
  }
  if (query.sourceChannelId !== undefined) {
    filters.push(`EXISTS (
      SELECT 1 FROM conversation_metadata_fields AS source
      WHERE source.conversationId = instance.id AND source.field = 'sourceChannel'
        AND json_extract(source.valueJson, '$.channelId') = ?
    )`);
    parameters.push(query.sourceChannelId);
  }
  if (query.isUserInitiated !== undefined) {
    filters.push(`COALESCE((
      SELECT CAST(json_extract(initiated.valueJson, '$') AS INTEGER)
      FROM conversation_metadata_fields AS initiated
      WHERE initiated.conversationId = instance.id AND initiated.field = 'isUserInitiated'
    ), 1) = ?`);
    parameters.push(query.isUserInitiated ? 1 : 0);
  }
  if (cursor) {
    const relation = options.beforeCursor !== undefined ? '<' : '>';
    filters.push(`(COALESCE(timeline.lastMessageTimestamp, 0), instance.id) ${relation} (?, ?)`);
    parameters.push(cursor.timestamp, cursor.conversationId);
  }
  const descending = options.afterCursor === undefined;
  const direction = descending ? 'DESC' : 'ASC';
  const rows = await dataSource.query<ConversationListRow[]>(
    `WITH filtered AS (
       SELECT instance.id, instance.agentDefId, instance.name,
         instance.agentFrameworkConfig,
         COALESCE(timeline.lastMessagePreview, '') AS lastMessagePreview,
         COALESCE(timeline.lastMessageTimestamp, 0) AS lastMessageTimestamp,
         COALESCE(timeline.totalMessages, 0) AS messageCount
       FROM agent_instances AS instance
       LEFT JOIN conversation_timeline_states AS timeline
         ON timeline.conversationId = instance.id
       WHERE ${filters.join(' AND ')}
     ), total AS (
       SELECT COUNT(*) AS count FROM agent_instances AS instance
       LEFT JOIN conversation_timeline_states AS timeline
         ON timeline.conversationId = instance.id
       WHERE ${filters.slice(0, filters.length - (cursor ? 1 : 0)).join(' AND ')}
     )
     SELECT filtered.id AS conversationId,
       COALESCE(filtered.name, filtered.agentDefId) AS title,
       filtered.lastMessagePreview, filtered.lastMessageTimestamp,
       filtered.messageCount,
       COALESCE((
         SELECT MAX(event.lamportClock) FROM conversation_events AS event
         WHERE event.conversationId = filtered.id AND event.originNodeId = ?
       ), 1) AS originClock,
       filtered.agentDefId AS definitionId,
       filtered.agentFrameworkConfig AS instanceDeltaJson,
       COALESCE((
         SELECT CAST(json_extract(initiated.valueJson, '$') AS INTEGER)
         FROM conversation_metadata_fields AS initiated
         WHERE initiated.conversationId = filtered.id AND initiated.field = 'isUserInitiated'
       ), 1) AS isUserInitiated,
       (
         SELECT source.valueJson FROM conversation_metadata_fields AS source
         WHERE source.conversationId = filtered.id AND source.field = 'sourceChannel'
       ) AS sourceChannelJson,
       total.count AS total
     FROM total LEFT JOIN filtered ON 1 = 1
     ORDER BY filtered.lastMessageTimestamp ${direction}, filtered.id ${direction}
     LIMIT ?`,
    [
      ...parameters,
      ...parameters.slice(0, parameters.length - (cursor ? 2 : 0)),
      localNodeId,
      options.limit + 1,
    ],
  );
  const total = rows[0]?.total ?? 0;
  const availableRows = rows.filter((row): row is ConversationListConcreteRow => row.conversationId !== null);
  const hasExtra = availableRows.length > options.limit;
  let ordered = descending ? availableRows.slice(0, options.limit) : availableRows.slice(0, options.limit).reverse();
  let items = ordered.map(row => conversationMetaFromRow(row, localNodeId));
  const cursorFor = (row: ConversationListConcreteRow) =>
    encodeConversationProjectionCursor({
      version: 1,
      kind: 'conversation-list',
      revision,
      queryDigest,
      timestamp: row.lastMessageTimestamp,
      conversationId: row.conversationId,
    });
  const buildPage = (): ConversationListPage => {
    const firstIndex = items.length === 0 ? -1 : ordered.length - items.length;
    const pageRows = firstIndex <= 0 ? ordered : ordered.slice(firstIndex);
    const first = pageRows[0];
    const last = pageRows.at(-1);
    return {
      reset: false,
      items,
      revision,
      total,
      hasMoreBefore: options.afterCursor !== undefined || hasExtra,
      hasMoreAfter: options.afterCursor !== undefined ? hasExtra : options.beforeCursor !== undefined,
      ...(first ? { startCursor: cursorFor(first) } : {}),
      ...(last ? { endCursor: cursorFor(last) } : {}),
    };
  };
  while (Buffer.byteLength(canonicalJson(buildPage()), 'utf8') > options.maxBytes) {
    if (items.length === 0) throw new Error('conversation_list_page_exceeds_byte_budget');
    if (options.afterCursor !== undefined) {
      items = items.slice(1);
      ordered = ordered.slice(1);
    } else {
      items = items.slice(0, -1);
      ordered = ordered.slice(0, -1);
    }
  }
  return buildPage();
}

function assertConversationListProjectionScope(scope: ConversationListProjectionScope): void {
  const assertIds = (ids: readonly string[] | undefined, field: string): void => {
    if (ids === undefined) return;
    if (
      ids.length < 1 || ids.length > 256 || new Set(ids).size !== ids.length ||
      ids.some(id => id.length < 1 || Buffer.byteLength(id, 'utf8') > 512)
    ) throw eventStoreError('VALIDATION_ERROR', `invalid conversation list ${field} scope`);
  };
  assertIds(scope.allowedConversationIds, 'conversation');
  assertIds(scope.allowedDefinitionIds, 'definition');
  if (!scope.scopeKey || Buffer.byteLength(scope.scopeKey, 'utf8') > 16 * 1024) {
    throw eventStoreError('VALIDATION_ERROR', 'invalid conversation list scope key');
  }
}
