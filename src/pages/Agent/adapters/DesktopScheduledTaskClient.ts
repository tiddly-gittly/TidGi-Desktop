/**
 * Bounded Desktop binding for Core's scheduled-task client.
 *
 * One page considers at most eight devices with a fixed RPC concurrency. A
 * host cursor retains each device's independent keyset cursor; no call walks a
 * second page or materializes the complete task set. Offline/degraded cached
 * projections remain visible with explicit provenance.
 */

import type { ScheduledTask as DesktopScheduledTask } from '@services/agentInstance/tools/scheduledTaskTypes';
import type { Device } from '@services/deviceNetwork/interface';
import {
  type CreateScheduledTaskInput,
  type ListScheduledTasksOptions,
  type ScheduledTask,
  type ScheduledTaskClient,
  type ScheduledTaskPage,
  type ScheduledTaskPageSource,
  type ScheduledTaskState,
} from 'memeloop';
import { createAgentDeviceRpcClient, createScheduledTaskClientFromRpc } from 'memeloop/device-network';

const DEFAULT_PAGE_SIZE = 64;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_BYTES = 256 * 1024;
const MAX_PAGE_BYTES = 256 * 1024;
const MIN_PAGE_BYTES = 64;
const AGGREGATE_OVERHEAD_BYTES = 16 * 1024;
const MAX_SOURCE_BATCH = 8;
const MAX_DIRECTORY_SOURCES = 64;
const MAX_RPC_CONCURRENCY = 4;
const MAX_CURSOR_CHARACTERS = 16 * 1024;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

type SourcePath = 'local' | 'live' | 'cache';

interface SourceCursor {
  executionNodeId: string;
  path: SourcePath;
  done: boolean;
  cursor?: string;
  localAfter?: { updatedAt: string; id: string };
  cacheAfter?: { observedAt: number; id: string };
  revision?: string;
}

interface AggregateCursor {
  version: 1;
  agentInstanceId: string;
  states: ScheduledTaskState[];
  executionNodeIds?: string[];
  directorySignature: string;
  targetOffset: number;
  sources: SourceCursor[];
}

interface Target {
  executionNodeId: string;
  path: SourcePath;
}

interface SourceReadResult {
  cursor: SourceCursor;
  items: ScheduledTask[];
  source: ScheduledTaskPageSource;
  partial: boolean;
}

const toScheduledTask = (task: DesktopScheduledTask): ScheduledTask => ({
  id: task.id,
  agentInstanceId: task.agentInstanceId,
  agentDefinitionId: task.agentDefinitionId ?? task.agentInstanceId,
  name: task.name ?? task.id,
  schedule: task.schedule,
  payload: task.payload,
  activeHoursStart: task.activeHoursStart,
  activeHoursEnd: task.activeHoursEnd,
  enabled: task.enabled,
  createdBy: task.createdBy,
  state: task.state,
  executionNodeId: task.executionNodeId,
  executionNodeLabel: task.executionNodeLabel,
  originNodeId: task.originNodeId,
  updatedAt: task.updated,
});

const toDesktopScheduledTask = (task: ScheduledTask): DesktopScheduledTask => ({
  id: task.id,
  agentInstanceId: task.agentInstanceId,
  agentDefinitionId: task.agentDefinitionId,
  name: task.name,
  scheduleKind: task.schedule.kind,
  schedule: task.schedule,
  payload: task.payload?.message === undefined ? undefined : { message: task.payload.message },
  activeHoursStart: task.activeHoursStart,
  activeHoursEnd: task.activeHoursEnd,
  enabled: task.enabled,
  deleteAfterRun: false,
  consecutiveFailures: 0,
  runCount: 0,
  createdBy: task.createdBy ?? 'remote-device',
  created: task.updatedAt ?? new Date(0).toISOString(),
  updated: task.updatedAt ?? new Date(0).toISOString(),
  state: task.state,
  executionNodeId: task.executionNodeId,
  executionNodeLabel: task.executionNodeLabel,
  originNodeId: task.originNodeId,
});

