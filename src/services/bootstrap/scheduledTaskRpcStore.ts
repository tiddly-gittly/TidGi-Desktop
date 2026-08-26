import type { IAgentInstanceService } from '@services/agentInstance/interface';
import type { ScheduledTask as DesktopScheduledTask } from '@services/agentInstance/tools/scheduledTaskTypes';
import {
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
const MAX_STORAGE_SCAN_ROWS = 4;
const MAX_CURSOR_CHARACTERS = 2_048;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

interface ScheduleCursor {
  version: 2;
  agentInstanceId: string;
  executionNodeId: string;
  states: string[];
  revision: string;
  after: {
    updatedAt: string;
    id: string;
  };
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
  ): Promise<DesktopScheduledTask | undefined> => {
    context.signal?.throwIfAborted();
    const task = await agentInstanceService.getScheduledTaskByScope({
      taskId: request.taskId,
      agentInstanceId: request.agentInstanceId,
      agentDefinitionId: request.agentDefinitionId,
      executionNodeId: request.executionNodeId,
    }, { signal: context.signal });
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
      const page = await agentInstanceService.listScheduledTasksPageForAgent({
        agentInstanceId: request.agentInstanceId,
        executionNodeId: request.executionNodeId,
        states,
        // A task payload can approach 32 KiB. Never materialize an entire
        // 100-row page before applying the transport byte budget.
        limit: Math.min(limit, MAX_STORAGE_SCAN_ROWS),
        after: cursor?.after,
        expectedRevision: cursor?.revision,
        signal: context.signal,
      });
      context.signal?.throwIfAborted();
      const mapped = page.items.map(toRpcScheduledTask);
      const items: ScheduledTask[] = [];
      let nextCursor: string | undefined;
      for (let index = 0; index < mapped.length; index += 1) {
        const source = page.items[index];
        if (!source) throw new Error('scheduled_task_page_projection_mismatch');
        const candidateItems = [...items, mapped[index]];
        const hasMoreAfter = index + 1 < mapped.length || page.next !== undefined;
        const candidateCursor = hasMoreAfter
          ? encodeCursor(request, states, page.revision, { updatedAt: source.updated, id: source.id })
          : undefined;
        const candidate = {
          items: candidateItems,
          ...(candidateCursor ? { nextCursor: candidateCursor } : {}),
          hasMoreAfter,
        } satisfies ScheduledTaskRpcListResponse;
        if (Buffer.byteLength(JSON.stringify(candidate), 'utf8') > request.maxBytes) break;
        items.push(mapped[index]);
        nextCursor = candidateCursor;
      }
      if (mapped.length > 0 && items.length === 0) throw new Error('scheduled_task_page_item_exceeds_byte_budget');
      const hasMoreAfter = items.length < mapped.length || page.next !== undefined;
      const response = {
        items,
        ...(hasMoreAfter && nextCursor ? { nextCursor } : {}),
        hasMoreAfter,
      } satisfies ScheduledTaskRpcListResponse;
      if (Buffer.byteLength(JSON.stringify(response), 'utf8') > request.maxBytes) {
        throw new Error('scheduled_task_page_exceeds_byte_budget');
      }
      return response;
    },

    async get(request, context): Promise<ScheduledTask | undefined> {
      return toOptionalRpcTask(await findScoped(request, context));
    },

    async create(input: ScheduledTaskRpcCreateInput, context: ScheduledTaskRpcStoreContext): Promise<ScheduledTask> {
      context.signal?.throwIfAborted();
      const task = await agentInstanceService.createScheduledTask({
        agentInstanceId: input.agentInstanceId,
        agentDefinitionId: input.agentDefinitionId,
        name: input.name,
        scheduleKind: input.schedule.kind,
        schedule: input.schedule,
        payload: input.payload,
        activeHoursStart: input.activeHoursStart,
        activeHoursEnd: input.activeHoursEnd,
        createdBy: input.createdBy,
        enabled: input.enabled,
        executionNodeId: context.localPeerId,
        executionNodeLabel: input.executionNodeLabel,
        originNodeId: context.remotePeerId,
      }, { signal: context.signal });
      context.signal?.throwIfAborted();
      return toRpcScheduledTask(task);
    },

    async update(request: ScheduledTaskRpcUpdateRequest, context): Promise<ScheduledTask> {
      const patch = request.patch;
      const task = await agentInstanceService.updateScheduledTaskScoped(
        {
          taskId: request.taskId,
          agentInstanceId: request.agentInstanceId,
          agentDefinitionId: request.agentDefinitionId,
          executionNodeId: request.executionNodeId,
        },
        {
          id: request.taskId,
          name: patch.name,
          scheduleKind: patch.schedule?.kind,
          schedule: patch.schedule,
          payload: patch.payload,
          activeHoursStart: patch.activeHoursStart,
          activeHoursEnd: patch.activeHoursEnd,
          enabled: patch.enabled,
          executionNodeLabel: patch.executionNodeLabel,
        },
        { signal: context.signal },
      );
      context.signal?.throwIfAborted();
      return toRpcScheduledTask(task);
    },

    async delete(request, context): Promise<void> {
      await agentInstanceService.deleteScheduledTaskScoped({
        taskId: request.taskId,
        agentInstanceId: request.agentInstanceId,
        agentDefinitionId: request.agentDefinitionId,
        executionNodeId: request.executionNodeId,
      }, { signal: context.signal });
      context.signal?.throwIfAborted();
    },
  };
}

