import type {
  AgentAttachmentInput,
  AgentDeviceRpcClient,
  AgentDeviceRpcRunStatus,
  AttachmentReference,
  MemeLoopRunHandle,
  MemeLoopRunStatus,
  RemoteAgentCancelRequest,
  RemoteAgentDeleteRequest,
  RemoteAgentExecuteRequest,
  RemoteAgentExecutionCallOptions,
  RemoteAgentExecutionCoordinatorOptions,
  RemoteAgentExecutionProvenance,
  RemoteAgentExecutionResult,
  RemoteAgentExecutionTarget,
  RemoteAgentRetryRequest,
} from 'memeloop';
import { ATTACHMENT_UPLOAD_LIMITS, buildAttachmentUploadChunkRequest, createAgentDeviceRpcClient, RemoteAgentExecutionCoordinator, RemoteAgentExecutionError } from 'memeloop';

import { DESKTOP_ATTACHMENT_UPLOAD_LIMITS } from '@/services/agentInstance/attachmentUploadProtocol';
import type {
  DesktopAgentExecuteRunRequest,
  DesktopAttachmentUploadScope,
  DesktopPreparedAgentUserMessage,
  ReadDesktopAgentAttachmentChunkInput,
} from '@/services/agentInstance/attachmentUploadProtocol';

const DEFAULT_RUN_POLL_INTERVAL_MS = 500;

interface DesktopAgentInstanceExecutionPort {
  abortAgentAttachmentUpload(scope: DesktopAttachmentUploadScope): Promise<void>;
  beginAgentAttachmentUpload(input: {
    conversationId: string;
    filename: string;
    mimeType: string;
    totalBytes: number;
    sha256?: string;
  }): Promise<{ uploadId: string }>;
  cancelAgentRun(runId: string): Promise<boolean>;
  commitAgentAttachmentUpload(scope: DesktopAttachmentUploadScope): Promise<{ kind: 'committed'; reference: AttachmentReference }>;
  deleteConversationTurn(request: {
    conversationId: string;
    turnId: string;
    requestId: string;
  }): Promise<{ ok: true }>;
  executeAgentRun(request: DesktopAgentExecuteRunRequest): Promise<MemeLoopRunHandle>;
  getAgentRunStatus(runId: string): Promise<MemeLoopRunStatus | undefined>;
  prepareRemoteAgentUserMessage(request: DesktopAgentExecuteRunRequest): Promise<DesktopPreparedAgentUserMessage>;
  readAgentAttachmentChunk(input: ReadDesktopAgentAttachmentChunkInput): Promise<Uint8Array | null>;
  retryConversationTurn(request: {
    conversationId: string;
    turnId: string;
    newTurnId: string;
    requestId: string;
    definitionId?: string;
  }): Promise<MemeLoopRunHandle & { ok: true }>;
  writeAgentAttachmentChunk(input: {
    uploadId: string;
    conversationId: string;
    offset: number;
    data: Uint8Array;
  }): Promise<{ nextOffset: number }>;
}

interface DesktopDeviceNetworkExecutionPort {
  abortOperation(operationId: string): Promise<void>;
  finishOperation(operationId: string): Promise<void>;
  sendRpc(peerId: string, method: string, parameters: unknown, options?: { operationId?: string }): Promise<unknown>;
  syncWithDevice(peerId: string, options: { conversationIds: string[]; operationId: string }): Promise<unknown>;
}

export interface DesktopAgentExecutionCoordinatorServices {
  agentInstance: DesktopAgentInstanceExecutionPort;
  deviceNetwork: DesktopDeviceNetworkExecutionPort;
  logWarning(message: string, metadata: Record<string, unknown>): void;
}

export interface DesktopAgentExecutionCoordinatorFactoryOptions {
  createId?: () => string;
  /** Host checkpoint invoked immediately after the exact durable run is accepted. */
  onRunAccepted?: (provenance: RemoteAgentExecutionProvenance, handle: MemeLoopRunHandle) => void | Promise<void>;
  pollIntervalMs?: number;
  services?: DesktopAgentExecutionCoordinatorServices;
}

interface StagedAttachment {
  attachment: { kind: 'committed'; reference: AttachmentReference };
  scope?: DesktopAttachmentUploadScope;
}