/** Desktop implementation of Core's bounded scheduled-task client. */
export const createDesktopScheduledTaskClient = (): ScheduledTaskClient => {
  const targetByTaskId = new Map<string, string>();
  const ambiguousTaskIds = new Set<string>();
  const staleTaskIds = new Set<string>();
  const remoteClients = new Map<string, ScheduledTaskClient>();
  let configurationSignature: string | undefined;
  let configurationGeneration = 0;

  const remember = (task: ScheduledTask): ScheduledTask => {
    const previous = targetByTaskId.get(task.id);
    if (previous && previous !== task.executionNodeId) ambiguousTaskIds.add(task.id);
    else targetByTaskId.set(task.id, task.executionNodeId);
    return task;
  };

  const reconcileConfiguration = (signature: string): number => {
    if (configurationSignature !== signature) {
      configurationGeneration += 1;
      remoteClients.clear();
      targetByTaskId.clear();
      ambiguousTaskIds.clear();
      staleTaskIds.clear();
    }
    configurationSignature = signature;
    return configurationGeneration;
  };

  const localIdentity = () => window.service.deviceNetwork.getLocalIdentity();

  const remoteClient = async (targetNodeId: string): Promise<ScheduledTaskClient> => {
    const identity = await localIdentity();
    if (targetNodeId === identity.peerId) throw new Error('scheduled_task_remote_target_is_local');
    const key = `${identity.peerId}\0${targetNodeId}`;
    const cached = remoteClients.get(key);
    if (cached) return cached;
    const rpc = createAgentDeviceRpcClient({
      peerId: targetNodeId,
      sendRpc: (peerId, method, parameters, options) => sendRemoteRpc(peerId, method, parameters, options?.signal),
    });
    const client = createScheduledTaskClientFromRpc({
      rpc: rpc.scheduledTasks,
      executionNodeId: targetNodeId,
      originNodeId: identity.peerId,
    });
    remoteClients.set(key, client);
    return client;
  };

  const runOnTarget = async <T>(
    targetNodeId: string,
    signal: AbortSignal | undefined,
    local: () => Promise<T>,
    remote: (client: ScheduledTaskClient) => Promise<T>,
  ): Promise<T> => {
    signal?.throwIfAborted();
    const identity = await localIdentity();
    signal?.throwIfAborted();
    const result = targetNodeId === identity.peerId ? await local() : await remote(await remoteClient(targetNodeId));
    signal?.throwIfAborted();
    return result;
  };

  return {
    async listScheduledTasksForAgent(
      agentInstanceId: string,
      options: ListScheduledTasksOptions = {},
    ): Promise<ScheduledTaskPage> {
      options.signal?.throwIfAborted();
      const limit = normalizedPageSize(options.limit);
      const maxBytes = normalizedPageBytes(options.maxBytes);
      const states = normalizedStates(options.states);
      const executionNodeIds = normalizedExecutionNodeIds(options.executionNodeIds);
      const [identity, devices] = await Promise.all([
        localIdentity(),
        window.service.deviceNetwork.listDevices(),
      ]);
      options.signal?.throwIfAborted();
      const directory = buildTargets(identity.peerId, devices, executionNodeIds);
      const capped = directory.length > MAX_DIRECTORY_SOURCES;
      const targets = directory.slice(0, MAX_DIRECTORY_SOURCES);
      const directorySignature = targetSignature(identity.peerId, targets);
      const requestGeneration = reconcileConfiguration(directorySignature);
      const assertCurrent = () => {
        if (requestGeneration !== configurationGeneration) {
          throw new Error('scheduled_task_configuration_changed');
        }
      };
      const decoded = options.cursor
        ? decodeAggregateCursor(options.cursor, {
          agentInstanceId,
          states,
          executionNodeIds,
          directorySignature,
          targetCount: targets.length,
        })
        : undefined;
      const targetOffset = decoded?.targetOffset ?? 0;
      const maximumSourcesForBudget = Math.max(1, Math.floor(maxBytes / MIN_PAGE_BYTES));
      const batch = targets.slice(targetOffset, targetOffset + Math.min(MAX_SOURCE_BATCH, maximumSourcesForBudget));
      const sourceCursors = decoded?.sources.length
        ? validateSourceCursors(decoded.sources, batch)
        : batch.map(target => ({
          executionNodeId: target.executionNodeId,
          path: target.path,
          done: false,
        } satisfies SourceCursor));
      const activeCount = Math.max(1, sourceCursors.filter(source => !source.done).length);
      const sourceLimit = Math.max(1, Math.floor(limit / activeCount));
      const itemBudget = Math.max(MIN_PAGE_BYTES, maxBytes - Math.min(AGGREGATE_OVERHEAD_BYTES, Math.floor(maxBytes / 4)));
      const sourceMaxBytes = Math.max(MIN_PAGE_BYTES, Math.floor(itemBudget / activeCount));
      const reads = await mapWithConcurrency(
        sourceCursors,
        MAX_RPC_CONCURRENCY,
        source =>
          readSourcePage({
            source,
            agentInstanceId,
            states,
            limit: sourceLimit,
            maxBytes: sourceMaxBytes,
            signal: options.signal,
            remoteClient,
            assertCurrent,
          }),
      );
      options.signal?.throwIfAborted();
      assertCurrent();
      const collectedItems = reads.flatMap(read => read.items);
      if (collectedItems.length > limit) throw new Error('scheduled_task_page_limit_exceeded');
      const items = collectedItems.map(remember);
      for (const read of reads) {
        if (read.source.fromCache) {
          for (const task of read.items) staleTaskIds.add(task.id);
        } else {
          for (const task of read.items) staleTaskIds.delete(task.id);
        }
      }
      const batchDone = reads.every(read => read.cursor.done);
      const nextOffset = batchDone ? targetOffset + batch.length : targetOffset;
      const hasAnotherBatch = nextOffset < targets.length;
      const hasMoreAfter = !batchDone || hasAnotherBatch;
      const nextCursor = hasMoreAfter
        ? encodeAggregateCursor({
          version: 1,
          agentInstanceId,
          states,
          ...(executionNodeIds ? { executionNodeIds } : {}),
          directorySignature,
          targetOffset: nextOffset,
          sources: batchDone ? [] : reads.map(read => read.cursor),
        })
        : undefined;
      const result = {
        items,
        ...(nextCursor ? { nextCursor } : {}),
        hasMoreAfter,
        partial: capped || reads.some(read => read.partial),
        sources: reads.map(read => read.source),
      };
      if (new TextEncoder().encode(JSON.stringify(result)).byteLength > maxBytes) {
        throw new Error('scheduled_task_page_exceeds_byte_budget');
      }
      return result;
    },

    async createScheduledTask(input: CreateScheduledTaskInput, options = {}) {
      const task = await runOnTarget<ScheduledTask>(
        input.executionNodeId,
        options.signal,
        async () => toScheduledTask(await window.service.agentInstance.createScheduledTask(input)),
        client => client.createScheduledTask(input, options),
      );
      const identity = await localIdentity();
      options.signal?.throwIfAborted();
      if (input.executionNodeId !== identity.peerId) {
        await bestEffortProjectionWrite(
          input.executionNodeId,
          'create',
          () => window.service.agentInstance.upsertRemoteScheduledTaskProjection(toDesktopScheduledTask(task), Date.now()),
        );
      }
      options.signal?.throwIfAborted();
      return remember(task);
    },

    async updateScheduledTask(id, input, options = {}) {
      if (ambiguousTaskIds.has(id)) throw new Error('scheduled_task_id_ambiguous');
      if (staleTaskIds.has(id)) throw new Error('scheduled_task_remote_snapshot_offline');
      const identity = await localIdentity();
      options.signal?.throwIfAborted();
      const target = targetByTaskId.get(id) ?? identity.peerId;
      if (input.executionNodeId !== undefined && input.executionNodeId !== target) {
        throw new Error('scheduled_task_execution_transfer_unsupported');
      }
      const task = await runOnTarget<ScheduledTask>(
        target,
        options.signal,
        async () => toScheduledTask(await window.service.agentInstance.updateScheduledTask({ id, ...input })),
        client => client.updateScheduledTask(id, input, options),
      );
      if (target !== identity.peerId) {
        await bestEffortProjectionWrite(
          target,
          'update',
          () => window.service.agentInstance.upsertRemoteScheduledTaskProjection(toDesktopScheduledTask(task), Date.now()),
        );
      }
      options.signal?.throwIfAborted();
      return remember(task);
    },

    async deleteScheduledTask(id, options = {}) {
      if (ambiguousTaskIds.has(id)) throw new Error('scheduled_task_id_ambiguous');
      if (staleTaskIds.has(id)) throw new Error('scheduled_task_remote_snapshot_offline');
      const identity = await localIdentity();
      options.signal?.throwIfAborted();
      const target = targetByTaskId.get(id) ?? identity.peerId;
      await runOnTarget(
        target,
        options.signal,
        () => window.service.agentInstance.deleteScheduledTask(id),
        client => client.deleteScheduledTask(id, options),
      );
      if (target !== identity.peerId) {
        await bestEffortProjectionWrite(
          target,
          'delete',
          () => window.service.agentInstance.deleteRemoteScheduledTaskProjection(id, target),
        );
      }
      options.signal?.throwIfAborted();
      targetByTaskId.delete(id);
      ambiguousTaskIds.delete(id);
      staleTaskIds.delete(id);
    },

    async getCronPreviewDates(expression, timezone, count, options = {}) {
      options.signal?.throwIfAborted();
      const dates = await window.service.agentInstance.getCronPreviewDates(expression, timezone, count);
      options.signal?.throwIfAborted();
      return dates;
    },
  };
};

