import { type PromptPreviewAuditPage, PromptPreviewAuditSessionStore } from 'memeloop';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDesktopPromptPreviewClient } from '../DesktopPromptPreviewClient';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DesktopPromptPreviewClient', () => {
  it('uses retained request reads without a second prompt generation transport', () => {
    expect(createDesktopPromptPreviewClient(bridge()).generatePreview).toBeUndefined();
  });

  it('fences a bounded page read when the view aborts', async () => {
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