interface ActiveRun {
  runId: string;
  target: RemoteAgentExecutionTarget;
}

/** Wrap a browser File without materializing it in renderer memory. */
export function createDesktopFileAttachmentSource(file: File): AgentAttachmentInput {
  return {
    kind: 'source',
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    totalBytes: file.size,
    async readChunk(offset, maxBytes, options) {
      options?.signal?.throwIfAborted();
      if (offset >= file.size) return null;
      const end = Math.min(file.size, offset + maxBytes);
      const data = new Uint8Array(await file.slice(offset, end).arrayBuffer());
      options?.signal?.throwIfAborted();
      return data;
    },
  };
}

/**
 * Desktop's eight concrete ports for Core RemoteAgentExecutionCoordinator.
 * Every execute/retry port retains ownership until the durable run is terminal.
 */
export function createDesktopAgentExecutionCoordinator(
  localPeerId: string,
  options: DesktopAgentExecutionCoordinatorFactoryOptions = {},
): RemoteAgentExecutionCoordinator {
  const services = options.services ?? browserServices();
  const createId = options.createId ?? (() => crypto.randomUUID());
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_RUN_POLL_INTERVAL_MS;
  const activeRuns = new Map<string, ActiveRun>();

  const remoteClient = (peerId: string, operationId: string): AgentDeviceRpcClient =>
    createAgentDeviceRpcClient({
      peerId,
      createRequestId: createId,
      sendRpc: (targetPeerId, method, parameters) => services.deviceNetwork.sendRpc(targetPeerId, method, parameters, { operationId }),
    });

  const runLocal = async (
    request: RemoteAgentExecuteRequest,
    callOptions: RemoteAgentExecutionCallOptions,
  ): Promise<RemoteAgentExecutionResult> => {
    const staged = await stageAttachment(request.attachment, request.provenance.conversationId, callOptions.signal, services);
    try {
      const handle = await services.agentInstance.executeAgentRun({
        conversationId: request.provenance.conversationId,
        definitionId: request.provenance.definitionId,
        message: request.message,
        requestId: request.provenance.requestId,
        turnId: request.provenance.turnId,
        ...(staged === undefined ? {} : { attachment: staged.attachment }),
        ...(request.wikiTiddlers === undefined ? {} : { wikiTiddlers: request.wikiTiddlers }),
      });
      assertRunHandleCorrelation(handle, request.provenance);
      await notifyRunAccepted(options, request.provenance, handle, services);
      await waitForAcceptedRun({
        activeRuns,
        conversationId: request.provenance.conversationId,
        handle,
        load: () => services.agentInstance.getAgentRunStatus(handle.runId),
        pollIntervalMs,
        signal: callOptions.signal,
        target: request.target,
        cancelOnAbort: () => services.agentInstance.cancelAgentRun(handle.runId).then(() => undefined),
      });
      return { runId: handle.runId };
    } catch (error) {
      services.logWarning('Local agent execution port failed', {
        conversationId: request.provenance.conversationId,
        requestId: request.provenance.requestId,
        error,
      });
      throw error;
    } finally {
      await releaseStagedAttachment(staged, services);
    }
  };

  const runRemote = async (
    request: RemoteAgentExecuteRequest,
    callOptions: RemoteAgentExecutionCallOptions,
  ): Promise<RemoteAgentExecutionResult> => {
    if (request.target.kind !== 'remote') throw new RemoteAgentExecutionError('INVALID_TARGET', false);
    const target = request.target;
    const staged = await stageAttachment(request.attachment, request.provenance.conversationId, callOptions.signal, services);
    try {
      return await withRemoteOperation(services, createId, callOptions.signal, async operationId => {
        const client = remoteClient(target.peerId, operationId);
        const forwardedAttachment = staged === undefined
          ? undefined
          : await uploadAttachmentToRemote(
            client,
            staged.attachment.reference,
            request.provenance.conversationId,
            services,
            createId,
            callOptions.signal,
          );
        const prepared = await services.agentInstance.prepareRemoteAgentUserMessage({
          conversationId: request.provenance.conversationId,
          definitionId: request.provenance.definitionId,
          message: request.message,
          requestId: request.provenance.requestId,
          turnId: request.provenance.turnId,
          ...(forwardedAttachment === undefined ? {} : { attachment: forwardedAttachment }),
          ...(request.wikiTiddlers === undefined ? {} : { wikiTiddlers: request.wikiTiddlers }),
        });
        callOptions.signal.throwIfAborted();
        const handle = await client.runTurn({
          conversationId: request.provenance.conversationId,
          definitionId: request.provenance.definitionId,
          message: prepared.message,
          requestId: request.provenance.requestId,
          turnId: request.provenance.turnId,
          userMessage: prepared.userMessage,
        });
        assertRunHandleCorrelation(handle, request.provenance);
        await notifyRunAccepted(options, request.provenance, handle, services);
        await waitForAcceptedRun({
          activeRuns,
          conversationId: request.provenance.conversationId,
          handle,
          load: async () => (await client.getRunStatus({ runId: handle.runId })).status ?? undefined,
          pollIntervalMs,
          signal: callOptions.signal,
          target,
          cancelOnAbort: () => cancelRemoteRunBestEffort(target.peerId, handle.runId, services, createId),
        });
        return { runId: handle.runId };
      });
    } finally {
      await releaseStagedAttachment(staged, services);
    }
  };

  const retryLocal = async (
    request: RemoteAgentRetryRequest,
    callOptions: RemoteAgentExecutionCallOptions,
  ): Promise<RemoteAgentExecutionResult> => {
    const handle = await services.agentInstance.retryConversationTurn({
      conversationId: request.provenance.conversationId,
      definitionId: request.provenance.definitionId,
      newTurnId: request.provenance.turnId,
      requestId: request.provenance.requestId,
      turnId: request.sourceTurnId,
    });
    assertRunHandleCorrelation(handle, request.provenance);
    await waitForAcceptedRun({
      activeRuns,
      conversationId: request.provenance.conversationId,
      handle,
      load: () => services.agentInstance.getAgentRunStatus(handle.runId),
      pollIntervalMs,
      signal: callOptions.signal,
      target: request.target,
      cancelOnAbort: () => services.agentInstance.cancelAgentRun(handle.runId).then(() => undefined),
    });
    return { runId: handle.runId };
  };

  const retryRemote = async (
    request: RemoteAgentRetryRequest,
    callOptions: RemoteAgentExecutionCallOptions,
  ): Promise<RemoteAgentExecutionResult> => {
    if (request.target.kind !== 'remote') throw new RemoteAgentExecutionError('INVALID_TARGET', false);
    const target = request.target;
    return withRemoteOperation(services, createId, callOptions.signal, async operationId => {
      const client = remoteClient(target.peerId, operationId);
      const handle = await client.retryTurn({
        conversationId: request.provenance.conversationId,
        definitionId: request.provenance.definitionId,
        newTurnId: request.provenance.turnId,
        requestId: request.provenance.requestId,
        turnId: request.sourceTurnId,
      });
      await waitForAcceptedRun({
        activeRuns,
        conversationId: request.provenance.conversationId,
        handle,
        load: async () => (await client.getRunStatus({ runId: handle.runId })).status ?? undefined,
        pollIntervalMs,
        signal: callOptions.signal,
        target,
        cancelOnAbort: () => cancelRemoteRunBestEffort(target.peerId, handle.runId, services, createId),
      });
      return { runId: handle.runId };
    });
  };

  const deleteLocal = async (request: RemoteAgentDeleteRequest, callOptions: RemoteAgentExecutionCallOptions) => {
    callOptions.signal.throwIfAborted();
    await services.agentInstance.deleteConversationTurn({
      conversationId: request.provenance.conversationId,
      requestId: request.provenance.requestId,
      turnId: request.provenance.turnId,
    });
    callOptions.signal.throwIfAborted();
    return { ok: true as const };
  };

  const deleteRemote = async (request: RemoteAgentDeleteRequest, callOptions: RemoteAgentExecutionCallOptions) => {
    if (request.target.kind !== 'remote') throw new RemoteAgentExecutionError('INVALID_TARGET', false);
    const target = request.target;
    return withRemoteOperation(services, createId, callOptions.signal, async operationId => {
      const client = remoteClient(target.peerId, operationId);
      await client.deleteTurn({
        conversationId: request.provenance.conversationId,
        requestId: request.provenance.requestId,
        turnId: request.provenance.turnId,
      });
      return { ok: true as const };
    });
  };

  const cancelLocal = (request: RemoteAgentCancelRequest, callOptions: RemoteAgentExecutionCallOptions) =>
    cancelTrackedRun(request, callOptions, activeRuns, {
      cancel: runId => services.agentInstance.cancelAgentRun(runId).then(() => undefined),
      load: runId => services.agentInstance.getAgentRunStatus(runId),
      pollIntervalMs,
    });

  const cancelRemote = async (request: RemoteAgentCancelRequest, callOptions: RemoteAgentExecutionCallOptions) => {
    if (request.target.kind !== 'remote') throw new RemoteAgentExecutionError('INVALID_TARGET', false);
    const target = request.target;
    const active = activeRuns.get(request.provenance.conversationId);
    if (!active || !targetsEqual(active.target, target)) return;
    await withRemoteOperation(services, createId, callOptions.signal, async operationId => {
      const client = remoteClient(target.peerId, operationId);
      await client.cancel({ runId: active.runId });
      await waitForTerminalCancellation(
        () => client.getRunStatus({ runId: active.runId }).then(response => response.status ?? undefined),
        callOptions.signal,
        pollIntervalMs,
      );
    });
  };

  const coordinatorOptions: RemoteAgentExecutionCoordinatorOptions = {
    localPeerId,
    executeLocal: runLocal,
    executeRemote: runRemote,
    retryLocal,
    retryRemote,
    deleteLocal,
    deleteRemote,
    cancelLocal,
    cancelRemote,
    syncConversation: (peerId, conversationId, callOptions) =>
      withRemoteOperation(services, createId, callOptions.signal, async operationId => {
        await services.deviceNetwork.syncWithDevice(peerId, { conversationIds: [conversationId], operationId });
      }),
    createId,
    onListenerError: error => {
      services.logWarning('Agent execution snapshot listener failed', { error });
    },
  };
  return new RemoteAgentExecutionCoordinator(coordinatorOptions);
}

