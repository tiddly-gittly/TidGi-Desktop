import type {
  AgentAttachmentInput,
  AgentCommittedAttachment,
  AgentConversationClient,
  AgentConversationMessageProjection,
  AgentConversationMessageWindowResult,
  ChatMessage,
  ConversationMessageCursor,
} from 'memeloop';

const DESKTOP_MESSAGE_PAGE_LIMIT = 50;
const DESKTOP_MESSAGE_PAGE_MAX_BYTES = 256 * 1024;
const CURSOR_VERSION = 1;

interface DesktopMessageCursorEnvelope {
  v: typeof CURSOR_VERSION;
  revision: string;
  cursor: ConversationMessageCursor;
}

function throwIfAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

async function waitForLocalRun(runId: string, signal?: AbortSignal): Promise<void> {
  let cancelRequested = false;
  const cancel = () => {
    if (cancelRequested) return;
    cancelRequested = true;
    void window.service.agentInstance.cancelAgentRun(runId);
  };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      throwIfAborted(signal);
      const status = await window.service.agentInstance.getAgentRunStatus(runId);
      throwIfAborted(signal);
      if (!status) throw new Error('durable_agent_run_disappeared');
      if (status.state === 'completed') return;
      if (status.state === 'failed') {
        const error = new Error(status.error?.code ?? 'agent_run_failed');
        if (status.error) Object.defineProperty(error, 'agentRunError', { value: status.error, enumerable: false });
        throw error;
      }
      if (status.state === 'cancelled') throw new Error('agent_run_cancelled');
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(timer);
          reject(abortError(signal?.reason));
        };
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }, 100);
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    }
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}

function abortError(reason: unknown): Error {
  return reason instanceof Error ? reason : new DOMException('Aborted', 'AbortError');
}

function utf8Bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{1,4096}$/u.test(value)) throw new TypeError('invalid conversation cursor');
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function encodeCursor(revision: string, cursor?: ConversationMessageCursor): string | undefined {
  if (!cursor) return undefined;
  const envelope: DesktopMessageCursorEnvelope = { v: CURSOR_VERSION, revision, cursor };
  return encodeBase64Url(new TextEncoder().encode(JSON.stringify(envelope)));
}

function requireEncodedCursor(revision: string, cursor: ConversationMessageCursor | undefined): string {
  const encoded = encodeCursor(revision, cursor);
  if (encoded === undefined) throw new Error('Desktop conversation page omitted a required boundary cursor');
  return encoded;
}

function decodeCursor(value: string, expectedRevision?: string): DesktopMessageCursorEnvelope {
  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decodeBase64Url(value)));
  } catch {
    throw new TypeError('invalid conversation cursor');
  }
  if (decoded === null || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new TypeError('invalid conversation cursor');
  }
  const record = decoded as Record<string, unknown>;
  if (
    Object.keys(record).length !== 3 || record.v !== CURSOR_VERSION ||
    typeof record.revision !== 'string' || record.revision.length === 0 ||
    record.cursor === null || typeof record.cursor !== 'object' || Array.isArray(record.cursor)
  ) throw new TypeError('invalid conversation cursor');
  if (expectedRevision === undefined || expectedRevision !== record.revision) {
    throw new Error('conversation cursor requires its matching expected revision');
  }
  const cursor = record.cursor as Record<string, unknown>;
  if (
    Object.keys(cursor).length !== 4 || !Number.isSafeInteger(cursor.timestamp) ||
    !Number.isSafeInteger(cursor.lamportClock) || typeof cursor.originNodeId !== 'string' ||
    typeof cursor.messageId !== 'string' || cursor.originNodeId.length === 0 || cursor.messageId.length === 0
  ) throw new TypeError('invalid conversation cursor');
  return {
    v: CURSOR_VERSION,
    revision: record.revision,
    cursor: cursor as unknown as ConversationMessageCursor,
  };
}

function assertUiBudget(limit: number, maxBytes: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > DESKTOP_MESSAGE_PAGE_LIMIT) {
    throw new RangeError(`Desktop conversation pages are limited to ${DESKTOP_MESSAGE_PAGE_LIMIT} messages`);
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > DESKTOP_MESSAGE_PAGE_MAX_BYTES) {
    throw new RangeError(`Desktop conversation pages are limited to ${DESKTOP_MESSAGE_PAGE_MAX_BYTES} bytes`);
  }
}

function toProjection(message: ChatMessage): AgentConversationMessageProjection {
  const {
    parts: _parts,
    toolCalls: _toolCalls,
    attachments: _attachments,
    reasoning_content: _reasoningContent,
    ...projection
  } = message;
  return projection;
}

function validateProjectionPage(
  conversationId: string,
  items: readonly ChatMessage[],
  limit: number,
  maxBytes: number,
): AgentConversationMessageProjection[] {
  if (items.length > limit) throw new RangeError('Desktop conversation response exceeded its requested row limit');
  if (items.some(message => message.conversationId !== conversationId)) {
    throw new Error('Desktop conversation response crossed conversation scope');
  }
  const projections = items.map(toProjection);
  if (utf8Bytes(projections) > maxBytes) {
    throw new RangeError('Desktop conversation response exceeded its requested byte budget');
  }
  return projections;
}

