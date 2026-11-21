import { MESSAGE_DETAIL_CURSOR_PREFIX } from '@/constants/agent';
import {
  getDisplayTruncation,
  MEMELOOP_MESSAGE_DETAIL_MAX_BYTES,
  type MemeLoopMessageDetailPage,
  type MemeLoopMessageDetailRequest,
  type MemeLoopMessageHydrationIdentity,
  messageHydrationIdentity,
  validateMessageDetailPage,
} from '@memeloop/react-ui/chat';
import { assertCanonicalChatMessageProjection, type ChatMessage, type ConversationMessageIdentity, type ConversationMessageListProjection } from 'memeloop';
export async function loadDesktopMessageDetail(
  projection: ConversationMessageListProjection,
  request: MemeLoopMessageDetailRequest,
): Promise<MemeLoopMessageDetailPage | null> {
  const canonical = await loadDesktopCanonicalMessage(projection, request.signal, request.maxBytes);
  return canonical ? canonicalDetailPage(canonical, projection, request) : null;
}

export async function loadDesktopCanonicalMessage(
  projection: ConversationMessageListProjection,
  signal: AbortSignal,
  rangeBytes = MEMELOOP_MESSAGE_DETAIL_MAX_BYTES,
): Promise<ChatMessage | null> {
  if (!Number.isSafeInteger(rangeBytes) || rangeBytes < 1) throw new RangeError('message detail range byte budget is invalid');
  signal.throwIfAborted();
  const firstIdentity = await window.service.agentInstance.getAgentMessageIdentity(
    projection.conversationId,
    projection.messageId,
  );
  signal.throwIfAborted();
  if (!firstIdentity) return null;
  assertDesktopMessageIdentity(messageHydrationIdentity(projection), firstIdentity);

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
      rangeBytes,
    );
    signal.throwIfAborted();
    if (!range.found) {
      if (offset === 0) return null;
      throw new Error('message detail was removed while loading');
    }
    if (
      range.offset !== offset || !Number.isSafeInteger(range.totalBytes) || range.totalBytes < 1 ||
      (totalBytes !== undefined && range.totalBytes !== totalBytes) ||
      !isUint8ArrayView(range.bytes) || range.bytes.byteLength < 1 ||
      range.bytes.byteLength > rangeBytes || offset + range.bytes.byteLength > range.totalBytes
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
  const canonicalIdentity = canonicalMessageHydrationIdentity(canonical);
  assertDesktopMessageIdentity(canonicalIdentity, firstIdentity);
  assertDesktopMessageHydrationIdentity(canonicalIdentity, messageHydrationIdentity(projection));
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

export function canonicalMessageHydrationIdentity(message: ChatMessage): MemeLoopMessageHydrationIdentity {
  return {
    conversationId: message.conversationId,
    messageId: message.messageId,
    turnId: message.turnId,
    originNodeId: message.originNodeId,
    originSequence: message.originSequence,
    timestamp: message.timestamp,
    lamportClock: message.lamportClock,
  };
}

function canonicalDetailPage(
  canonical: ChatMessage,
  projection: ConversationMessageListProjection,
  request: MemeLoopMessageDetailRequest,
): MemeLoopMessageDetailPage {
  const omittedFields = getDisplayTruncation(projection)?.omittedFields ?? [];
  const omitted: Record<string, unknown> = {};
  for (const field of omittedFields) {
    const value = omittedMessageField(canonical, field);
    if (value !== undefined) omitted[field] = value;
  }
  const suffix = Object.keys(omitted).length === 0 ? '' : `\n\n${JSON.stringify(omitted, null, 2)}`;
  return boundedCanonicalDetailPage(`${canonical.content}${suffix}`, request);
}

/** Returns a single UI-bounded page; nextCursor is an opaque code-unit offset. */
function boundedCanonicalDetailPage(
  completeText: string,
  request: MemeLoopMessageDetailRequest,
): MemeLoopMessageDetailPage {
  const start = parseDetailCursor(request.cursor, completeText);
  let lower = start;
  let upper = completeText.length;
  let best = start;
  while (lower <= upper) {
    const candidateEnd = unicodeBoundaryAtOrBefore(completeText, Math.floor((lower + upper) / 2));
    const nextCursor = candidateEnd < completeText.length ? detailCursor(candidateEnd) : undefined;
    const candidate = {
      text: completeText.slice(start, candidateEnd),
      itemCount: 1,
      truncated: nextCursor !== undefined,
      ...(nextCursor === undefined ? {} : { nextCursor }),
    };
    if (serializedBytes(candidate) <= request.maxBytes) {
      best = candidateEnd;
      lower = nextUnicodeBoundary(completeText, candidateEnd);
    } else {
      upper = candidateEnd - 1;
    }
  }
  if (best === start && start < completeText.length) {
    throw new RangeError('message detail byte budget cannot represent a Unicode character');
  }
  const nextCursor = best < completeText.length ? detailCursor(best) : undefined;
  return validateMessageDetailPage({
    text: completeText.slice(start, best),
    itemCount: 1,
    truncated: nextCursor !== undefined,
    ...(nextCursor === undefined ? {} : { nextCursor }),
  }, request.maxBytes);
}

function parseDetailCursor(cursor: string | undefined, value: string): number {
  if (cursor === undefined) return 0;
  if (!cursor.startsWith(MESSAGE_DETAIL_CURSOR_PREFIX)) throw new Error('invalid message detail cursor');
  const offset = Number(cursor.slice(MESSAGE_DETAIL_CURSOR_PREFIX.length));
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > value.length || unicodeBoundaryAtOrBefore(value, offset) !== offset) {
    throw new Error('invalid message detail cursor');
  }
  return offset;
}

