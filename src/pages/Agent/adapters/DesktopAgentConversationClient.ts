import type { AgentAttachmentInput, AgentConversationClient, AgentRuntimeView } from 'memeloop';

import { createSecureBrowserUuid } from './createSecureBrowserUuid';

function throwIfAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

function abortError(reason: unknown): Error {
  return reason instanceof Error ? reason : new DOMException('Aborted', 'AbortError');
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

function assertCommittedAttachment(
  attachment: AgentAttachmentInput | undefined,
): asserts attachment is Exclude<AgentAttachmentInput, { kind: 'source' }> | undefined {
  if (attachment?.kind === 'source') {
    throw new Error('Desktop attachment source must be committed by the bounded upload adapter before sendMessage');
  }
}

function requireAgent(agent: AgentRuntimeView | undefined, conversationId: string): AgentRuntimeView {
  if (!agent) throw new Error('agent_conversation_not_found');
  if (agent.id !== conversationId) throw new Error('agent_conversation_identity_mismatch');
  return agent;
}

/** Electron IPC binding that forwards Core's exact management contracts unchanged. */
export const createDesktopAgentConversationClient = (): AgentConversationClient => ({
  async getMessagePage(conversationId, options, callOptions) {
    throwIfAborted(callOptions?.signal);
    const page = await window.service.agentInstance.getAgentMessagePage(conversationId, options);
    throwIfAborted(callOptions?.signal);
    return page;
  },

  async getMessageWindowAround(request, options) {
    throwIfAborted(options?.signal);
    const windowResult = await window.service.agentInstance.getAgentMessageWindowAround(request);
    throwIfAborted(options?.signal);
    return windowResult;
  },

  async getTurnDetail(request, options) {
    throwIfAborted(options?.signal);
    const response = await window.service.agentInstance.getAgentTurnDetail(request);
    throwIfAborted(options?.signal);
    return response;
  },

  async sendMessage(conversationId, content, attachment, wikiTiddlers, options) {
    throwIfAborted(options?.signal);
    assertCommittedAttachment(attachment);
    const agent = requireAgent(
      await window.service.agentInstance.getAgentMetadata(conversationId),
      conversationId,
    );
    throwIfAborted(options?.signal);
    const requestId = `conversation-client:request:${createSecureBrowserUuid()}`;
    const turnId = `conversation-client:turn:${createSecureBrowserUuid()}`;
    const runTurnRequest = await window.service.agentInstance.prepareAgentDeviceRpcRunTurn({
      target: { kind: 'local' },
      provenance: {
        conversationId,
        definitionId: agent.agentDefId,
        requestId,
        turnId,
      },
      message: content,
      ...(attachment === undefined ? {} : { attachment }),
      ...(wikiTiddlers === undefined ? {} : { wikiTiddlers }),
    });
    throwIfAborted(options?.signal);
    const handle = await window.service.agentInstance.executeAgentRun(runTurnRequest);
    if (handle.conversationId !== conversationId || handle.requestId !== requestId || handle.turnId !== turnId) {
      await window.service.agentInstance.cancelAgentRun(handle.runId);
      throw new Error('durable_agent_run_identity_mismatch');
    }
    await waitForLocalRun(handle.runId, options?.signal);
    throwIfAborted(options?.signal);
  },

  subscribeToMessages(conversationId, listener) {
    const subscription = window.observables.agentInstance.subscribeToConversationUpdates(conversationId)
      .subscribe(listener);
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
