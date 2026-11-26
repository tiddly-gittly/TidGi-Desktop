/** Shared storage encoding, visibility, and projection primitives. */
import { MAX_CANONICAL_JSON_DEPTH, MAX_CANONICAL_JSON_NODES } from '@/constants/agentStorage';
import type { ChatMessage, ConversationEvent } from 'memeloop';
import { assertCanonicalConversationEvent, canonicalConversationEventBytes, conversationEventToMessage, createChatMessage, OrchestrationError } from 'memeloop';
import { EntityManager } from 'typeorm';

export function visibleMessagePredicate(alias = 'message'): string {
  return `NOT EXISTS (
    SELECT 1 FROM conversation_turn_tombstones AS tombstone
    WHERE tombstone.conversationId = ${alias}.conversationId
      AND tombstone.turnId = ${alias}.turnId
  )`;
}

export function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const timelinePreviewSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

export function timelinePreview(content: string, maximum: number): string {
  const firstLine = content.split('\n').map(line => line.trim()).find(Boolean) ?? '';
  const graphemes = Array.from(timelinePreviewSegmenter.segment(firstLine), segment => segment.segment);
  if (graphemes.length <= maximum) return firstLine;
  return maximum === 1 ? '…' : `${graphemes.slice(0, maximum - 1).join('')}…`;
}

export function eventStoreError(code: 'CONFLICT' | 'NOT_FOUND' | 'VALIDATION_ERROR', message: string): OrchestrationError {
  return new OrchestrationError({
    code: code === 'VALIDATION_ERROR' ? 'INVALID' : code,
    message,
    retryable: false,
  });
}

/** Stable, bounded JSON used for both durable bytes and conflict comparison. */
export function canonicalJson(value: unknown): string {
  let nodes = 0;
  const seen = new Set<object>();
  const normalize = (item: unknown, depth: number, inArray = false): unknown => {
    nodes += 1;
    if (nodes > MAX_CANONICAL_JSON_NODES || depth > MAX_CANONICAL_JSON_DEPTH) {
      throw eventStoreError('VALIDATION_ERROR', 'canonical JSON structure exceeds depth/node limits');
    }
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number') {
      if (Number.isFinite(item)) return item;
      throw eventStoreError('VALIDATION_ERROR', 'canonical JSON numbers must be finite');
    }
    if (item === undefined && !inArray) return undefined;
    if (Array.isArray(item)) {
      if (seen.has(item)) throw eventStoreError('VALIDATION_ERROR', 'canonical JSON must not contain cycles');
      seen.add(item);
      try {
        return item.map(nested => normalize(nested, depth + 1, true));
      } finally {
        seen.delete(item);
      }
    }
    if (typeof item === 'object') {
      const object = item as Record<string, unknown>;
      const prototype = Reflect.getPrototypeOf(object);
      if (prototype !== Object.prototype && prototype !== null) {
        throw eventStoreError('VALIDATION_ERROR', 'canonical JSON values must be plain objects');
      }
      if (seen.has(object)) throw eventStoreError('VALIDATION_ERROR', 'canonical JSON must not contain cycles');
      seen.add(object);
      try {
        const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
        for (const [key, nested] of Object.entries(object).sort(([left], [right]) => compareCodeUnits(left, right))) {
          if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
            throw eventStoreError('VALIDATION_ERROR', `forbidden canonical JSON key ${key}`);
          }
          const normalized = normalize(nested, depth + 1);
          if (normalized !== undefined) result[key] = normalized;
        }
        return result;
      } finally {
        seen.delete(object);
      }
    }
    throw eventStoreError('VALIDATION_ERROR', `unsupported canonical JSON value ${typeof item}`);
  };
  return JSON.stringify(normalize(value, 0));
}

export function eventTurnId(event: ConversationEvent): string | undefined {
  if (event.kind === 'message') return event.message.turnId;
  if (event.kind === 'tombstone') return event.targetTurnId;
  if (event.kind === 'compaction') return event.summary?.turnId;
  return undefined;
}

const canonicalEventDecoder = new TextDecoder('utf-8', { fatal: true });

export function canonicalEventJson(event: ConversationEvent): string {
  return canonicalEventDecoder.decode(canonicalConversationEventBytes(event));
}

export function parseStoredConversationEvent(eventJson: string): ConversationEvent {
  const parsed: unknown = JSON.parse(eventJson);
  assertCanonicalConversationEvent(parsed);
  if (canonicalEventJson(parsed) !== eventJson) {
    throw eventStoreError('CONFLICT', 'stored conversation event is not canonical');
  }
  return parsed;
}

export function compareLww(
  left: Pick<ConversationEvent, 'lamportClock' | 'originNodeId' | 'eventId'>,
  right: Pick<ConversationEvent, 'lamportClock' | 'originNodeId' | 'eventId'>,
): number {
  return left.lamportClock - right.lamportClock ||
    compareCodeUnits(left.originNodeId, right.originNodeId) ||
    compareCodeUnits(left.eventId, right.eventId);
}

export async function bumpConversationListRevision(manager: EntityManager): Promise<void> {
  await manager.query(
    `INSERT INTO conversation_list_state (id, revision) VALUES (1, 1)
     ON CONFLICT(id) DO UPDATE SET revision = revision + 1`,
  );
}

export function conversationEventProjectionMessage(event: ConversationEvent): ChatMessage | undefined {
  if (event.kind === 'message') return conversationEventToMessage(event);
  if (event.kind !== 'compaction' || event.mode !== 'summary') return undefined;
  return createChatMessage({
    messageId: event.eventId,
    turnId: event.summary.turnId,
    conversationId: event.conversationId,
    originNodeId: event.originNodeId,
    originSequence: event.originSequence,
    timestamp: event.timestamp,
    lamportClock: event.lamportClock,
    role: 'assistant',
    content: event.summary.content,
    ...(event.summary.parts === undefined ? {} : { parts: event.summary.parts }),
    metadata: { contextCompaction: event.boundary, compacted: true },
  });
}