async function notifyRunAccepted(
  options: DesktopAgentExecutionCoordinatorFactoryOptions,
  provenance: RemoteAgentExecutionProvenance,
  handle: MemeLoopRunHandle,
  services: DesktopAgentExecutionCoordinatorServices,
): Promise<void> {
  try {
    await options.onRunAccepted?.(provenance, handle);
  } catch (error) {
    // Acceptance is already durable. A failed host checkpoint must leave its
    // pending marker intact so remount can replay the same provenance.
    services.logWarning('Failed to checkpoint an accepted agent run', {
      conversationId: provenance.conversationId,
      requestId: provenance.requestId,
      runId: handle.runId,
      error,
    });
  }
}

async function stageAttachment(
  attachment: AgentAttachmentInput | undefined,
  conversationId: string,
  signal: AbortSignal,
  services: DesktopAgentExecutionCoordinatorServices,
): Promise<StagedAttachment | undefined> {
  if (attachment === undefined) return undefined;
  if (attachment.kind === 'committed') return { attachment };
  signal.throwIfAborted();
  if (attachment.totalBytes > DESKTOP_ATTACHMENT_UPLOAD_LIMITS.totalBytes) {
    throw new RangeError('attachment exceeds Desktop upload limit');
  }
  const upload = await services.agentInstance.beginAgentAttachmentUpload({
    conversationId,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    totalBytes: attachment.totalBytes,
    ...(attachment.sha256 === undefined ? {} : { sha256: attachment.sha256 }),
  });
  const scope = { conversationId, uploadId: upload.uploadId };
  try {
    let offset = 0;
    while (offset < attachment.totalBytes) {
      signal.throwIfAborted();
      const requestedBytes = Math.min(DESKTOP_ATTACHMENT_UPLOAD_LIMITS.chunkBytes, attachment.totalBytes - offset);
      const data = await attachment.readChunk(offset, requestedBytes, { signal });
      signal.throwIfAborted();
      if (!data || data.byteLength === 0 || data.byteLength > requestedBytes) {
        throw new Error('attachment source returned an invalid chunk');
      }
      const result = await services.agentInstance.writeAgentAttachmentChunk({ ...scope, offset, data });
      if (result.nextOffset !== offset + data.byteLength) throw new Error('attachment upload offset diverged');
      offset = result.nextOffset;
    }
    const committed = await services.agentInstance.commitAgentAttachmentUpload(scope);
    if (committed.reference.size !== attachment.totalBytes) throw new Error('attachment committed size diverged');
    return { attachment: committed, scope };
  } catch (error) {
    await services.agentInstance.abortAgentAttachmentUpload(scope).catch(() => undefined);
    throw error;
  }
}