async function readSourcePage(input: {
  source: SourceCursor;
  agentInstanceId: string;
  states: ScheduledTaskState[];
  limit: number;
  maxBytes: number;
  signal?: AbortSignal;
  remoteClient: (targetNodeId: string) => Promise<ScheduledTaskClient>;
  assertCurrent: () => void;
}): Promise<SourceReadResult> {
  const { source, signal } = input;
  signal?.throwIfAborted();
  input.assertCurrent();
  if (source.done) {
    return {
      cursor: source,
      items: [],
      source: provenance(source.executionNodeId, source.path === 'cache' ? 'offline' : 'online', source.path === 'cache'),
      partial: source.path === 'cache',
    };
  }
  if (source.path === 'local') {
    const page = await window.service.agentInstance.listScheduledTasksPageForAgent({
      agentInstanceId: input.agentInstanceId,
      executionNodeId: source.executionNodeId,
      states: input.states,
      limit: input.limit,
      ...(source.localAfter ? { after: source.localAfter } : {}),
      ...(source.revision ? { expectedRevision: source.revision } : {}),
    });
    signal?.throwIfAborted();
    input.assertCurrent();
    assertSourceItems(page.items, {
      agentInstanceId: input.agentInstanceId,
      executionNodeId: source.executionNodeId,
      states: input.states,
      limit: input.limit,
    });
    return {
      items: page.items.map(toScheduledTask),
      cursor: {
        executionNodeId: source.executionNodeId,
        path: 'local',
        done: page.next === undefined,
        ...(page.next ? { localAfter: page.next } : {}),
        revision: page.revision,
      },
      source: provenance(source.executionNodeId, 'online', false),
      partial: false,
    };
  }
  if (source.path === 'live') {
    let page: ScheduledTaskPage;
    try {
      page = await (await input.remoteClient(source.executionNodeId)).listScheduledTasksForAgent(
        input.agentInstanceId,
        {
          states: input.states,
          executionNodeIds: [source.executionNodeId],
          limit: input.limit,
          maxBytes: input.maxBytes,
          ...(source.cursor ? { cursor: source.cursor } : {}),
          signal,
        },
      );
      signal?.throwIfAborted();
      input.assertCurrent();
    } catch {
      signal?.throwIfAborted();
      // A live continuation and the cached projection have unrelated cursors.
      // Do not restart cache from its head and duplicate earlier live rows.
      if (source.cursor) {
        return {
          items: [],
          cursor: { ...source, done: true },
          source: provenance(source.executionNodeId, 'offline', false),
          partial: true,
        };
      }
      return readCachedSourcePage({ ...input, source: { ...source, path: 'cache', cursor: undefined } }, true);
    }
    try {
      input.assertCurrent();
      if (!source.cursor && !page.hasMoreAfter && !page.partial) {
        await window.service.agentInstance.replaceRemoteScheduledTaskProjections(
          input.agentInstanceId,
          source.executionNodeId,
          page.items.map(toDesktopScheduledTask),
          Date.now(),
        );
      } else {
        await mapWithConcurrency(
          page.items,
          MAX_RPC_CONCURRENCY,
          task => window.service.agentInstance.upsertRemoteScheduledTaskProjection(toDesktopScheduledTask(task), Date.now()),
        );
      }
    } catch (error) {
      await logProjectionWriteFailure(source.executionNodeId, 'list', error);
    }
    signal?.throwIfAborted();
    return {
      items: page.items,
      cursor: {
        executionNodeId: source.executionNodeId,
        path: 'live',
        done: !page.hasMoreAfter,
        ...(page.nextCursor ? { cursor: page.nextCursor } : {}),
      },
      source: provenance(source.executionNodeId, page.partial ? 'degraded' : 'online', false),
      partial: page.partial,
    };
  }
  return readCachedSourcePage(input, false);
}

