import {
  type AgentFrameworkContext,
  type ChatMessage,
  isContextCompactionSummary,
  type PortableLlmMessage,
  type PromptPreviewAuditDetailChunk,
  type PromptPreviewAuditDetailRequest,
  type PromptPreviewAuditEntrySource,
  type PromptPreviewAuditPage,
  type PromptPreviewAuditPageRequest,
  type PromptPreviewAuditReleaseRequest,
  PromptPreviewAuditSessionStore,
  type PromptPreviewPreparedExecution,
  type PromptPreviewPrepareRequest,
} from 'memeloop';
import { prepareAgentExecutionModelRequest } from 'memeloop';
import { randomUUID } from 'node:crypto';

const MAXIMUM_PENDING_PREVIEWS = 8;
const MAXIMUM_RETAINED_PREVIEWS = 4;
const SESSION_TTL_MS = 10 * 60 * 1_000;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;

export interface DesktopPromptPreviewContextFactory {
  (conversationId: string, signal: AbortSignal): Promise<AgentFrameworkContext>;
}

export interface DesktopPromptPreviewServiceOptions {
  createContext: DesktopPromptPreviewContextFactory;
  /** Dependency seam used only by deterministic host conformance tests. */
  prepareExecutionModelRequest?: typeof prepareAgentExecutionModelRequest;
  now?: () => number;
}

interface PendingPromptPreview {
  requestId: string;
  abortController: AbortController;
}

interface RetainedHostContext {
  revision: string;
  conversationId: string;
  messages: ChatMessage[];
  lastAccessedAt: number;
}

/**
 * Trusted Desktop main-process wrapper around Core's portable audit store.
 * Exact requests and durable messages remain in main; only bounded summary
 * pages and canonical detail chunks are exposed through IPC.
 */
export class DesktopPromptPreviewService {
  private readonly pending = new Map<string, PendingPromptPreview>();
  private readonly retainedHostContexts = new Map<string, RetainedHostContext>();
  private readonly prepareExecutionModelRequest: typeof prepareAgentExecutionModelRequest;
  private readonly now: () => number;
  private readonly auditStore = new PromptPreviewAuditSessionStore({
    createSessionId: randomUUID,
    createRevision: randomUUID,
    maxSessions: MAXIMUM_RETAINED_PREVIEWS,
  });

  public constructor(private readonly options: DesktopPromptPreviewServiceOptions) {
    this.prepareExecutionModelRequest = options.prepareExecutionModelRequest ?? prepareAgentExecutionModelRequest;
    this.now = options.now ?? Date.now;
  }

  public async prepare(input: PromptPreviewPrepareRequest): Promise<PromptPreviewPreparedExecution> {
    assertPrepareInput(input);
    this.sweepExpired();
    if (this.pending.has(input.requestId)) throw previewError('request_conflict');
    if (this.pending.size >= MAXIMUM_PENDING_PREVIEWS) throw previewError('capacity_exceeded');

    const operation: PendingPromptPreview = {
      requestId: input.requestId,
      abortController: new AbortController(),
    };
    this.pending.set(input.requestId, operation);
    try {
      const signal = operation.abortController.signal;
      const context = await this.options.createContext(input.conversationId, signal);
      signal.throwIfAborted();
      const prepared = await this.prepareExecutionModelRequest(context, {
        conversationId: input.conversationId,
        stream: true,
        signal,
        ...(input.inputText === undefined ? {} : { inputText: input.inputText }),
      });
      signal.throwIfAborted();
      if (this.pending.get(input.requestId) !== operation) throw abortError();

      const compactionSummaryCount = prepared.messages.filter(isContextCompactionSummary).length;
      const execution = this.auditStore.createSession({
        request: prepared.prepared.request,
        sources: classifyRequestSources(
          prepared.prepared.request.messages,
          prepared.messages,
          input.inputText,
        ),
        compactionSummaryCount,
      });
      this.retainedHostContexts.set(execution.sessionId, {
        revision: execution.revision,
        conversationId: input.conversationId,
        messages: prepared.messages,
        lastAccessedAt: this.now(),
      });
      // Durable context count is the useful compaction diagnostic; the audit
      // page separately carries the exact request-message total.
      return {
        ...execution,
        contextStats: {
          messageCount: prepared.messages.length,
          compactionSummaryCount,
        },
      };
    } finally {
      if (this.pending.get(input.requestId) === operation) this.pending.delete(input.requestId);
    }
  }