function assertSerializableAttachment(
  attachment: AgentAttachmentInput | undefined,
): asserts attachment is AgentCommittedAttachment | undefined {
  if (attachment?.kind === 'source') {
    throw new Error('Desktop attachment source must be committed by the bounded upload adapter before sendMessage');
  }
}

/** Desktop's bounded, revision-aware renderer IPC binding. */
export const createDesktopAgentConversationClient = (): AgentConversationClient => ({
  async getMessagePage(conversationId, options, callOptions) {
    throwIfAborted(callOptions?.signal);
    assertUiBudget(options.limit, options.maxBytes);
    const direction = options.direction ?? 'backward';
    const decoded = options.cursor ? decodeCursor(options.cursor, options.expectedRevision) : undefined;
    const page = await window.service.agentInstance.getAgentMessagePage(conversationId, {
      limit: options.limit,
      maxBytes: options.maxBytes,
      mode: options.mode,
      direction,
      expectedRevision: options.expectedRevision,
      ...(decoded === undefined ? {} : direction === 'forward' ? { after: decoded.cursor } : { before: decoded.cursor }),
    });
    throwIfAborted(callOptions?.signal);
    if (page.conversationId !== conversationId) throw new Error('Desktop conversation page crossed conversation scope');
    if (page.reset) return page;
    const items = validateProjectionPage(conversationId, page.items, options.limit, options.maxBytes);
    return {
      reset: false,
      conversationId,
      revision: page.revision,
      items,
      hasMoreBefore: page.hasMoreBefore,
      hasMoreAfter: page.hasMoreAfter,
      ...(page.hasMoreBefore ? { previousCursor: requireEncodedCursor(page.revision, page.startCursor) } : {}),
      ...(page.hasMoreAfter ? { nextCursor: requireEncodedCursor(page.revision, page.endCursor) } : {}),
    };
  },

  async getMessageWindowAround(request, options) {
    throwIfAborted(options?.signal);
    assertUiBudget(request.maxMessages, request.maxBytes);
    const result = await window.service.agentInstance.getAgentMessageWindowAround(request.conversationId, {
      focus: request.focus,
      expectedRevision: request.expectedRevision,
      maxMessages: request.maxMessages,
      maxBytes: request.maxBytes,
    });
    throwIfAborted(options?.signal);
    if (result.conversationId !== request.conversationId) throw new Error('Desktop conversation window crossed conversation scope');
    if (result.reset) return result;
    const mapped: AgentConversationMessageWindowResult = {
      reset: false,
      conversationId: request.conversationId,
      revision: result.revision,
      focus: result.focus,
      items: validateProjectionPage(request.conversationId, result.items, request.maxMessages, request.maxBytes),
      hasMoreBefore: result.hasMoreBefore,
      hasMoreAfter: result.hasMoreAfter,
      ...(result.hasMoreBefore ? { previousCursor: requireEncodedCursor(result.revision, result.startCursor) } : {}),
      ...(result.hasMoreAfter ? { nextCursor: requireEncodedCursor(result.revision, result.endCursor) } : {}),
    };
    return mapped;
  },

  async getTurnDetail(request, options) {
    throwIfAborted(options?.signal);
    const response = await window.service.agentInstance.getAgentTurnDetail(request);
    throwIfAborted(options?.signal);
    if (response.turnId !== request.turnId || response.items.some(message => message.conversationId !== request.conversationId)) {
      throw new Error('Desktop turn detail crossed its requested scope');
    }
    return response;
  },

  async sendMessage(conversationId, content, attachment, wikiTiddlers, options) {
    throwIfAborted(options?.signal);
    assertSerializableAttachment(attachment);
    const agent = await window.service.agentInstance.getAgentMetadata(conversationId);
    throwIfAborted(options?.signal);
    if (!agent) throw new Error('agent_conversation_not_found');
    const requestId = `conversation-client:request:${crypto.randomUUID()}`;
    const turnId = `conversation-client:turn:${crypto.randomUUID()}`;
    const handle = await window.service.agentInstance.executeAgentRun({
      conversationId,
      definitionId: agent.agentDefId,
      message: content,
      requestId,
      turnId,
      ...(attachment === undefined ? {} : { attachment }),
      ...(wikiTiddlers === undefined ? {} : { wikiTiddlers }),
    });
    if (handle.conversationId !== conversationId || handle.requestId !== requestId || handle.turnId !== turnId) {
      await window.service.agentInstance.cancelAgentRun(handle.runId);
      throw new Error('durable_agent_run_identity_mismatch');
    }
    await waitForLocalRun(handle.runId, options?.signal);
    throwIfAborted(options?.signal);
  },

  subscribeToMessages(conversationId, listener) {
    const subscription = window.observables.agentInstance.subscribeToConversationUpdates(conversationId)
      .subscribe(update => {
        listener(update);
      });
    return () => {
      subscription.unsubscribe();
    };
  },

  async deleteTurn(request, options) {
    throwIfAborted(options?.signal);
    const response = await window.service.agentInstance.deleteConversationTurn(request);
    throwIfAborted(options?.signal);
    return response;
  },

  async retryTurn(request, options) {
    throwIfAborted(options?.signal);
    const response = await window.service.agentInstance.retryConversationTurn(request);
    throwIfAborted(options?.signal);
    return response;
  },
});