async function readCachedSourcePage(
  input: Parameters<typeof readSourcePage>[0],
  liveFailed: boolean,
): Promise<SourceReadResult> {
  const page = await window.service.agentInstance.listRemoteScheduledTaskProjectionPageForAgent({
    agentInstanceId: input.agentInstanceId,
    states: input.states,
    executionNodeIds: [input.source.executionNodeId],
    limit: input.limit,
    ...(input.source.cacheAfter ? { after: input.source.cacheAfter } : {}),
    ...(input.source.revision ? { expectedRevision: input.source.revision } : {}),
  });
  input.signal?.throwIfAborted();
  input.assertCurrent();
  const items = page.items.map(projection => toScheduledTask(projection.task));
  assertSourceItems(items, {
    agentInstanceId: input.agentInstanceId,
    executionNodeId: input.source.executionNodeId,
    states: input.states,
    limit: input.limit,
  });
  return {
    items,
    cursor: {
      executionNodeId: input.source.executionNodeId,
      path: 'cache',
      done: page.next === undefined,
      ...(page.next ? { cacheAfter: page.next } : {}),
      revision: page.revision,
    },
    source: provenance(
      input.source.executionNodeId,
      liveFailed && items.length > 0 ? 'degraded' : 'offline',
      items.length > 0,
    ),
    partial: true,
  };
}

