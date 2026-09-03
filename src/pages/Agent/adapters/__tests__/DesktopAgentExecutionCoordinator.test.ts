import { AGENT_RUN_ERROR_MESSAGE_KEYS, createAgentRunError, extractAgentRunError } from 'memeloop';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDesktopAgentExecutionCoordinator, type DesktopAgentExecutionCoordinatorServices } from '../DesktopAgentExecutionCoordinator';

describe('DesktopAgentExecutionCoordinator', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('submits an exact local durable run and remains running until its terminal record', async () => {
    const services = createServices();
    const onRunAccepted = vi.fn(async () => undefined);
    services.agentInstance.getAgentRunStatus = vi.fn()
      .mockResolvedValueOnce(runStatus('running'))
      .mockResolvedValueOnce(runStatus('completed'));
    const coordinator = createDesktopAgentExecutionCoordinator('peer-local', {
      createId: sequentialIds(),
      pollIntervalMs: 1,
      services,
      onRunAccepted,
    });
    const snapshots: string[] = [];
    coordinator.subscribe(snapshot => snapshots.push(snapshot.status));
    const provenance = provenanceOf('turn-1', 'request-1');

    await expect(coordinator.execute({
      target: { kind: 'local' },
      provenance,
      message: 'hello',
    })).resolves.toEqual({ runId: 'run-1', synchronization: 'not-required' });

    expect(services.agentInstance.prepareAgentDeviceRpcRunTurn).toHaveBeenCalledWith({
      target: { kind: 'local' },
      provenance,
      message: 'hello',
    });
    expect(services.agentInstance.executeAgentRun).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      definitionId: 'definition-1',
      message: 'rendered:hello',
      requestId: 'request-1',
      turnId: 'turn-1',
      userMessage: { content: 'rendered:hello' },
    });
    expect(services.agentInstance.getAgentRunStatus).toHaveBeenCalledTimes(2);
    expect(onRunAccepted).toHaveBeenCalledWith(provenance, expect.objectContaining({ runId: 'run-1' }));
    expect(onRunAccepted.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(services.agentInstance.getAgentRunStatus).mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
    expect(snapshots).toEqual(['queued', 'running', 'succeeded']);
    await coordinator.dispose();
  });

  it('preserves the structured failure from an accepted durable run', async () => {
    const services = createServices();
    const runError = createAgentRunError({
      code: 'PROVIDER_AUTH_MISSING',
      messageKey: AGENT_RUN_ERROR_MESSAGE_KEYS.PROVIDER_AUTH_MISSING,
      retryable: false,
      providerId: 'cpa',
      modelId: 'model-1',
      localizedParams: { providerId: 'cpa', modelId: 'model-1', settingField: 'apiKey' },
      settingTarget: { kind: 'provider', providerId: 'cpa', field: 'apiKey' },
    });
    services.agentInstance.getAgentRunStatus = vi.fn().mockResolvedValue({
      ...runStatus('failed'),
      error: runError,
    });
    const coordinator = createDesktopAgentExecutionCoordinator('peer-local', {
      createId: sequentialIds(),
      pollIntervalMs: 1,
      services,
    });

    let received: unknown;
    try {
      await coordinator.execute({
        target: { kind: 'local' },
        provenance: provenanceOf('turn-1', 'request-1'),
        message: 'hello',
      });
    } catch (error) {
      received = error;
    }

    expect(extractAgentRunError(received)).toEqual(runError);
    expect(coordinator.getSnapshot('conversation-1').error).toBe(received);
    await coordinator.dispose();
  });

  it('maps a structured no-model rejection after a clone-safe service boundary', async () => {
    const services = createServices();
    const runError = createAgentRunError({
      code: 'PROVIDER_CONFIGURATION_MISSING',
      messageKey: AGENT_RUN_ERROR_MESSAGE_KEYS.PROVIDER_CONFIGURATION_MISSING,
      retryable: false,
      localizedParams: { settingField: 'model' },
      settingTarget: { kind: 'runtime', section: 'agent' },
    });
    const serviceError = new Error(runError.code);
    Object.defineProperty(serviceError, 'agentRunError', { value: structuredClone(runError) });
    services.agentInstance.executeAgentRun = vi.fn().mockRejectedValue(serviceError);
    const coordinator = createDesktopAgentExecutionCoordinator('peer-local', {
      createId: sequentialIds(),
      pollIntervalMs: 1,
      services,
    });

    let received: unknown;
    try {
      await coordinator.execute({
        target: { kind: 'local' },
        provenance: provenanceOf('turn-1', 'request-1'),
        message: 'hello',
      });
    } catch (error) {
      received = error;
    }

    expect(extractAgentRunError(received)).toEqual(runError);
    expect(services.agentInstance.getAgentRunStatus).not.toHaveBeenCalled();
    await coordinator.dispose();
  });

  it('uses the typed remote RPC client, polls to terminal, then synchronizes once', async () => {
    const services = createServices();
    const coordinator = createDesktopAgentExecutionCoordinator('peer-local', {
      createId: sequentialIds(),
      pollIntervalMs: 1,
      services,
    });

    await expect(coordinator.execute({
      target: { kind: 'remote', peerId: 'peer-remote' },
      provenance: provenanceOf('turn-remote', 'request-remote'),
      message: 'remote hello',
      wikiTiddlers: [{ workspaceName: 'Wiki', tiddlerTitle: 'Entry' }],
    })).resolves.toEqual({ runId: 'remote-run', synchronization: 'synchronized' });

    const calls = vi.mocked(services.deviceNetwork.sendRpc).mock.calls;
    expect(calls.map(call => call[1])).toEqual([
      'memeloop.agent.runTurn',
      'memeloop.agent.getRunStatus',
    ]);
    expect(calls[0]?.[2]).toEqual({
      conversationId: 'conversation-1',
      definitionId: 'definition-1',
      message: 'rendered:remote hello',
      requestId: 'request-remote',
      turnId: 'turn-remote',
      userMessage: { content: 'rendered:remote hello' },
    });
    expect(services.deviceNetwork.syncWithDevice).toHaveBeenCalledWith('peer-remote', {
      conversationIds: ['conversation-1'],
      operationId: expect.any(String),
    });
    expect(vi.mocked(services.deviceNetwork.sendRpc).mock.invocationCallOrder.at(-1) ?? Number.MAX_SAFE_INTEGER)
      .toBeLessThan(vi.mocked(services.deviceNetwork.syncWithDevice).mock.invocationCallOrder[0] ?? Number.MIN_SAFE_INTEGER);
    expect(services.deviceNetwork.finishOperation).toHaveBeenCalledTimes(2);
    await coordinator.dispose();
  });

  it('streams one source through local staging and remote upload before referencing it in runTurn', async () => {
    const services = createServices();
    const bytes = new TextEncoder().encode('hello attachment');
    const coordinator = createDesktopAgentExecutionCoordinator('peer-local', {
      createId: sequentialIds(),
      pollIntervalMs: 1,
      services,
    });
    const readChunk = vi.fn(async (offset: number, maxBytes: number) => offset >= bytes.byteLength ? null : bytes.slice(offset, Math.min(bytes.byteLength, offset + maxBytes)));

    await coordinator.execute({
      target: { kind: 'remote', peerId: 'peer-remote' },
      provenance: provenanceOf('turn-file', 'request-file'),
      message: 'inspect',
      attachment: {
        kind: 'source',
        filename: 'note.txt',
        mimeType: 'text/plain',
        totalBytes: bytes.byteLength,
        readChunk,
      },
    });

    expect(readChunk).toHaveBeenCalled();
    expect(services.agentInstance.beginAgentAttachmentUpload).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      filename: 'note.txt',
      mimeType: 'text/plain',
      totalBytes: bytes.byteLength,
    });
    expect(services.agentInstance.readAgentAttachmentChunk).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conversation-1',
      reference: attachmentReference(),
    }));
    const rpcMethods = vi.mocked(services.deviceNetwork.sendRpc).mock.calls.map(call => call[1]);
    expect(rpcMethods).toEqual([
      'memeloop.chat.beginAttachmentUpload',
      'memeloop.chat.uploadAttachmentChunk',
      'memeloop.chat.commitAttachmentUpload',
      'memeloop.agent.runTurn',
      'memeloop.agent.getRunStatus',
    ]);
    expect(services.agentInstance.prepareAgentDeviceRpcRunTurn).toHaveBeenCalledWith(expect.objectContaining({
      target: { kind: 'remote', peerId: 'peer-remote' },
      attachment: { kind: 'committed', reference: attachmentReference() },
    }));
    expect(services.agentInstance.abortAgentAttachmentUpload).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      uploadId: 'local-upload',
    });
    await coordinator.dispose();
  });

  it('aborts the exact accepted run and fences a late completion on target switch', async () => {
    const services = createServices();
    let resolveStatus!: (status: unknown) => void;
    services.agentInstance.getAgentRunStatus = vi.fn(() =>
      new Promise(resolve => {
        resolveStatus = resolve;
      })
    ) as never;
    const coordinator = createDesktopAgentExecutionCoordinator('peer-local', {
      createId: sequentialIds(),
      pollIntervalMs: 1,
      services,
    });
    const execution = coordinator.execute({
      target: { kind: 'local' },
      provenance: provenanceOf('turn-switch', 'request-switch'),
      message: 'long run',
    });
    await vi.waitFor(() => {
      expect(services.agentInstance.getAgentRunStatus).toHaveBeenCalledOnce();
    });

    coordinator.switchTarget('conversation-1', { kind: 'remote', peerId: 'peer-next' });
    expect(services.agentInstance.cancelAgentRun).toHaveBeenCalledWith('run-1');
    resolveStatus(runStatus('completed'));
    await expect(execution).rejects.toEqual(expect.objectContaining({ code: 'STALE_OPERATION' }));
    expect(coordinator.getSnapshot('conversation-1')).toEqual(expect.objectContaining({
      status: 'idle',
      target: { kind: 'remote', peerId: 'peer-next' },
    }));
    await coordinator.dispose();
  });

  it('cancels the tracked local run by runId and waits for its durable terminal state', async () => {
    const services = createServices();
    let resolveExecutionStatus!: (status: unknown) => void;
    services.agentInstance.getAgentRunStatus = vi.fn()
      .mockImplementationOnce(() =>
        new Promise(resolve => {
          resolveExecutionStatus = resolve;
        })
      )
      .mockResolvedValueOnce(runStatus('cancelled'));
    const coordinator = createDesktopAgentExecutionCoordinator('peer-local', {
      createId: sequentialIds(),
      pollIntervalMs: 1,
      services,
    });
    const provenance = provenanceOf('turn-cancel', 'request-cancel');
    const execution = coordinator.execute({ target: { kind: 'local' }, provenance, message: 'cancel me' });
    await vi.waitFor(() => {
      expect(services.agentInstance.getAgentRunStatus).toHaveBeenCalledOnce();
    });

    await coordinator.cancel({ target: { kind: 'local' }, provenance });
    expect(services.agentInstance.cancelAgentRun).toHaveBeenCalledWith('run-1');
    expect(coordinator.getSnapshot('conversation-1')).toEqual(expect.objectContaining({ status: 'cancelled' }));
    resolveExecutionStatus(runStatus('cancelled'));
    await expect(execution).rejects.toEqual(expect.objectContaining({ code: 'CANCELLED' }));
    await coordinator.dispose();
  });

  it('routes retry and delete through exact remote identities and treats sync failure as degraded', async () => {
    const services = createServices();
    services.deviceNetwork.syncWithDevice = vi.fn().mockRejectedValue(new Error('offline'));
    const coordinator = createDesktopAgentExecutionCoordinator('peer-local', {
      createId: sequentialIds(),
      pollIntervalMs: 1,
      services,
    });
    await expect(coordinator.retry({
      target: { kind: 'remote', peerId: 'peer-remote' },
      provenance: provenanceOf('replacement-turn', 'retry-request'),
      sourceTurnId: 'source-turn',
    })).resolves.toEqual({ runId: 'remote-run', synchronization: 'degraded' });
    expect(coordinator.getSnapshot('conversation-1')).toEqual(expect.objectContaining({
      status: 'degraded',
      synchronization: 'degraded',
      error: expect.objectContaining({ code: 'SYNC_FAILED' }),
    }));
    await coordinator.delete({
      target: { kind: 'remote', peerId: 'peer-remote' },
      provenance: provenanceOf('source-turn', 'delete-request'),
    });
    const calls = vi.mocked(services.deviceNetwork.sendRpc).mock.calls;
    expect(calls.find(call => call[1] === 'memeloop.chat.retryTurn')?.[2]).toEqual({
      conversationId: 'conversation-1',
      definitionId: 'definition-1',
      newTurnId: 'replacement-turn',
      requestId: 'retry-request',
      turnId: 'source-turn',
    });
    expect(calls.find(call => call[1] === 'memeloop.chat.deleteTurn')?.[2]).toEqual({
      conversationId: 'conversation-1',
      requestId: 'delete-request',
      turnId: 'source-turn',
    });
    await coordinator.dispose();
  });
});