async function uploadAttachmentToRemote(
  client: AgentDeviceRpcClient,
  reference: AttachmentReference,
  conversationId: string,
  services: DesktopAgentExecutionCoordinatorServices,
  createId: () => string,
  signal: AbortSignal,
): Promise<{ kind: 'committed'; reference: AttachmentReference }> {
  const begin = await client.beginAttachmentUpload({
    conversationId,
    filename: reference.filename,
    mimeType: reference.mimeType,
    requestId: createId(),
    totalBytes: reference.size,
  }, { signal });
  let offset = 0;
  while (offset < reference.size) {
    signal.throwIfAborted();
    const maximum = Math.min(
      begin.maxChunkBytes,
      ATTACHMENT_UPLOAD_LIMITS.chunkBytes,
      DESKTOP_ATTACHMENT_UPLOAD_LIMITS.chunkBytes,
      reference.size - offset,
    );
    const data = await services.agentInstance.readAgentAttachmentChunk({ conversationId, reference, offset, maxBytes: maximum });
    signal.throwIfAborted();
    if (!data || data.byteLength === 0 || data.byteLength > maximum) throw new Error('attachment blob read was incomplete');
    const chunkRequest = await buildAttachmentUploadChunkRequest({
      conversationId,
      data,
      offset,
      requestId: createId(),
      uploadId: begin.uploadId,
    });
    const response = await client.uploadAttachmentChunk(chunkRequest, { signal });
    if (response.offset !== offset || response.byteLength !== data.byteLength) {
      throw new Error('remote attachment upload offset diverged');
    }
    offset += data.byteLength;
  }
  const committed = await client.commitAttachmentUpload({
    conversationId,
    requestId: createId(),
    sha256: reference.contentHash,
    size: reference.size,
    uploadId: begin.uploadId,
  }, { signal });
  if (!referencesEqual(committed.attachment, reference)) throw new Error('remote attachment commit diverged');
  return { kind: 'committed', reference: committed.attachment };
}

