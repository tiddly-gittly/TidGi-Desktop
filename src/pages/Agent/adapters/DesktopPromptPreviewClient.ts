import type {
  PromptPreviewAuditDetailChunk,
  PromptPreviewAuditDetailRequest,
  PromptPreviewAuditPage,
  PromptPreviewAuditPageRequest,
  PromptPreviewAuditReleaseRequest,
  PromptPreviewClient,
} from 'memeloop';

interface PromptPreviewAgentInstanceBridge {
  getPromptPreviewAuditPage(request: PromptPreviewAuditPageRequest): Promise<PromptPreviewAuditPage>;
  getPromptPreviewAuditDetail(request: PromptPreviewAuditDetailRequest): Promise<PromptPreviewAuditDetailChunk>;
  releasePromptPreviewAuditSession(request: PromptPreviewAuditReleaseRequest): Promise<void>;
}

/** Read pages from the model request retained by the main process. */
export const createDesktopPromptPreviewClient = (
  bridge: PromptPreviewAgentInstanceBridge = window.service.agentInstance,
): PromptPreviewClient => ({
  getAuditPage: async (request, options): Promise<PromptPreviewAuditPage> => {
    return readWithSignal(options.signal, () => bridge.getPromptPreviewAuditPage(request));
  },

  getAuditDetail: async (request, options): Promise<PromptPreviewAuditDetailChunk> => {
    return readWithSignal(options.signal, () => bridge.getPromptPreviewAuditDetail(request));
  },

  releaseAuditSession: (request: PromptPreviewAuditReleaseRequest): void => {
    void bridge.releasePromptPreviewAuditSession(request).catch(() => undefined);
  },
});

async function readWithSignal<T>(signal: AbortSignal, read: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => {
      reject(signal.reason instanceof Error ? signal.reason : new DOMException('Prompt preview was cancelled', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    void Promise.resolve().then(() => {
      signal.throwIfAborted();
      return read();
    }).then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', abort);
    });
  });
}
