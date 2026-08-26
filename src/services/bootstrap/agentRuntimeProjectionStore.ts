import { createHash } from 'node:crypto';

import type { IAgentInstanceService } from '@/services/agentInstance/interface';
import {
  AGENT_DEVICE_RPC_LIMITS,
  type AgentDeviceRpcListConversationsResponse,
  type AgentDeviceRpcListTurnsResponse,
  type AgentDeviceRpcTurnSummary,
  type AgentRuntimeRpcProjectionStore,
  type ConversationTimelineEntry,
} from 'memeloop';

const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,2048}$/u;

interface ProjectionCursor {
  v: 1;
  kind: 'conversation' | 'timeline';
  scope: string;
  revision: string;
  cursor: string;
}

/** Grant-scoped, bounded SQL projection binding required by Agent RPC v2. */
export function createDesktopAgentRuntimeProjectionStore(
  service: IAgentInstanceService,
  localNodeId: string,
): AgentRuntimeRpcProjectionStore {
  return {
    async listConversations(request, context): Promise<AgentDeviceRpcListConversationsResponse> {
      context.signal?.throwIfAborted();
      const scope = digestScope(context.scopeKey);
      const cursor = request.cursor ? decodeCursor(request.cursor, 'conversation', scope) : undefined;
      const seen = request.seenCursor ? decodeCursor(request.seenCursor, 'conversation', scope) : undefined;
      const direction = request.direction ?? 'backward';
      const page = await service.getAgentConversationListPageScoped(localNodeId, {
        limit: request.limit ?? AGENT_DEVICE_RPC_LIMITS.conversationListPage,
        maxBytes: AGENT_DEVICE_RPC_LIMITS.conversationListBytes,
        ...(cursor
          ? {
            expectedRevision: cursor.revision,
            ...(direction === 'forward' ? { afterCursor: cursor.cursor } : { beforeCursor: cursor.cursor }),
          }
          : {}),
      }, {
        allowedConversationIds: context.allowedConversationIds,
        allowedDefinitionIds: context.allowedDefinitionIds,
        scopeKey: context.scopeKey,
      });
      context.signal?.throwIfAborted();
      if (page.reset) throw new Error('conversation_list_cursor_invalidated');
      return {
        items: page.items,
        hasMoreBefore: page.hasMoreBefore,
        hasMoreAfter: page.hasMoreAfter,
        ...(page.hasMoreBefore && page.startCursor
          ? { previousCursor: encodeCursor('conversation', scope, page.revision, page.startCursor) }
          : {}),
        ...(page.hasMoreAfter && page.endCursor
          ? { nextCursor: encodeCursor('conversation', scope, page.revision, page.endCursor) }
          : {}),
        ...(seen ? { seenCursorFound: seen.revision === page.revision } : {}),
      };
    },

    async listTurns(request, context): Promise<AgentDeviceRpcListTurnsResponse> {
      context.signal?.throwIfAborted();
      const scope = digestScope(request.conversationId);
      const cursor = request.cursor ? decodeCursor(request.cursor, 'timeline', scope) : undefined;
      const seen = request.seenCursor ? decodeCursor(request.seenCursor, 'timeline', scope) : undefined;
      const direction = request.direction ?? 'backward';
      const byteBudget = request.byteBudget ?? AGENT_DEVICE_RPC_LIMITS.projectionPageDefaultBytes;
      const renderLineBudget = request.renderLineBudget ?? AGENT_DEVICE_RPC_LIMITS.turnRenderLines;
      const page = await service.getAgentConversationTimelinePage(request.conversationId, {
        limit: Math.min(request.limit ?? AGENT_DEVICE_RPC_LIMITS.turnListPage, AGENT_DEVICE_RPC_LIMITS.timelinePage),
        maxBytes: Math.min(byteBudget, AGENT_DEVICE_RPC_LIMITS.timelinePageMaxBytes),
        ...(cursor
          ? {
            expectedRevision: cursor.revision,
            ...(direction === 'forward' ? { afterCursor: cursor.cursor } : { beforeCursor: cursor.cursor }),
          }
          : {}),
      });
      context.signal?.throwIfAborted();
      if (page.reset) throw new Error('conversation_timeline_cursor_invalidated');

      const mapped = page.items.map(toTurnSummary);
      let items = mapped;
      let truncated = false;
      const build = (): AgentDeviceRpcListTurnsResponse => {
        const first = items[0];
        const last = items.at(-1);
        const response: AgentDeviceRpcListTurnsResponse = {
          items,
          hasMoreBefore: page.hasMoreBefore || items.length < mapped.length && direction !== 'forward',
          hasMoreAfter: page.hasMoreAfter || items.length < mapped.length && direction === 'forward',
          ...((page.hasMoreBefore || items.length < mapped.length && direction !== 'forward') && first
            ? { previousCursor: encodeCursor('timeline', scope, page.revision, first.cursor) }
            : {}),
          ...((page.hasMoreAfter || items.length < mapped.length && direction === 'forward') && last
            ? { nextCursor: encodeCursor('timeline', scope, page.revision, last.cursor) }
            : {}),
          ...(seen ? { seenCursorFound: seen.revision === page.revision } : {}),
          budget: { bytes: 0, renderLines: turnRenderLines(items), truncated },
        };
        response.budget.bytes = jsonBytes(response);
        response.budget.bytes = jsonBytes(response);
        return response;
      };
      for (;;) {
        const response = build();
        if (response.budget.bytes <= byteBudget && response.budget.renderLines <= renderLineBudget) return response;
        if (items.length === 0) throw new Error('turn_projection_budget_too_small');
        truncated = true;
        items = direction === 'forward' ? items.slice(0, -1) : items.slice(1);
      }
    },

    async getTurnDetail(request, context) {
      context.signal?.throwIfAborted();
      const result = await service.getAgentTurnDetail(request);
      context.signal?.throwIfAborted();
      return result;
    },
  };
}

