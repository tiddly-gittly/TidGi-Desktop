import type { PromptPreviewClient, PromptPreviewPreparedExecution } from 'memeloop';
import { PromptPreviewController } from 'memeloop';

import { createSecureBrowserUuid } from './createSecureBrowserUuid';
import { createDesktopPromptPreviewClient } from './DesktopPromptPreviewClient';

export interface DesktopPromptPreviewBridge {
  preparePromptPreviewExecutionModelRequest(input: {
    requestId: string;
    conversationId: string;
    inputText?: string;
  }): Promise<PromptPreviewPreparedExecution>;
  cancelPromptPreview(requestId: string): Promise<void>;
}

export interface CreateDesktopPromptPreviewControllerOptions {
  bridge?: DesktopPromptPreviewBridge;
  previewClient?: PromptPreviewClient;
  createRequestId?: () => string;
}

/** Create one controller per visible conversation tab. */
export function createDesktopPromptPreviewController(
  options: CreateDesktopPromptPreviewControllerOptions = {},
): PromptPreviewController {
  const bridge = options.bridge ?? defaultBridge();
  const createRequestId = options.createRequestId ?? createSecureBrowserUuid;
  const previewClient = options.previewClient ?? createDesktopPromptPreviewClient();

  return new PromptPreviewController({
    previewClient,
    prepareExecutionModelRequest: async (conversationId, _agentFrameworkConfig, callOptions) => {
      const requestId = createRequestId();
      const cancel = () => {
        void bridge.cancelPromptPreview(requestId).catch(() => undefined);
      };
      callOptions.signal.addEventListener('abort', cancel, { once: true });
      try {
        callOptions.signal.throwIfAborted();
        const execution = await bridge.preparePromptPreviewExecutionModelRequest({
          requestId,
          conversationId,
          ...(callOptions.inputText === undefined ? {} : { inputText: callOptions.inputText }),
        });
        if (callOptions.signal.aborted) {
          await Promise.resolve(previewClient.releaseAuditSession({
            sessionId: execution.sessionId,
            expectedRevision: execution.revision,
          })).catch(() => undefined);
        }
        callOptions.signal.throwIfAborted();
        return execution;
      } finally {
        callOptions.signal.removeEventListener('abort', cancel);
      }
    },
  });
}

function defaultBridge(): DesktopPromptPreviewBridge {
  return window.service.agentInstance;
}
