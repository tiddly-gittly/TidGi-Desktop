import {
  createAgentRunLogDetailLoader,
  getDisplayTruncation,
  type MemeLoopMessageDetailPage,
  type MemeLoopMessageDetailRequest,
  type MessageDetailLoader,
  validateMessageDetailPage,
} from '@memeloop/react-ui/chat';
import { assertCanonicalChatMessageProjection, type ChatMessage, type ConversationMessageIdentity } from 'memeloop';

import { createDesktopAgentConversationClient } from './DesktopAgentConversationClient';

const DETAIL_RANGE_BYTES = 256 * 1024;
const MAX_CANONICAL_MESSAGE_BYTES = 3 * 1024 * 1024;

/** Bounded lazy detail binding; the resident transcript never carries heavy fields. */
export function createDesktopMessageDetailLoader(): MessageDetailLoader {
  const client = createDesktopAgentConversationClient();
  const runLogLoader = createAgentRunLogDetailLoader({
    pull: async ({ message, cursor, limit, maxBytes, signal }) => {
      const response = await client.getTurnDetail({
        conversationId: message.conversationId,
        turnId: message.turnId,
        cursor,
        direction: 'forward',
        limit,
        maxBytes,
      }, { signal });
      return {
        items: response.items.map(item => ({ label: item.role, content: item.content })),
        truncated: response.hasMoreAfter,
        ...(response.nextCursor === undefined ? {} : { nextCursor: response.nextCursor }),
      };
    },
  });

  return async (message, request) => {
    if (message.detailRef?.type === 'agent-run') return runLogLoader(message, request);
    if (getDisplayTruncation(message)?.capability !== 'detail') return null;
    return loadCanonicalMessageDetail(message, request);
  };
}

async function loadCanonicalMessageDetail(
  projection: ChatMessage,
  request: MemeLoopMessageDetailRequest,
): Promise<MemeLoopMessageDetailPage | null> {
  const canonical = await loadDesktopCanonicalMessage(projection, request.signal);
  if (!canonical) return null;
  return boundedCanonicalDetailPage(canonical, projection, request.maxBytes);
}

/** Recover one exact authoritative message without retaining it in the resident list. */
export async function loadDesktopCanonicalMessage(
  projection: ChatMessage,
  signal: AbortSignal,
): Promise<ChatMessage | null> {
  signal.throwIfAborted();
  const firstIdentity = await window.service.agentInstance.getAgentMessageIdentity(
    projection.conversationId,
    projection.messageId,
  );
  signal.throwIfAborted();
  if (!firstIdentity) return null;
  assertDesktopMessageIdentity(projection, firstIdentity);

  const decoder = new TextDecoder('utf-8', { fatal: true });
  let json = '';
  let offset = 0;
  let totalBytes: number | undefined;
  for (;;) {
    signal.throwIfAborted();
    const range = await window.service.agentInstance.readAgentMessageDetailRange(
      projection.conversationId,
      projection.messageId,
      offset,
      DETAIL_RANGE_BYTES,
    );
    signal.throwIfAborted();
    if (!range.found) {
      if (offset === 0) return null;
      throw new Error('message detail was removed while loading');
    }
    if (
      range.offset !== offset || !Number.isSafeInteger(range.totalBytes) || range.totalBytes < 1 ||
      range.totalBytes > MAX_CANONICAL_MESSAGE_BYTES ||
      (totalBytes !== undefined && range.totalBytes !== totalBytes) ||
      !isUint8ArrayView(range.bytes) || range.bytes.byteLength < 1 ||
      range.bytes.byteLength > DETAIL_RANGE_BYTES || offset + range.bytes.byteLength > range.totalBytes
    ) throw new Error('invalid message detail range');
    totalBytes = range.totalBytes;
    offset += range.bytes.byteLength;
    json += decoder.decode(range.bytes, { stream: offset < totalBytes });
    if (offset === totalBytes) break;
  }
  json += decoder.decode();

  let canonical: unknown;
  try {
    canonical = JSON.parse(json);
  } catch (error) {
    throw new Error('invalid canonical message detail JSON', { cause: error });
  }
  assertCanonicalChatMessageProjection(canonical, projection.conversationId);
  assertDesktopMessageIdentity(canonical, firstIdentity);
  const finalIdentity = await window.service.agentInstance.getAgentMessageIdentity(
    projection.conversationId,
    projection.messageId,
  );
  signal.throwIfAborted();
  if (!finalIdentity || !sameIdentity(firstIdentity, finalIdentity)) {
    throw new Error('message detail identity changed while loading');
  }

  return canonical;
}

function boundedCanonicalDetailPage(
  canonical: ChatMessage,
  projection: ChatMessage,
  maxBytes: number,
): MemeLoopMessageDetailPage {
  const omittedFields = getDisplayTruncation(projection)?.omittedFields ?? [];
  const omitted: Record<string, unknown> = {};
  for (const field of omittedFields) {
    const value = omittedMessageField(canonical, field);
    if (value !== undefined) omitted[field] = value;
  }
  const suffix = Object.keys(omitted).length === 0 ? '' : `\n\n${JSON.stringify(omitted, null, 2)}`;
  const completeText = `${canonical.content}${suffix}`;
  const complete = { text: completeText, itemCount: 1, truncated: false };
  if (serializedBytes(complete) <= maxBytes) return validateMessageDetailPage(complete, maxBytes);

  let lower = 0;
  let upper = completeText.length;
  let best = '';
  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    const candidate = validUnicodePrefix(completeText, middle);
    const page = { text: candidate, itemCount: 1, truncated: true };
    if (serializedBytes(page) <= maxBytes) {
      best = candidate;
      lower = middle + 1;
    } else {
      upper = middle - 1;
    }
  }
  return validateMessageDetailPage({ text: best, itemCount: 1, truncated: true }, maxBytes);
}

function omittedMessageField(
  message: ChatMessage,
  field: 'parts' | 'toolCalls' | 'attachments' | 'reasoning_content',
): unknown {
  switch (field) {
    case 'parts':
      return message.parts;
    case 'toolCalls':
      return message.toolCalls;
    case 'attachments':
      return message.attachments;
    case 'reasoning_content':
      return message.reasoning_content;
  }
}

function validUnicodePrefix(value: string, length: number): string {
  let end = Math.min(length, value.length);
  if (end > 0) {
    const final = value.charCodeAt(end - 1);
    if (final >= 0xD800 && final <= 0xDBFF) end -= 1;
  }
  return value.slice(0, end);
}

function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function isUint8ArrayView(value: unknown): value is Uint8Array {
  return ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === '[object Uint8Array]';
}

export function assertDesktopMessageIdentity(message: ChatMessage, identity: ConversationMessageIdentity): void {
  if (
    message.messageId !== identity.messageId || message.timestamp !== identity.timestamp ||
    message.lamportClock !== identity.lamportClock || message.originNodeId !== identity.originNodeId
  ) throw new Error('message detail identity does not match its projection');
}

function sameIdentity(left: ConversationMessageIdentity, right: ConversationMessageIdentity): boolean {
  return left.messageId === right.messageId && left.timestamp === right.timestamp &&
    left.lamportClock === right.lamportClock && left.originNodeId === right.originNodeId;
}
