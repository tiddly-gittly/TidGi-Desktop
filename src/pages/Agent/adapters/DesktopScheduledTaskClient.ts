/**
 * Bounded Desktop binding for Core's scheduled-task client.
 *
 * One page considers at most eight devices with a fixed RPC concurrency. A
 * host cursor retains each device's independent keyset cursor; no call walks a
 * second page or materializes the complete task set. Offline sources remain
 * explicit; durable cache storage never crosses renderer IPC as a second DTO.
 */

import type { Device } from '@services/deviceNetwork/interface';
import {
  createScheduledTaskAggregatePageController,
  type CreateScheduledTaskInput,
  type ListScheduledTasksOptions,
  normalizeScheduledTaskAggregateStates,
  type ScheduledTask,
  type ScheduledTaskAggregateCursorSource,
  type ScheduledTaskClient,
  type ScheduledTaskPage,
  type ScheduledTaskPageSource,
  type ScheduledTaskState,
} from 'memeloop';
import { type AgentDeviceRpcSend, createAgentDeviceRpcClient, createScheduledTaskClientFromRpc } from 'memeloop/device-network';

import { createSecureBrowserUuid } from './createSecureBrowserUuid';

const DEFAULT_PAGE_SIZE = 64;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_BYTES = 256 * 1024;
const MAX_PAGE_BYTES = 256 * 1024;
const MIN_PAGE_BYTES = 64;
const AGGREGATE_OVERHEAD_BYTES = 16 * 1024;
const MAX_SOURCE_BATCH = 8;
const MAX_DIRECTORY_SOURCES = 64;
const MAX_RPC_CONCURRENCY = 4;

type SourcePath = 'local' | 'live' | 'offline';

interface Target {
  executionNodeId: string;
  path: SourcePath;
}

interface SourceReadResult {
  cursor: ScheduledTaskAggregateCursorSource;
  items: ScheduledTask[];
  source: ScheduledTaskPageSource;
  partial: boolean;
}

