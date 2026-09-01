import type { IAgentInstanceService } from '@services/agentInstance/interface';
import {
  type CreateScheduledTaskInput,
  createScheduledTaskRpcHandler,
  type ScheduledAgentTaskStore,
  type ScheduledTask,
  type ScheduledTaskRpcCreateInput,
  type ScheduledTaskRpcHandlerInput,
  type ScheduledTaskRpcListRequest,
  type ScheduledTaskRpcListResponse,
  type ScheduledTaskRpcScopedTaskRequest,
  type ScheduledTaskRpcStoreContext,
  type ScheduledTaskRpcUpdateRequest,
} from 'memeloop';

const MAX_LIST_BYTES = 256 * 1024;
const MAX_CURSOR_CHARACTERS = 2_048;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

interface ScheduleCursor {
  version: 3;
  agentInstanceId: string;
  executionNodeId: string;
  states: ScheduledTask['state'][];
  storageCursor: string;
}

/**
 * Main-process binding for Core's strict, scoped schedule RPC contract.
 * All tuple checks happen before writes, and the caller-supplied origin is
 * replaced with the authenticated remote PeerId.
 */
export function createDesktopScheduledTaskRpcHandler(
  agentInstanceService: IAgentInstanceService,
  localPeerId: string,
): (input: ScheduledTaskRpcHandlerInput) => Promise<unknown> {
  return createScheduledTaskRpcHandler({
    localPeerId,
    store: createDesktopScheduledTaskStore(agentInstanceService),
    cronPreviewer: {
      preview: ({ expression, timezone, count }, context) => {
        context.signal?.throwIfAborted();
        return agentInstanceService.getCronPreviewDates(expression, timezone, count);
      },
    },
  });
}

export function createDesktopScheduledTaskStore(
  agentInstanceService: IAgentInstanceService,
): ScheduledAgentTaskStore {
  const findScoped = async (
    request: ScheduledTaskRpcScopedTaskRequest,
    context: ScheduledTaskRpcStoreContext,
  ): Promise<ScheduledTask | undefined> => {
    context.signal?.throwIfAborted();
    const task = await agentInstanceService.getScheduledTaskByScope(request, { signal: context.signal });
    context.signal?.throwIfAborted();
    return task;
  };

  return {
    async list(request: ScheduledTaskRpcListRequest, context): Promise<ScheduledTaskRpcListResponse> {
      context.signal?.throwIfAborted();
      const states = normalizeStates(request.states);
      const cursor = request.cursor ? decodeCursor(request.cursor, request, states) : undefined;
      const limit = request.limit ?? 100;
      if (!Number.isSafeInteger(request.maxBytes) || request.maxBytes < 64 || request.maxBytes > MAX_LIST_BYTES) {
        throw new Error('scheduled_task_invalid_byte_budget');
      }
      const page = await agentInstanceService.listScheduledTasksForAgent(request.agentInstanceId, {
        states,
        executionNodeIds: [request.executionNodeId],
        limit,
        maxBytes: request.maxBytes,
        ...(cursor === undefined ? {} : { cursor: cursor.storageCursor }),
        signal: context.signal,
      });
      context.signal?.throwIfAborted();
      const nextCursor = page.nextCursor === undefined
        ? undefined
        : encodeCursor(request, states, page.nextCursor);
      const response = {
        items: page.items,
        ...(nextCursor === undefined ? {} : { nextCursor }),
        hasMoreAfter: page.hasMoreAfter,
      } satisfies ScheduledTaskRpcListResponse;
      if (Buffer.byteLength(JSON.stringify(response), 'utf8') > request.maxBytes) {
        throw new Error('scheduled_task_page_exceeds_byte_budget');
      }
      return response;
    },

    async get(request, context): Promise<ScheduledTask | undefined> {
      return findScoped(request, context);
    },

    async create(input: ScheduledTaskRpcCreateInput, context: ScheduledTaskRpcStoreContext): Promise<ScheduledTask> {
      context.signal?.throwIfAborted();
      const createInput = {
        ...input,
        scheduleKind: input.schedule.kind,
        executionNodeId: context.localPeerId,
        originNodeId: context.remotePeerId,
      } satisfies CreateScheduledTaskInput;
      const task = await agentInstanceService.createScheduledTask(createInput, { signal: context.signal });
      context.signal?.throwIfAborted();
      return task;
    },

    async update(request: ScheduledTaskRpcUpdateRequest, context): Promise<ScheduledTask> {
      const { patch, ...scope } = request;
      const task = await agentInstanceService.updateScheduledTaskScoped(
        scope,
        patch,
        { signal: context.signal },
      );
      context.signal?.throwIfAborted();
      return task;
    },

    async delete(request, context): Promise<void> {
      await agentInstanceService.deleteScheduledTaskScoped(request, { signal: context.signal });
      context.signal?.throwIfAborted();
    },
  };
}

function normalizeStates(states: ScheduledTaskRpcListRequest['states']): ScheduledTask['state'][] {
  const normalized: ScheduledTask['state'][] = states?.length ? [...states] : ['active', 'paused'];
  return normalized.sort();
}

function encodeCursor(
  request: ScheduledTaskRpcListRequest,
  states: ScheduledTask['state'][],
  storageCursor: string,
): string {
  return Buffer.from(JSON.stringify(
    {
      version: 3,
      agentInstanceId: request.agentInstanceId,
      executionNodeId: request.executionNodeId,
      states,
      storageCursor,
    } satisfies ScheduleCursor,
  )).toString('base64url');
}

function decodeCursor(
  value: string,
  request: ScheduledTaskRpcListRequest,
  states: ScheduledTask['state'][],
): ScheduleCursor {
  if (value.length < 1 || value.length > MAX_CURSOR_CHARACTERS || !BASE64URL_PATTERN.test(value)) {
    throw new Error('scheduled_task_invalid_cursor');
  }
  let cursor: unknown;
  try {
    cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new Error('scheduled_task_invalid_cursor');
  }
  if (
    !cursor ||
    typeof cursor !== 'object' ||
    Array.isArray(cursor) ||
    Object.keys(cursor).some(key => !['version', 'agentInstanceId', 'executionNodeId', 'states', 'storageCursor'].includes(key)) ||
    (cursor as ScheduleCursor).version !== 3 ||
    (cursor as ScheduleCursor).agentInstanceId !== request.agentInstanceId ||
    (cursor as ScheduleCursor).executionNodeId !== request.executionNodeId ||
    !Array.isArray((cursor as ScheduleCursor).states) ||
    (cursor as ScheduleCursor).states.length !== states.length ||
    (cursor as ScheduleCursor).states.some((state, index) => state !== states[index]) ||
    typeof (cursor as ScheduleCursor).storageCursor !== 'string' ||
    (cursor as ScheduleCursor).storageCursor.length < 1 ||
    (cursor as ScheduleCursor).storageCursor.length > MAX_CURSOR_CHARACTERS ||
    !BASE64URL_PATTERN.test((cursor as ScheduleCursor).storageCursor)
  ) throw new Error('scheduled_task_invalid_cursor');
  return cursor as ScheduleCursor;
}