async function sendRemoteRpc<T>(
  peerId: string,
  method: string,
  parameters: unknown,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted();
  const operationId = crypto.randomUUID();
  const abort = () => {
    void window.service.deviceNetwork.abortOperation(operationId);
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const value = await window.service.deviceNetwork.sendRpc<T>(peerId, method, parameters, { operationId });
    signal?.throwIfAborted();
    return value;
  } finally {
    signal?.removeEventListener('abort', abort);
    await window.service.deviceNetwork.finishOperation(operationId).catch(() => undefined);
  }
}

async function bestEffortProjectionWrite(
  executionNodeId: string,
  operation: 'create' | 'update' | 'delete',
  write: () => Promise<void>,
): Promise<void> {
  try {
    await write();
  } catch (error) {
    await logProjectionWriteFailure(executionNodeId, operation, error);
  }
}

async function logProjectionWriteFailure(
  executionNodeId: string,
  operation: 'list' | 'create' | 'update' | 'delete',
  error: unknown,
): Promise<void> {
  await window.service.native.log('warn', 'Failed to update remote schedule projection cache', {
    error,
    executionNodeId,
    function: 'DesktopScheduledTaskClient',
    operation,
  }).catch(() => undefined);
}

function buildTargets(
  localPeerId: string,
  devices: readonly Device[],
  requestedNodeIds: readonly string[] | undefined,
): Target[] {
  const requested = requestedNodeIds ? new Set(requestedNodeIds) : undefined;
  const targets: Target[] = [];
  if (!requested || requested.has(localPeerId)) {
    targets.push({ executionNodeId: localPeerId, path: 'local' });
  }
  const seen = new Set(targets.map(target => target.executionNodeId));
  for (const device of [...devices].sort((left, right) => left.peerId.localeCompare(right.peerId))) {
    if (!device.trusted || seen.has(device.peerId) || (requested && !requested.has(device.peerId))) continue;
    seen.add(device.peerId);
    targets.push({
      executionNodeId: device.peerId,
      path: device.trusted && device.reachability.state !== 'offline' ? 'live' : 'cache',
    });
  }
  if (requested) {
    for (const nodeId of requested) {
      if (!seen.has(nodeId)) targets.push({ executionNodeId: nodeId, path: 'cache' });
    }
  }
  return targets;
}

