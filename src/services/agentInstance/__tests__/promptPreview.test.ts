import {
  type AgentDefinition,
  type AgentExecutionModelContext,
  type AgentFrameworkContext,
  canonicalJsonBytes,
  type ChatMessage,
  decodePromptPreviewAuditRequest,
  MAX_PROMPT_PREVIEW_AUDIT_PAGE_BYTES,
  MAX_PROMPT_PREVIEW_AUDIT_PAGE_ENTRIES,
  type PortableLlmRequest,
  type ResolvedAgentModelRoute,
} from 'memeloop';
import { prepareLoadedAgentExecutionModelRequest } from 'memeloop';
import { describe, expect, it, vi } from 'vitest';

import { DesktopPromptPreviewService } from '../promptPreview';

describe('DesktopPromptPreviewService', () => {
  it('retains the exact Core execution request in main and reconstructs it losslessly from bounded chunks', async () => {
    const context = contextFixture();
    const loaded = executionFixture();
    const prepareExecutionModelRequest = vi.fn((receivedContext, options) => prepareLoadedAgentExecutionModelRequest(receivedContext, loaded, options));
    const service = new DesktopPromptPreviewService({
      createContext: vi.fn(async () => context),
      prepareExecutionModelRequest,
    });

    const execution = await service.prepare({
      requestId: 'request-exact-1',
      conversationId: 'conversation-long',
      inputText: 'continue exactly',
    });
    const expected = await prepareLoadedAgentExecutionModelRequest(context, loaded, {
      conversationId: 'conversation-long',
      stream: true,
      signal: new AbortController().signal,
      inputText: 'continue exactly',
    });
    const expectedRequest: PortableLlmRequest = { ...expected.prepared.request };
    delete expectedRequest.signal;

    const chunks: Uint8Array[] = [];
    let cursor: string | undefined;
    do {
      const chunk = service.getAuditDetail({
        sessionId: execution.sessionId,
        expectedRevision: execution.revision,
        target: { kind: 'request' },
        ...(cursor === undefined ? {} : { cursor }),
        maxBytes: 64,
      });
      expect(chunk.canonicalUtf8.byteLength).toBeLessThanOrEqual(64);
      chunks.push(chunk.canonicalUtf8);
      cursor = chunk.nextCursor;
    } while (cursor !== undefined);

    expect(decodePromptPreviewAuditRequest(joinChunks(chunks))).toEqual(expectedRequest);
    expect(execution.route).toEqual({
      providerId: 'provider-exact',
      logicalModelId: 'logical-exact',
      wireModelId: 'wire-exact',
      apiMode: 'responses',
    });
    expect(prepareExecutionModelRequest).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        conversationId: 'conversation-long',
        stream: true,
        inputText: 'continue exactly',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('keeps repeated compaction markers plus the recent tail bounded and pages the hidden range revision-safely', async () => {
    const context = contextFixture();
    const loaded = executionFixture();
    loaded.messages = [
      summary('compaction-one', 1, 'durable summary one'),
      summary('compaction-two', 2, 'durable summary two'),
      ...Array.from({ length: 100 }, (_, index) => message(99_901 + index, index % 2 === 0 ? 'user' : 'assistant')),
    ];
    const service = new DesktopPromptPreviewService({
      createContext: vi.fn(async () => context),
      prepareExecutionModelRequest: (receivedContext, options) => prepareLoadedAgentExecutionModelRequest(receivedContext, loaded, options),
    });
    const uiResidentWindow = Array.from({ length: 50 }, (_, index) => message(90_000 + index, 'user'));
    expect(uiResidentWindow).toHaveLength(50);

    const execution = await service.prepare({
      requestId: 'request-scale-1',
      conversationId: 'conversation-long',
    });
    expect(execution.contextStats).toEqual({ messageCount: 102, compactionSummaryCount: 2 });
    expect(execution.initialPage.items.length).toBeLessThanOrEqual(MAX_PROMPT_PREVIEW_AUDIT_PAGE_ENTRIES);
    expect(canonicalJsonBytes(execution.initialPage).byteLength).toBeLessThanOrEqual(MAX_PROMPT_PREVIEW_AUDIT_PAGE_BYTES);
    expect(execution.initialPage.items.filter(item => item.source === 'context-compaction-summary')).toHaveLength(2);
    expect(execution.initialPage.items.at(-1)?.entryIndex).toBe(execution.initialPage.totalEntries - 1);

    const byIndex = new Map(execution.initialPage.items.map(item => [item.entryIndex, item]));
    let beforeCursor = execution.initialPage.previousCursor;
    while (beforeCursor !== undefined) {
      const page = service.getAuditPage({
        mode: 'before',
        cursor: beforeCursor,
        sessionId: execution.sessionId,
        expectedRevision: execution.revision,
        limit: 17,
        maxBytes: 8 * 1_024,
      });
      expect(page.items.length).toBeLessThanOrEqual(17);
      expect(canonicalJsonBytes(page).byteLength).toBeLessThanOrEqual(8 * 1_024);
      for (const item of page.items) byIndex.set(item.entryIndex, item);
      beforeCursor = page.previousCursor;
    }
    expect(byIndex.size).toBe(execution.initialPage.totalEntries);

    expect(() =>
      service.getAuditPage({
        mode: 'around',
        entryIndex: 0,
        sessionId: execution.sessionId,
        expectedRevision: '0'.repeat(64),
        limit: 10,
        maxBytes: 8 * 1_024,
      })
    ).toThrow('prompt_preview_revision_stale');
  });

  it('aborts preparation and releases retained sessions idempotently', async () => {
    const context = contextFixture();
    let firstSignal: AbortSignal | undefined;
    const prepareExecutionModelRequest = vi.fn(async (_context, options) => {
      firstSignal = options.signal;
      await new Promise<void>((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const reason = options.signal.reason;
          if (reason instanceof Error) {
            reject(reason);
            return;
          }
          const error = new Error('cancelled', { cause: reason });
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
      return prepareLoadedAgentExecutionModelRequest(context, executionFixture(), options);
    });
    const service = new DesktopPromptPreviewService({
      createContext: vi.fn(async () => context),
      prepareExecutionModelRequest,
    });
    const pending = service.prepare({ requestId: 'request-cancel-1', conversationId: 'conversation-long' });
    await vi.waitFor(() => {
      expect(firstSignal).toBeDefined();
    });

    service.cancel('request-cancel-1');

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(firstSignal?.aborted).toBe(true);

    const preparedService = new DesktopPromptPreviewService({
      createContext: vi.fn(async () => context),
      prepareExecutionModelRequest: (receivedContext, options) => prepareLoadedAgentExecutionModelRequest(receivedContext, executionFixture(), options),
    });
    const execution = await preparedService.prepare({ requestId: 'request-release-1', conversationId: 'conversation-long' });
    preparedService.release({ sessionId: execution.sessionId, expectedRevision: execution.revision });
    preparedService.release({ sessionId: execution.sessionId, expectedRevision: execution.revision });
    expect(() =>
      preparedService.getAuditDetail({
        sessionId: execution.sessionId,
        expectedRevision: execution.revision,
        target: { kind: 'request' },
        maxBytes: 64,
      })
    ).toThrow('prompt_preview_session_missing');
  });
});

function contextFixture(): AgentFrameworkContext {
  return {
    storage: {} as AgentFrameworkContext['storage'],
    llmProvider: executionRoute().provider,
    tools: {
      registerTool: vi.fn(),
      getTool: vi.fn(),
      listTools: vi.fn(() => []),
    },
    syncAdapters: [],
    network: {} as AgentFrameworkContext['network'],
    localNodeId: 'desktop-local',
  };
}

function executionFixture(): AgentExecutionModelContext {
  return {
    definitionId: 'definition-exact',
    definition: definitionFixture(),
    route: executionRoute(),
    messages: [
      summary('compaction-one', 1, 'durable summary one'),
      summary('compaction-two', 2, 'durable summary two'),
      message(99_999, 'user'),
      message(100_000, 'assistant'),
    ],
  };
}

function definitionFixture(): AgentDefinition {
  return {
    id: 'definition-exact',
    name: 'Exact',
    description: '',
    systemPrompt: 'system exact',
    tools: [],
    modelConfig: { providerId: 'provider-exact', modelId: 'logical-exact' },
    version: '1',
  };
}

function executionRoute(): ResolvedAgentModelRoute {
  return {
    provider: { name: 'provider-exact', chat: async function*() {} },
    providerId: 'provider-exact',
    modelId: 'logical-exact',
    wireModelId: 'wire-exact',
    apiMode: 'responses',
    parameters: {},
  };
}

function message(originSequence: number, role: ChatMessage['role']): ChatMessage {
  const turn = role === 'user' ? originSequence : originSequence - 1;
  return {
    messageId: `message-${originSequence}`,
    turnId: `message-${turn}`,
    conversationId: 'conversation-long',
    originNodeId: 'remote',
    originSequence,
    timestamp: originSequence,
    lamportClock: originSequence,
    role,
    content: `message ${originSequence}`,
  };
}

function summary(messageId: string, originSequence: number, content: string): ChatMessage {
  return {
    ...message(originSequence, 'assistant'),
    messageId,
    turnId: messageId,
    originNodeId: 'desktop-local',
    content,
    metadata: {
      compacted: true,
      contextCompaction: {
        version: 2,
        coveredVersion: { remote: originSequence * 40_000 },
        coveredMessageCountByOrigin: { remote: originSequence * 40_000 },
        coveredUserTurnCountByOrigin: { remote: originSequence * 20_000 },
        droppedMessageCount: originSequence * 40_000,
        droppedTurnCount: originSequence * 20_000,
      },
    },
  };
}

function joinChunks(chunks: readonly Uint8Array[]): Uint8Array {
  const joined = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}
