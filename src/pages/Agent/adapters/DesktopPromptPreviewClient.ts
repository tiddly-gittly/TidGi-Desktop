import type {
  PromptConcatStreamState,
  PromptPreviewAuditDetailChunk,
  PromptPreviewAuditDetailRequest,
  PromptPreviewAuditPage,
  PromptPreviewAuditPageRequest,
  PromptPreviewAuditReleaseRequest,
  PromptPreviewClient,
  PromptPreviewGeneratedResult,
  PromptPreviewProgress,
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
  generatePreview: async (agentFrameworkConfig, execution, onProgress, options) => {
    options.signal.throwIfAborted();
    const stream = window.observables.agentInstance.concatPromptPreview({
      sessionId: execution.sessionId,
      expectedRevision: execution.revision,
      agentFrameworkConfig,
    });

    return new Promise((resolve, reject) => {
      let settled = false;
      const subscription: { current?: { unsubscribe(): void } } = {};
      const dispose = (): void => {
        options.signal.removeEventListener('abort', abort);
        subscription.current?.unsubscribe();
      };
      const finish = (result: PromptPreviewGeneratedResult | null): void => {
        if (settled) return;
        settled = true;
        dispose();
        resolve(result);
      };
      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        dispose();
        reject(error instanceof Error ? error : new Error('prompt_preview_failed'));
      };
      const abort = (): void => {
        fail(abortReason(options.signal));
      };

      options.signal.addEventListener('abort', abort, { once: true });
      if (options.signal.aborted) {
        abort();
        return;
      }

      let latest: PromptPreviewGeneratedResult = { flatPrompts: [], processedPrompts: [] };
      subscription.current = stream.subscribe({
        next: (state: PromptConcatStreamState) => {
          if (settled || options.signal.aborted) return;
          onProgress?.({
            progress: normalizeProgress(state.progress),
            stepCode: toStepCode(state.step),
            ...(state.currentPlugin?.toolId ? { currentPlugin: state.currentPlugin.toolId } : {}),
          });
          latest = { flatPrompts: state.flatPrompts, processedPrompts: state.processedPrompts };
          if (state.isComplete) finish(latest);
        },
        error: fail,
        complete: () => {
          finish(latest);
        },
      });
    });
  },

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

function normalizeProgress(progress: unknown): number {
  return typeof progress === 'number' && Number.isFinite(progress)
    ? Math.max(0, Math.min(1, progress))
    : 0;
}

function toStepCode(step: unknown): PromptPreviewProgress['stepCode'] {
  if (step === 'plugin' || step === 'flatten' || step === 'finalize') return step;
  return 'completing';
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