function normalizedPageSize(value: number | undefined): number {
  const limit = value ?? DEFAULT_PAGE_SIZE;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new Error('scheduled_task_invalid_page_limit');
  }
  return limit;
}

function normalizedPageBytes(value: number | undefined): number {
  const maxBytes = value ?? DEFAULT_PAGE_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < MIN_PAGE_BYTES || maxBytes > MAX_PAGE_BYTES) {
    throw new Error('scheduled_task_invalid_byte_budget');
  }
  return maxBytes;
}

function normalizedStates(states: readonly ScheduledTaskState[] | undefined): ScheduledTaskState[] {
  const normalized: ScheduledTaskState[] = states?.length ? [...states] : ['active', 'paused'];
  normalized.sort();
  const allowed = new Set<ScheduledTaskState>(['active', 'paused', 'completed', 'cancelled', 'archived']);
  if (
    normalized.length > allowed.size ||
    new Set(normalized).size !== normalized.length ||
    normalized.some(state => !allowed.has(state))
  ) {
    throw new Error('scheduled_task_invalid_states');
  }
  return normalized;
}

function assertSourceItems(
  items: readonly ScheduledTask[],
  expected: {
    agentInstanceId: string;
    executionNodeId: string;
    states: readonly ScheduledTaskState[];
    limit: number;
  },
): void {
  if (items.length > expected.limit) throw new Error('scheduled_task_page_limit_exceeded');
  const ids = new Set<string>();
  for (const task of items) {
    if (
      task.agentInstanceId !== expected.agentInstanceId ||
      task.executionNodeId !== expected.executionNodeId ||
      !expected.states.includes(task.state) ||
      ids.has(task.id)
    ) throw new Error('scheduled_task_page_scope_mismatch');
    ids.add(task.id);
  }
}

function normalizedExecutionNodeIds(nodeIds: readonly string[] | undefined): string[] | undefined {
  if (nodeIds === undefined) return undefined;
  const normalized = [...nodeIds].sort();
  if (
    normalized.length < 1 ||
    normalized.length > MAX_DIRECTORY_SOURCES ||
    new Set(normalized).size !== normalized.length ||
    normalized.some(nodeId => !nodeId || nodeId.length > 512)
  ) throw new Error('scheduled_task_invalid_execution_nodes');
  return normalized;
}

function targetSignature(localPeerId: string, targets: readonly Target[]): string {
  const input = [localPeerId, ...targets.map(target => `${target.executionNodeId}:${target.path}`)].join('\n');
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
  }
  return `v1-${targets.length}-${first.toString(16)}-${second.toString(16)}`;
}

function provenance(
  executionNodeId: string,
  state: ScheduledTaskPageSource['state'],
  fromCache: boolean,
): ScheduledTaskPageSource {
  return { executionNodeId, state, fromCache };
}

function encodeAggregateCursor(cursor: AggregateCursor): string {
  const bytes = new TextEncoder().encode(JSON.stringify(cursor));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
  if (encoded.length > MAX_CURSOR_CHARACTERS) throw new Error('scheduled_task_cursor_too_large');
  return encoded;
}

function decodeAggregateCursor(
  value: string,
  expected: {
    agentInstanceId: string;
    states: ScheduledTaskState[];
    executionNodeIds?: string[];
    directorySignature: string;
    targetCount: number;
  },
): AggregateCursor {
  if (value.length < 1 || value.length > MAX_CURSOR_CHARACTERS || !BASE64URL_PATTERN.test(value)) {
    throw new Error('scheduled_task_invalid_cursor');
  }
  let parsed: unknown;
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Error('scheduled_task_invalid_cursor');
  }
  if (!isAggregateCursor(parsed)) throw new Error('scheduled_task_invalid_cursor');
  if (
    parsed.agentInstanceId !== expected.agentInstanceId ||
    parsed.directorySignature !== expected.directorySignature ||
    !sameStrings(parsed.states, expected.states) ||
    !sameStrings(parsed.executionNodeIds, expected.executionNodeIds) ||
    parsed.targetOffset > expected.targetCount
  ) throw new Error('scheduled_task_cursor_stale');
  return parsed;
}

