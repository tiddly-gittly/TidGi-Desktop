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

/**
 * Desktop renderer client for the main-retained exact request. No durable
 * message or full model request is accepted here; audit reads remain bounded
 * and revision-fenced at the IPC boundary.
 */
export const createDesktopPromptPreviewClient = (
  bridge: PromptPreviewAgentInstanceBridge = window.service.agentInstance,
): PromptPreviewClient => ({
  getAuditPage: async (request, options): Promise<PromptPreviewAuditPage> => {
    return abortFenced(options.signal, bridge.getPromptPreviewAuditPage(request));
  },

  getAuditDetail: async (request, options): Promise<PromptPreviewAuditDetailChunk> => {
    return abortFenced(options.signal, bridge.getPromptPreviewAuditDetail(request));
  },

  releaseAuditSession: (request: PromptPreviewAuditReleaseRequest): void => {
    void bridge.releasePromptPreviewAuditSession(request).catch(() => undefined);
  },
});

async function abortFenced<T>(signal: AbortSignal, operation: Promise<T>): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const abort = (): void => {
      if (settled) return;
      settled = true;
      reject(abortReason(signal));
    };
    signal.addEventListener('abort', abort, { once: true });
    void operation.then(
      result => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', abort);
        resolve(result);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', abort);
        reject(error instanceof Error ? error : new Error('prompt_preview_audit_read_failed', { cause: error }));
      },
    );
  });
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('Prompt preview was cancelled', 'AbortError');
}

// Compile-time conformance for the bound IPC methods. These aliases also keep
// the public request types discoverable to Desktop plugin authors.
export type DesktopPromptPreviewAuditPageRequest = PromptPreviewAuditPageRequest;
export type DesktopPromptPreviewAuditDetailRequest = PromptPreviewAuditDetailRequest;