/** Desktop implementation of Core's bounded scheduled-task client. */
export const createDesktopScheduledTaskClient = (): ScheduledTaskClient => {
  const targetByTaskId = new Map<string, string>();
  const ambiguousTaskIds = new Set<string>();
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
    const sendRpc: AgentDeviceRpcSend = (peerId, method, parameters, options) => sendRemoteRpc(peerId, method, parameters, options?.signal);
    const rpc = createAgentDeviceRpcClient({
      peerId: targetNodeId,
      sendRpc,
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
      const states = normalizeScheduledTaskAggregateStates(options.states);
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
      const pageController = createScheduledTaskAggregatePageController({
        agentInstanceId,
        scope: directorySignature,
        states,
        sourceCount: targets.length,
      });
      const assertCurrent = () => {
        if (requestGeneration !== configurationGeneration) {
          throw new Error('scheduled_task_configuration_changed');
        }
      };
      const decoded = options.cursor === undefined ? undefined : pageController.decode(options.cursor);
      const targetOffset = decoded?.sourceIndex ?? 0;
      const maximumSourcesForBudget = Math.max(1, Math.floor(maxBytes / MIN_PAGE_BYTES));
      const batch = targets.slice(targetOffset, targetOffset + Math.min(MAX_SOURCE_BATCH, maximumSourcesForBudget));
      const sourceCursors = decoded?.sources.length
        ? validateSourceCursors(decoded.sources, batch)
        : batch.map(target => ({ executionNodeId: target.executionNodeId, done: false } satisfies ScheduledTaskAggregateCursorSource));
      const activeCount = Math.max(1, sourceCursors.filter(source => !source.done).length);
      const sourceLimit = Math.max(1, Math.floor(limit / activeCount));
      const itemBudget = Math.max(MIN_PAGE_BYTES, maxBytes - Math.min(AGGREGATE_OVERHEAD_BYTES, Math.floor(maxBytes / 4)));
      const sourceMaxBytes = Math.max(MIN_PAGE_BYTES, Math.floor(itemBudget / activeCount));
      const reads = await mapWithConcurrency(
        sourceCursors,
        MAX_RPC_CONCURRENCY,
        source => {
          const target = batch.find(candidate => candidate.executionNodeId === source.executionNodeId);
          if (!target) throw new Error('scheduled_task_cursor_stale');
          return readSourcePage({
            source,
            target,
            agentInstanceId,
            states,
            limit: sourceLimit,
            maxBytes: sourceMaxBytes,
            signal: options.signal,
            remoteClient,
            assertCurrent,
          });
        },
      );
      options.signal?.throwIfAborted();
      assertCurrent();
      const collectedItems = reads.flatMap(read => read.items);
      if (collectedItems.length > limit) throw new Error('scheduled_task_page_limit_exceeded');
      const items = collectedItems.map(remember);
      const batchDone = reads.every(read => read.cursor.done);
      const nextOffset = batchDone ? targetOffset + batch.length : targetOffset;
      const hasAnotherBatch = nextOffset < targets.length;
      const hasMoreAfter = !batchDone || hasAnotherBatch;
      const nextCursor = hasMoreAfter
        ? pageController.encodePage({
          sourceIndex: nextOffset,
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
        () => window.service.agentInstance.createScheduledTask(input),
        client => client.createScheduledTask(input, options),
      );
      options.signal?.throwIfAborted();
      return remember(task);
    },

    async updateScheduledTask(id, input, options = {}) {
      if (ambiguousTaskIds.has(id)) throw new Error('scheduled_task_id_ambiguous');
      const identity = await localIdentity();
      options.signal?.throwIfAborted();
      const target = targetByTaskId.get(id) ?? identity.peerId;
      if (input.executionNodeId !== undefined && input.executionNodeId !== target) {
        throw new Error('scheduled_task_execution_transfer_unsupported');
      }
      const task = await runOnTarget<ScheduledTask>(
        target,
        options.signal,
        () => window.service.agentInstance.updateScheduledTask(id, input),
        client => client.updateScheduledTask(id, input, options),
      );
      options.signal?.throwIfAborted();
      return remember(task);
    },

    async deleteScheduledTask(id, options = {}) {
      if (ambiguousTaskIds.has(id)) throw new Error('scheduled_task_id_ambiguous');
      const identity = await localIdentity();
      options.signal?.throwIfAborted();
      const target = targetByTaskId.get(id) ?? identity.peerId;
      await runOnTarget(
        target,
        options.signal,
        () => window.service.agentInstance.deleteScheduledTask(id),
        client => client.deleteScheduledTask(id, options),
      );
      options.signal?.throwIfAborted();
      targetByTaskId.delete(id);
      ambiguousTaskIds.delete(id);
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
  source: ScheduledTaskAggregateCursorSource;
  target: Target;
  agentInstanceId: string;
  states: ScheduledTaskState[];
  limit: number;
  maxBytes: number;
  signal?: AbortSignal;
  remoteClient: (targetNodeId: string) => Promise<ScheduledTaskClient>;
  assertCurrent: () => void;
}): Promise<SourceReadResult> {
  const { source, signal } = input;
  const { target } = input;
  signal?.throwIfAborted();
  input.assertCurrent();
  if (source.done) {
    return {
      cursor: source,
      items: [],
      source: provenance(source.executionNodeId, target.path === 'offline' ? 'offline' : 'online', false),
      partial: target.path === 'offline',
    };
  }
  if (target.path === 'local') {
    const page = await window.service.agentInstance.listScheduledTasksForAgent(input.agentInstanceId, {
      states: input.states,
      executionNodeIds: [source.executionNodeId],
      ...(source.cursor ? { cursor: source.cursor } : {}),
      limit: input.limit,
      maxBytes: input.maxBytes,
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
      items: page.items,
      cursor: {
        executionNodeId: source.executionNodeId,
        done: !page.hasMoreAfter,
        ...(page.nextCursor ? { cursor: page.nextCursor } : {}),
      },
      source: requirePageSource(page, source.executionNodeId),
      partial: page.partial,
    };
  }
  if (target.path === 'offline') {
    return {
      items: [],
      cursor: { ...source, done: true },
      source: provenance(source.executionNodeId, 'offline', false),
      partial: true,
    };
  }
  if (target.path === 'live') {
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
      return {
        items: [],
        cursor: { ...source, done: true },
        source: provenance(source.executionNodeId, 'offline', false),
        partial: true,
      };
    }
    signal?.throwIfAborted();
    assertSourceItems(page.items, {
      agentInstanceId: input.agentInstanceId,
      executionNodeId: source.executionNodeId,
      states: input.states,
      limit: input.limit,
    });
    return {
      items: page.items,
      cursor: {
        executionNodeId: source.executionNodeId,
        done: !page.hasMoreAfter,
        ...(page.nextCursor ? { cursor: page.nextCursor } : {}),
      },
      source: requirePageSource(page, source.executionNodeId),
      partial: page.partial,
    };
  }
  throw new Error('scheduled_task_invalid_source_path');
}

async function sendRemoteRpc<T>(
  peerId: string,
  method: string,
  parameters: unknown,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted();
  const operationId = createSecureBrowserUuid();
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
      path: device.reachability.state !== 'offline' ? 'live' : 'offline',
    });
  }
  if (requested) {
    for (const nodeId of requested) {
      if (!seen.has(nodeId)) targets.push({ executionNodeId: nodeId, path: 'offline' });
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

function requirePageSource(page: ScheduledTaskPage, executionNodeId: string): ScheduledTaskPageSource {
  if (
    page.sources.length !== 1 ||
    page.sources[0]?.executionNodeId !== executionNodeId
  ) throw new Error('scheduled_task_page_source_mismatch');
  return page.sources[0];
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

function validateSourceCursors(
  sources: readonly ScheduledTaskAggregateCursorSource[],
  targets: readonly Target[],
): ScheduledTaskAggregateCursorSource[] {
  if (sources.length !== targets.length) throw new Error('scheduled_task_cursor_stale');
  for (let index = 0; index < targets.length; index += 1) {
    const source = sources[index];
    const target = targets[index];
    if (!source || !target || source.executionNodeId !== target.executionNodeId) {
      throw new Error('scheduled_task_cursor_stale');
    }
  }
  return [...sources];
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
