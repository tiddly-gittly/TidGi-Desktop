import { PromptPreviewAuditSessionStore, type PromptPreviewClient, type PromptPreviewPreparedExecution } from 'memeloop';
import { describe, expect, it, vi } from 'vitest';

import { createDesktopPromptPreviewController, type DesktopPromptPreviewBridge } from '../DesktopPromptPreviewController';

describe('createDesktopPromptPreviewController', () => {
  it('uses only the bounded opaque audit session and retains the exact route', async () => {
    const execution = auditExecution();
    const bridge = bridgeFixture(async () => execution);
    const client = previewClient();
    const controller = createDesktopPromptPreviewController({
      bridge,
      previewClient: client,
      createRequestId: () => 'request-scale-1',
    });

    const result = await controller.generate({ prompts: [], plugins: [] }, 'conversation-long');

    expect(client.generatePreview).toHaveBeenCalledWith(
      expect.anything(),
      execution,
      expect.any(Function),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result?.audit.route).toEqual({
      providerId: 'provider-exact',
      logicalModelId: 'logical-exact',
      wireModelId: 'wire-exact',
      apiMode: 'responses',
    });
    expect(result?.audit.initialPage.items.length).toBeLessThanOrEqual(50);
    expect(result).not.toHaveProperty('modelRequest');
    expect(result).not.toHaveProperty('messages');
  });

  it('cancels, releases, and ignores a superseded generation', async () => {
    let resolveFirst: ((value: PromptPreviewPreparedExecution) => void) | undefined;
    const first = new Promise<PromptPreviewPreparedExecution>(resolve => {
      resolveFirst = resolve;
    });
    const oldExecution = auditExecution('old');
    const currentExecution = auditExecution('current');
    const prepare = vi.fn<DesktopPromptPreviewBridge['preparePromptPreviewExecutionModelRequest']>()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(currentExecution);
    const bridge = bridgeFixture(prepare);
    const client = previewClient();
    const identifiers = ['request-old-1', 'request-new-2'];
    const controller = createDesktopPromptPreviewController({
      bridge,
      previewClient: client,
      createRequestId: () => identifiers.shift()!,
    });

    const stale = controller.generate({ prompts: [], plugins: [] }, 'conversation-long');
    const current = controller.generate({ prompts: [], plugins: [] }, 'conversation-long');
    resolveFirst!(oldExecution);

    await expect(stale).resolves.toBeNull();
    await expect(current).resolves.toBeTruthy();
    expect(bridge.cancelPromptPreview).toHaveBeenCalledWith('request-old-1');
    expect(client.releaseAuditSession).toHaveBeenCalledWith({
      sessionId: oldExecution.sessionId,
      expectedRevision: oldExecution.revision,
    });
    expect(controller.getState().currentStep).toBe('complete');
  });

  it('cancels main preparation when the dialog closes', async () => {
    let signalObserved = false;
    let rejectPreparation: ((error: Error) => void) | undefined;
    const bridge: DesktopPromptPreviewBridge = {
      preparePromptPreviewExecutionModelRequest: vi.fn(async () =>
        await new Promise<PromptPreviewPreparedExecution>((_resolve, reject) => {
          signalObserved = true;
          rejectPreparation = reject;
        })
      ),
      cancelPromptPreview: vi.fn(async () => {
        rejectPreparation?.(new DOMException('cancelled', 'AbortError'));
      }),
    };
    const controller = createDesktopPromptPreviewController({
      bridge,
      previewClient: previewClient(),
      createRequestId: () => 'request-close-1',
    });
    controller.open();
    const pending = controller.generate({ prompts: [], plugins: [] }, 'conversation-long');
    await vi.waitFor(() => {
      expect(signalObserved).toBe(true);
    });

    controller.close();

    await expect(pending).resolves.toBeNull();
    expect(bridge.cancelPromptPreview).toHaveBeenCalledWith('request-close-1');
    expect(controller.getState().open).toBe(false);
  });
});

function bridgeFixture(
  prepare: DesktopPromptPreviewBridge['preparePromptPreviewExecutionModelRequest'],
): DesktopPromptPreviewBridge {
  return {
    preparePromptPreviewExecutionModelRequest: vi.fn(prepare),
    cancelPromptPreview: vi.fn(async () => undefined),
  };
}

function previewClient(): PromptPreviewClient {
  return {
    generatePreview: vi.fn(async () => ({ flatPrompts: [], processedPrompts: [] })),
    getAuditPage: vi.fn(async () => {
      throw new Error('unused');
    }),
    getAuditDetail: vi.fn(async () => {
      throw new Error('unused');
    }),
    releaseAuditSession: vi.fn(),
  };
}

function auditExecution(label = 'default'): PromptPreviewPreparedExecution {
  const store = new PromptPreviewAuditSessionStore({
    createSessionId: () => `session-${label}`,
    createRevision: () => `revision-${label}`,
  });
  return store.createSession({
    request: {
      providerId: 'provider-exact',
      logicalModelId: 'logical-exact',
      wireModelId: 'wire-exact',
      apiMode: 'responses',
      messages: [
        { role: 'system', content: 'system exact' },
        { role: 'assistant', content: 'durable compaction' },
        { role: 'user', content: 'recent input' },
      ],
    },
    sources: ['system', 'context-compaction-summary', 'conversation-message'],
  });
}