function isAggregateCursor(value: unknown): value is AggregateCursor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const cursor = value as Record<string, unknown>;
  if (Object.keys(cursor).some(key => !['version', 'agentInstanceId', 'states', 'executionNodeIds', 'directorySignature', 'targetOffset', 'sources'].includes(key))) return false;
  return cursor.version === 1 &&
    typeof cursor.agentInstanceId === 'string' && cursor.agentInstanceId.length > 0 && cursor.agentInstanceId.length <= 512 &&
    Array.isArray(cursor.states) && cursor.states.every(state => typeof state === 'string') &&
    (cursor.executionNodeIds === undefined || (Array.isArray(cursor.executionNodeIds) && cursor.executionNodeIds.every(nodeId => typeof nodeId === 'string'))) &&
    typeof cursor.directorySignature === 'string' && cursor.directorySignature.length <= 16_000 &&
    Number.isSafeInteger(cursor.targetOffset) && (cursor.targetOffset as number) >= 0 &&
    Array.isArray(cursor.sources) && cursor.sources.length <= MAX_SOURCE_BATCH && cursor.sources.every(isSourceCursor);
}

function isSourceCursor(value: unknown): value is SourceCursor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const cursor = value as Record<string, unknown>;
  if (Object.keys(cursor).some(key => !['executionNodeId', 'path', 'done', 'cursor', 'localAfter', 'cacheAfter', 'revision'].includes(key))) return false;
  return typeof cursor.executionNodeId === 'string' && cursor.executionNodeId.length > 0 && cursor.executionNodeId.length <= 512 &&
    ['local', 'live', 'cache'].includes(cursor.path as string) &&
    typeof cursor.done === 'boolean' &&
    (cursor.cursor === undefined || (typeof cursor.cursor === 'string' && cursor.cursor.length <= 4096)) &&
    (cursor.revision === undefined || (typeof cursor.revision === 'string' && cursor.revision.length <= 512)) &&
    validLocalAfter(cursor.localAfter) && validCacheAfter(cursor.cacheAfter);
}

function validLocalAfter(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).every(key => ['updatedAt', 'id'].includes(key)) &&
    typeof record.updatedAt === 'string' && Number.isFinite(new Date(record.updatedAt).getTime()) &&
    typeof record.id === 'string' && record.id.length > 0 && record.id.length <= 512;
}

function validCacheAfter(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).every(key => ['observedAt', 'id'].includes(key)) &&
    Number.isSafeInteger(record.observedAt) && (record.observedAt as number) >= 0 &&
    typeof record.id === 'string' && record.id.length > 0 && record.id.length <= 512;
}

function validateSourceCursors(sources: SourceCursor[], targets: Target[]): SourceCursor[] {
  if (sources.length !== targets.length) throw new Error('scheduled_task_cursor_stale');
  for (let index = 0; index < targets.length; index += 1) {
    const source = sources[index];
    const target = targets[index];
    if (!source || !target || source.executionNodeId !== target.executionNodeId) {
      throw new Error('scheduled_task_cursor_stale');
    }
    if (source.path === 'live' && target.path !== 'live') throw new Error('scheduled_task_cursor_stale');
    if (source.path === 'local' && target.path !== 'local') throw new Error('scheduled_task_cursor_stale');
  }
  return sources;
}

function sameStrings(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function mapWithConcurrency<Input, Output>(
  inputs: readonly Input[],
  concurrency: number,
  mapper: (input: Input) => Promise<Output>,
): Promise<Output[]> {
  const output = new Array<Output>(inputs.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, inputs.length) }, async () => {
    while (index < inputs.length) {
      const current = index;
      index += 1;
      output[current] = await mapper(inputs[current]);
    }
  });
  await Promise.all(workers);
  return output;
}