async function waitForAcceptedRun(options: {
  activeRuns: Map<string, ActiveRun>;
  cancelOnAbort: () => Promise<void>;
  conversationId: string;
  handle: MemeLoopRunHandle;
  load: () => Promise<MemeLoopRunStatus | AgentDeviceRpcRunStatus | undefined>;
  pollIntervalMs: number;
  signal: AbortSignal;
  target: RemoteAgentExecutionTarget;
}): Promise<void> {
  const active = { runId: options.handle.runId, target: options.target };
  options.activeRuns.set(options.conversationId, active);
  const abortListener = () => {
    void options.cancelOnAbort().catch(() => undefined);
  };
  options.signal.addEventListener('abort', abortListener, { once: true });
  try {
    for (;;) {
      options.signal.throwIfAborted();
      const status = await options.load();
      options.signal.throwIfAborted();
      if (!status) throw new RemoteAgentExecutionError('PORT_FAILURE', true);
      if (
        status.runId !== options.handle.runId ||
        status.conversationId !== options.handle.conversationId ||
        status.turnId !== options.handle.turnId ||
        status.requestId !== options.handle.requestId
      ) throw new RemoteAgentExecutionError('PORT_FAILURE', false);
      if (status.state === 'completed') return;
      if (status.state === 'failed') throw new RemoteAgentExecutionError('PORT_FAILURE', status.error?.retryable ?? true);
      if (status.state === 'cancelled') throw new RemoteAgentExecutionError('CANCELLED', false);
      await abortableDelay(options.pollIntervalMs, options.signal);
    }
  } finally {
    options.signal.removeEventListener('abort', abortListener);
    if (options.activeRuns.get(options.conversationId) === active) options.activeRuns.delete(options.conversationId);
  }
}