function toTurnSummary(entry: ConversationTimelineEntry): AgentDeviceRpcTurnSummary {
  if (entry.kind === 'turn') {
    return {
      turnId: entry.turnId,
      conversationId: entry.conversationId,
      cursor: entry.cursor,
      startedAt: entry.timestamp,
      updatedAt: entry.timestamp,
      userPreview: entry.userPreview,
      participantPreviews: entry.participantPreviews,
      responseCount: entry.responseCount,
      isCompaction: false,
      isTombstone: false,
      detailState: 'notLoaded',
    };
  }
  return {
    turnId: entry.entryId,
    conversationId: entry.conversationId,
    cursor: entry.cursor,
    startedAt: entry.timestamp,
    updatedAt: entry.timestamp,
    userPreview: entry.summaryPreview,
    participantPreviews: [],
    responseCount: 0,
    isCompaction: true,
    compactedMessageCount: entry.compactedMessageCount,
    isTombstone: false,
    detailState: 'summary',
  };
}

function turnRenderLines(items: readonly AgentDeviceRpcTurnSummary[]): number {
  return items.reduce((total, item) => {
    const previews = [item.userPreview, ...item.participantPreviews.map(preview => preview.preview)];
    return total + previews.reduce((lines, preview) => lines + preview.split('\n').length, 0);
  }, 0);
}

function digestScope(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('base64url');
}

function encodeCursor(kind: ProjectionCursor['kind'], scope: string, revision: string, cursor: string): string {
  const value = Buffer.from(JSON.stringify({ v: 1, kind, scope, revision, cursor } satisfies ProjectionCursor), 'utf8').toString('base64url');
  if (value.length > 2048) throw new Error('agent_projection_cursor_too_large');
  return value;
}

function decodeCursor(value: string, kind: ProjectionCursor['kind'], scope: string): ProjectionCursor {
  if (!CURSOR_PATTERN.test(value)) throw new Error('agent_projection_cursor_invalid');
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new Error('agent_projection_cursor_invalid');
  }
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('agent_projection_cursor_invalid');
  const record = decoded as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(',') !== 'cursor,kind,revision,scope,v' || record.v !== 1 ||
    record.kind !== kind || record.scope !== scope || typeof record.revision !== 'string' ||
    record.revision.length < 1 || record.revision.length > 512 || typeof record.cursor !== 'string' ||
    record.cursor.length < 1 || record.cursor.length > 2048 ||
    encodeCursor(kind, scope, record.revision, record.cursor) !== value
  ) throw new Error('agent_projection_cursor_invalid');
  return record as unknown as ProjectionCursor;
}

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}