function detailCursor(offset: number): string {
  return `${MESSAGE_DETAIL_CURSOR_PREFIX}${offset}`;
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

function unicodeBoundaryAtOrBefore(value: string, length: number): number {
  let end = Math.min(length, value.length);
  if (end > 0) {
    const final = value.charCodeAt(end - 1);
    if (final >= 0xD800 && final <= 0xDBFF) end -= 1;
  }
  return end;
}

function nextUnicodeBoundary(value: string, offset: number): number {
  if (offset >= value.length) return value.length + 1;
  const first = value.charCodeAt(offset);
  const second = value.charCodeAt(offset + 1);
  return first >= 0xD800 && first <= 0xDBFF && second >= 0xDC00 && second <= 0xDFFF
    ? offset + 2
    : offset + 1;
}

function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function isUint8ArrayView(value: unknown): value is Uint8Array {
  return ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === '[object Uint8Array]';
}

export function assertDesktopMessageIdentity(message: MemeLoopMessageHydrationIdentity, identity: ConversationMessageIdentity): void {
  if (
    message.messageId !== identity.messageId || message.timestamp !== identity.timestamp ||
    message.lamportClock !== identity.lamportClock || message.originNodeId !== identity.originNodeId
  ) throw new Error('message detail identity does not match its projection');
}

/** Binds the authoritative payload to the exact resident projection. */
export function assertDesktopMessageHydrationIdentity(
  message: MemeLoopMessageHydrationIdentity,
  identity: MemeLoopMessageHydrationIdentity,
): void {
  if (
    message.conversationId !== identity.conversationId || message.messageId !== identity.messageId ||
    message.turnId !== identity.turnId || message.originNodeId !== identity.originNodeId ||
    message.originSequence !== identity.originSequence || message.timestamp !== identity.timestamp ||
    message.lamportClock !== identity.lamportClock
  ) throw new Error('message detail hydration identity does not match its projection');
}

function sameIdentity(left: ConversationMessageIdentity, right: ConversationMessageIdentity): boolean {
  return left.messageId === right.messageId && left.timestamp === right.timestamp &&
    left.lamportClock === right.lamportClock && left.originNodeId === right.originNodeId;
}