async function cancelTrackedRun(
  request: RemoteAgentCancelRequest,
  callOptions: RemoteAgentExecutionCallOptions,
  activeRuns: Map<string, ActiveRun>,
  options: {
    cancel(runId: string): Promise<void>;
    load(runId: string): Promise<MemeLoopRunStatus | undefined>;
    pollIntervalMs: number;
  },
): Promise<void> {
  const active = activeRuns.get(request.provenance.conversationId);
  if (!active || !targetsEqual(active.target, request.target)) return;
  await options.cancel(active.runId);
  await waitForTerminalCancellation(() => options.load(active.runId), callOptions.signal, options.pollIntervalMs);
}

async function waitForTerminalCancellation(
  load: () => Promise<MemeLoopRunStatus | AgentDeviceRpcRunStatus | undefined>,
  signal: AbortSignal,
  pollIntervalMs: number,
): Promise<void> {
  for (;;) {
    signal.throwIfAborted();
    const status = await load();
    signal.throwIfAborted();
    if (!status || status.state === 'completed' || status.state === 'failed' || status.state === 'cancelled') return;
    await abortableDelay(pollIntervalMs, signal);
  }
}

async function withRemoteOperation<Result>(
  services: DesktopAgentExecutionCoordinatorServices,
  createId: () => string,
  signal: AbortSignal,
  operation: (operationId: string) => Promise<Result>,
): Promise<Result> {
  signal.throwIfAborted();
  const operationId = createId();
  const abortListener = () => {
    void services.deviceNetwork.abortOperation(operationId).catch(() => undefined);
  };
  signal.addEventListener('abort', abortListener, { once: true });
  try {
    return await operation(operationId);
  } finally {
    signal.removeEventListener('abort', abortListener);
    await services.deviceNetwork.finishOperation(operationId).catch((error: unknown) => {
      services.logWarning('Failed to release remote agent operation', { error, operationId });
    });
  }
}

async function cancelRemoteRunBestEffort(
  peerId: string,
  runId: string,
  services: DesktopAgentExecutionCoordinatorServices,
  createId: () => string,
): Promise<void> {
  const operationId = createId();
  const client = createAgentDeviceRpcClient({
    peerId,
    createRequestId: createId,
    sendRpc: (targetPeerId, method, parameters) => services.deviceNetwork.sendRpc(targetPeerId, method, parameters, { operationId }),
  });
  try {
    await client.cancel({ runId });
  } finally {
    await services.deviceNetwork.finishOperation(operationId).catch(() => undefined);
  }
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function releaseStagedAttachment(
  staged: StagedAttachment | undefined,
  services: DesktopAgentExecutionCoordinatorServices,
): Promise<void> {
  if (staged?.scope === undefined) return;
  await services.agentInstance.abortAgentAttachmentUpload(staged.scope).catch((error: unknown) => {
    services.logWarning('Failed to release staged agent attachment', { error, uploadId: staged.scope?.uploadId });
  });
}

function targetsEqual(left: RemoteAgentExecutionTarget, right: RemoteAgentExecutionTarget): boolean {
  return left.kind === right.kind && (left.kind === 'local' || left.peerId === (right as { peerId: string }).peerId);
}

function referencesEqual(left: AttachmentReference, right: AttachmentReference): boolean {
  return left.contentHash === right.contentHash && left.filename === right.filename &&
    left.mimeType === right.mimeType && left.size === right.size;
}

function assertRunHandleCorrelation(
  handle: MemeLoopRunHandle,
  provenance: { conversationId: string; turnId: string; requestId: string },
): void {
  if (
    handle.conversationId !== provenance.conversationId ||
    handle.turnId !== provenance.turnId ||
    handle.requestId !== provenance.requestId ||
    handle.state !== 'accepted' || handle.runId.length === 0
  ) throw new RemoteAgentExecutionError('PORT_FAILURE', false);
}

function browserServices(): DesktopAgentExecutionCoordinatorServices {
  return {
    agentInstance: window.service.agentInstance,
    deviceNetwork: window.service.deviceNetwork,
    logWarning: (message, metadata) => {
      void window.service.native.log('warn', message, metadata);
    },
  };
}