function createServices(): DesktopAgentExecutionCoordinatorServices {
  const reference = attachmentReference();
  let remoteTurnId = 'turn-remote';
  let remoteRequestId = 'request-remote';
  const sendRpc = vi.fn(async (_peerId: string, method: string, parameters: unknown) => {
    const request = parameters as Record<string, unknown>;
    switch (method) {
      case 'memeloop.chat.beginAttachmentUpload':
        return {
          ok: true,
          requestId: request.requestId,
          conversationId: request.conversationId,
          uploadId: 'remote-upload',
          totalBytes: request.totalBytes,
          maxChunkBytes: 256 * 1024,
        };
      case 'memeloop.chat.uploadAttachmentChunk':
        return {
          ok: true,
          requestId: request.requestId,
          conversationId: request.conversationId,
          uploadId: request.uploadId,
          offset: request.offset,
          byteLength: request.byteLength,
        };
      case 'memeloop.chat.commitAttachmentUpload':
        return {
          ok: true,
          requestId: request.requestId,
          conversationId: request.conversationId,
          uploadId: request.uploadId,
          attachment: reference,
        };
      case 'memeloop.agent.runTurn':
      case 'memeloop.chat.retryTurn':
        remoteTurnId = String(method === 'memeloop.chat.retryTurn' ? request.newTurnId : request.turnId);
        remoteRequestId = String(request.requestId);
        return {
          ok: true,
          runId: 'remote-run',
          requestId: request.requestId,
          turnId: method === 'memeloop.chat.retryTurn' ? request.newTurnId : request.turnId,
          conversationId: request.conversationId,
          state: 'accepted',
          ...(method === 'memeloop.chat.retryTurn'
            ? retryEvents({
              conversationId: request.conversationId,
              newTurnId: request.newTurnId,
              requestId: request.requestId,
              turnId: request.turnId,
            })
            : {}),
        };
      case 'memeloop.agent.getRunStatus':
        return { status: runStatus('completed', 'remote-run', remoteTurnId, remoteRequestId) };
      case 'memeloop.chat.deleteTurn':
        return {
          ok: true,
          conversationId: request.conversationId,
          turnId: request.turnId,
          requestId: request.requestId,
          tombstone: tombstone({
            conversationId: request.conversationId,
            requestId: request.requestId,
            turnId: request.turnId,
          }),
        };
      case 'memeloop.agent.cancel':
        return { ok: true, status: runStatus('cancelled', String(request.runId)) };
      default:
        throw new Error(`unexpected RPC ${method}`);
    }
  });
  return {
    agentInstance: {
      abortAgentAttachmentUpload: vi.fn().mockResolvedValue(undefined),
      beginAgentAttachmentUpload: vi.fn().mockResolvedValue({ uploadId: 'local-upload' }),
      cancelAgentRun: vi.fn().mockResolvedValue(true),
      commitAgentAttachmentUpload: vi.fn().mockResolvedValue({ kind: 'committed', reference }),
      deleteConversationTurn: vi.fn().mockResolvedValue({ ok: true }),
      executeAgentRun: vi.fn(async request => handle('run-1', request.turnId, request.requestId)),
      getAgentRunStatus: vi.fn().mockResolvedValue(runStatus('completed')),
      prepareAgentDeviceRpcRunTurn: vi.fn(async request => ({
        conversationId: request.provenance.conversationId,
        definitionId: request.provenance.definitionId,
        message: `rendered:${request.message}`,
        requestId: request.provenance.requestId,
        turnId: request.provenance.turnId,
        userMessage: {
          content: `rendered:${request.message}`,
          ...(request.attachment === undefined ? {} : { attachments: [request.attachment.reference] }),
        },
      })),
      readAgentAttachmentChunk: vi.fn().mockResolvedValue(new TextEncoder().encode('hello attachment')),
      retryConversationTurn: vi.fn(async request => ({
        ok: true as const,
        ...handle('run-retry', request.newTurnId, request.requestId),
        ...retryEvents(request),
      })),
      writeAgentAttachmentChunk: vi.fn(async (input: { offset: number; data: Uint8Array }) => ({ nextOffset: input.offset + input.data.byteLength })),
    },
    deviceNetwork: {
      abortOperation: vi.fn().mockResolvedValue(undefined),
      finishOperation: vi.fn().mockResolvedValue(undefined),
      sendRpc,
      syncWithDevice: vi.fn().mockResolvedValue(undefined),
    },
    logWarning: vi.fn(),
  };
}