  public getAuditPage(request: PromptPreviewAuditPageRequest): PromptPreviewAuditPage {
    this.touch(request.sessionId, request.expectedRevision);
    return this.auditStore.getPage(request);
  }

  public getAuditDetail(request: PromptPreviewAuditDetailRequest): PromptPreviewAuditDetailChunk {
    this.touch(request.sessionId, request.expectedRevision);
    return this.auditStore.getDetail(request);
  }

  /** Main-process-only access for the session-based prompt-concat observable. */
  public getContextForHost(sessionId: string, expectedRevision: string): Readonly<Pick<RetainedHostContext, 'conversationId' | 'messages'>> {
    const context = this.touch(sessionId, expectedRevision);
    return { conversationId: context.conversationId, messages: context.messages };
  }

  public release(request: PromptPreviewAuditReleaseRequest): void {
    this.auditStore.release(request);
    this.retainedHostContexts.delete(request.sessionId);
  }

  /** Abort an in-flight prepare. Prepared sessions are released explicitly. */
  public cancel(requestId: string): void {
    assertRequestId(requestId);
    const operation = this.pending.get(requestId);
    if (!operation) return;
    this.pending.delete(requestId);
    operation.abortController.abort(abortError());
  }

  public dispose(): void {
    for (const operation of this.pending.values()) operation.abortController.abort(abortError());
    this.pending.clear();
    for (const [sessionId, context] of this.retainedHostContexts) {
      this.auditStore.release({ sessionId, expectedRevision: context.revision });
    }
    this.retainedHostContexts.clear();
  }

  private touch(sessionId: string, revision: string): RetainedHostContext {
    this.sweepExpired();
    const context = this.retainedHostContexts.get(sessionId);
    if (!context) throw previewError('session_missing');
    if (context.revision !== revision) throw previewError('revision_stale');
    context.lastAccessedAt = this.now();
    return context;
  }

  private sweepExpired(): void {
    const cutoff = this.now() - SESSION_TTL_MS;
    for (const [sessionId, context] of this.retainedHostContexts) {
      if (context.lastAccessedAt >= cutoff) continue;
      this.auditStore.release({ sessionId, expectedRevision: context.revision });
      this.retainedHostContexts.delete(sessionId);
    }
  }
}

function classifyRequestSources(
  requestMessages: readonly PortableLlmMessage[],
  contextMessages: readonly ChatMessage[],
  inputText: string | undefined,
): PromptPreviewAuditEntrySource[] {
  // Core maps every retained history message to exactly one provider message
  // and prepends the resolved system/prompt block. Classify by that stable
  // ordering instead of comparing contents: compaction summaries are wrapped
  // for the provider, and ordinary messages may legitimately have duplicate
  // text. When a host policy filtered history, fall back to conservative role
  // classification rather than labelling an unrelated entry as compaction.
  const previewEntryCount = inputText === undefined ? 0 : 1;
  const historyStart = requestMessages.length - contextMessages.length - previewEntryCount;
  const hasAlignedHistory = historyStart >= 0;
  return requestMessages.map((message, index) => {
    if (inputText !== undefined && index === requestMessages.length - 1 && message.role === 'user') {
      return 'preview-input';
    }
    if (hasAlignedHistory && index >= historyStart) {
      const contextMessage = contextMessages[index - historyStart];
      if (contextMessage !== undefined) {
        if (isContextCompactionSummary(contextMessage)) return 'context-compaction-summary';
        if (contextMessage.role === 'tool' || message.role === 'tool') return 'tool';
        return 'conversation-message';
      }
    }
    if (message.role === 'system') return 'system';
    if (message.role === 'tool') return 'tool';
    if (index < Math.max(0, historyStart)) return 'prompt';
    return 'conversation-message';
  });
}

function assertPrepareInput(input: PromptPreviewPrepareRequest): void {
  assertRequestId(input.requestId);
  if (input.conversationId.trim().length === 0 || input.conversationId.length > 512) {
    throw previewError('conversation_invalid');
  }
}

function assertRequestId(requestId: string): void {
  if (!REQUEST_ID_PATTERN.test(requestId)) throw previewError('request_invalid');
}

function previewError(code: string): Error {
  return new Error(`prompt_preview_${code}`);
}

function abortError(): Error {
  return new DOMException('Prompt preview was cancelled', 'AbortError');
}
