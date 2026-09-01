import { type PromptConcatStreamState, type PromptPreviewAuditPage, PromptPreviewAuditSessionStore } from 'memeloop';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDesktopPromptPreviewClient } from '../DesktopPromptPreviewClient';

const mutableObservables = window.observables as unknown as Record<string, unknown>;
const originalAgentObservable = mutableObservables.agentInstance;

afterEach(() => {
  mutableObservables.agentInstance = originalAgentObservable;
  vi.restoreAllMocks();
});

describe('DesktopPromptPreviewClient', () => {
  it('unsubscribes immediately without receiving a full message array', async () => {
    const states = new Subject<PromptConcatStreamState>();
    const concatPromptPreview = vi.fn(() => states.asObservable());
    mutableObservables.agentInstance = { concatPromptPreview };
    const controller = new AbortController();
    const execution = auditExecution();
    const pending = createDesktopPromptPreviewClient(bridge()).generatePreview(
      { prompts: [], plugins: [] },
      execution,
      undefined,
      { signal: controller.signal },
    );
    expect(states.observed).toBe(true);
    expect(concatPromptPreview).toHaveBeenCalledWith({
      sessionId: execution.sessionId,
      expectedRevision: execution.revision,
      agentFrameworkConfig: { prompts: [], plugins: [] },
    });

    controller.abort(new Error('closed'));

    await expect(pending).rejects.toThrow('closed');
    expect(states.observed).toBe(false);
  });

  it('emits stable step codes and returns only the bounded generated projection', async () => {
    const states = new Subject<PromptConcatStreamState>();
    mutableObservables.agentInstance = { concatPromptPreview: vi.fn(() => states.asObservable()) };
    const progress = vi.fn();
    const pending = createDesktopPromptPreviewClient(bridge()).generatePreview(
      { prompts: [], plugins: [] },
      auditExecution(),
      progress,
      { signal: new AbortController().signal },
    );

    states.next({
      progress: 0.5,
      step: 'plugin',
      currentPlugin: { id: 'wiki-search', toolId: 'wiki-search' },
      flatPrompts: [{ role: 'system', content: 'bounded system prompt' }],
      processedPrompts: [],
      isComplete: false,
    });
    states.next({
      progress: 1,
      step: 'finalize',
      flatPrompts: [{ role: 'system', content: 'bounded system prompt' }],
      processedPrompts: [],
      isComplete: true,
    });

    await expect(pending).resolves.toEqual({
      flatPrompts: [{ role: 'system', content: 'bounded system prompt' }],
      processedPrompts: [],
    });
    expect(progress).toHaveBeenNthCalledWith(1, {
      progress: 0.5,
      stepCode: 'plugin',
      currentPlugin: 'wiki-search',
    });
  });

  it('fences a bounded page read when the view aborts', async () => {
    mutableObservables.agentInstance = { concatPromptPreview: vi.fn() };
    let resolvePage: ((page: PromptPreviewAuditPage) => void) | undefined;
    const pendingPage = new Promise<PromptPreviewAuditPage>(resolve => {
      resolvePage = resolve;
    });
    const host = bridge();
    vi.mocked(host.getPromptPreviewAuditPage).mockReturnValueOnce(pendingPage);
    const client = createDesktopPromptPreviewClient(host);
    const execution = auditExecution();
    const controller = new AbortController();
    const pending = client.getAuditPage({
      mode: 'around',
      entryIndex: 0,
      sessionId: execution.sessionId,
      expectedRevision: execution.revision,
      limit: 10,
      maxBytes: 8 * 1_024,
    }, { signal: controller.signal });

    controller.abort(new DOMException('closed', 'AbortError'));
    resolvePage!(execution.initialPage);

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

function bridge() {
  return {
    getPromptPreviewAuditPage: vi.fn(async () => auditExecution().initialPage),
    getPromptPreviewAuditDetail: vi.fn(async () => {
      throw new Error('unused');
    }),
    releasePromptPreviewAuditSession: vi.fn(async () => undefined),
  };
}

function auditExecution() {
  const store = new PromptPreviewAuditSessionStore({
    createSessionId: () => 'session-test',
    createRevision: () => 'revision-test',
  });
  return store.createSession({
    request: {
      providerId: 'provider',
      logicalModelId: 'logical',
      wireModelId: 'wire',
      apiMode: 'responses',
      messages: [{ role: 'system', content: 'system' }],
    },
  });
}