function attachmentReference() {
  return {
    contentHash: `sha256:${'a'.repeat(64)}`,
    filename: 'note.txt',
    mimeType: 'text/plain',
    size: new TextEncoder().encode('hello attachment').byteLength,
  };
}

function handle(runId = 'run-1', turnId = 'turn-1', requestId = 'request-1') {
  return {
    runId,
    conversationId: 'conversation-1',
    turnId,
    requestId,
    state: 'accepted' as const,
  };
}

function runStatus(
  state: 'accepted' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled',
  runId = 'run-1',
  turnId = 'turn-1',
  requestId = 'request-1',
) {
  return {
    runId,
    conversationId: 'conversation-1',
    definitionId: 'definition-1',
    turnId,
    requestPeerId: 'peer-caller',
    requestId,
    payloadDigest: 'payload-digest',
    state,
    acceptedAt: 1,
    updatedAt: 2,
    ...(state === 'completed' || state === 'failed' || state === 'cancelled' ? { finishedAt: 2 } : {}),
  };
}

function provenanceOf(turnId: string, requestId: string) {
  return {
    conversationId: 'conversation-1',
    definitionId: 'definition-1',
    turnId,
    requestId,
  };
}

function sequentialIds() {
  let id = 0;
  return () => `desktop-operation-${++id}`;
}

function tombstone(request: { conversationId: unknown; requestId: unknown; turnId: unknown }) {
  return {
    eventId: `delete:${String(request.requestId)}`,
    conversationId: String(request.conversationId),
    originNodeId: 'peer-remote',
    originSequence: 1,
    lamportClock: 1,
    timestamp: 1,
    kind: 'tombstone' as const,
    targetTurnId: String(request.turnId),
    reason: 'user-delete' as const,
  };
}

function retryEvents(request: {
  conversationId: unknown;
  newTurnId: unknown;
  requestId: unknown;
  turnId: unknown;
}) {
  return {
    tombstone: tombstone(request),
    userEvent: {
      eventId: String(request.newTurnId),
      conversationId: String(request.conversationId),
      originNodeId: 'peer-remote',
      originSequence: 2,
      lamportClock: 2,
      timestamp: 2,
      kind: 'message' as const,
      message: {
        messageId: String(request.newTurnId),
        turnId: String(request.newTurnId),
        role: 'user' as const,
        content: 'retry',
        parts: [{ type: 'text' as const, text: 'retry' }],
      },
    },
  };
}