function toOptionalRpcTask(task: DesktopScheduledTask | undefined): ScheduledTask | undefined {
  return task ? toRpcScheduledTask(task) : undefined;
}

function toRpcScheduledTask(task: DesktopScheduledTask): ScheduledTask {
  return {
    id: task.id,
    agentInstanceId: task.agentInstanceId,
    agentDefinitionId: task.agentDefinitionId,
    name: task.name,
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
  };
}

function normalizeStates(states: ScheduledTaskRpcListRequest['states']): ScheduledTask['state'][] {
  const normalized: ScheduledTask['state'][] = states?.length ? [...states] : ['active'];
  return normalized.sort();
}

function encodeCursor(
  request: ScheduledTaskRpcListRequest,
  states: string[],
  revision: string,
  after: ScheduleCursor['after'],
): string {
  return Buffer.from(JSON.stringify(
    {
      version: 2,
      agentInstanceId: request.agentInstanceId,
      executionNodeId: request.executionNodeId,
      states,
      revision,
      after,
    } satisfies ScheduleCursor,
  )).toString('base64url');
}

function decodeCursor(
  value: string,
  request: ScheduledTaskRpcListRequest,
  states: string[],
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
    Object.keys(cursor).some(key => !['version', 'agentInstanceId', 'executionNodeId', 'states', 'revision', 'after'].includes(key)) ||
    (cursor as ScheduleCursor).version !== 2 ||
    (cursor as ScheduleCursor).agentInstanceId !== request.agentInstanceId ||
    (cursor as ScheduleCursor).executionNodeId !== request.executionNodeId ||
    !Array.isArray((cursor as ScheduleCursor).states) ||
    (cursor as ScheduleCursor).states.length !== states.length ||
    (cursor as ScheduleCursor).states.some((state, index) => state !== states[index]) ||
    typeof (cursor as ScheduleCursor).revision !== 'string' ||
    (cursor as ScheduleCursor).revision.length < 1 ||
    (cursor as ScheduleCursor).revision.length > 512 ||
    !(cursor as ScheduleCursor).after ||
    typeof (cursor as ScheduleCursor).after !== 'object' ||
    Array.isArray((cursor as ScheduleCursor).after) ||
    Object.keys((cursor as ScheduleCursor).after).some(key => !['updatedAt', 'id'].includes(key)) ||
    typeof (cursor as ScheduleCursor).after.updatedAt !== 'string' ||
    !Number.isFinite(new Date((cursor as ScheduleCursor).after.updatedAt).getTime()) ||
    typeof (cursor as ScheduleCursor).after.id !== 'string' ||
    (cursor as ScheduleCursor).after.id.length < 1 ||
    (cursor as ScheduleCursor).after.id.length > 512
  ) throw new Error('scheduled_task_invalid_cursor');
  return cursor as ScheduleCursor;
}
