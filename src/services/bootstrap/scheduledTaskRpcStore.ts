import type { IAgentInstanceService } from '@services/agentInstance/interface';
import {
  createScheduledTaskAggregatePageController,
  type CreateScheduledTaskInput,
  createScheduledTaskRpcHandler,
  normalizeScheduledTaskAggregateStates,
  type ScheduledAgentTaskStore,
  type ScheduledTask,
  ScheduledTaskAggregateCursorError,
  type ScheduledTaskRpcCreateInput,
  type ScheduledTaskRpcHandlerInput,
  type ScheduledTaskRpcListRequest,
  type ScheduledTaskRpcListResponse,
  type ScheduledTaskRpcScopedTaskRequest,
  type ScheduledTaskRpcStoreContext,
  type ScheduledTaskRpcUpdateRequest,
} from 'memeloop';

const MAX_LIST_BYTES = 256 * 1024;

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
      const states = normalizeScheduledTaskAggregateStates(request.states);
      const pageController = createScheduledTaskAggregatePageController({
        agentInstanceId: request.agentInstanceId,
        scope: request.executionNodeId,
        states,
        sourceCount: 1,
      });
      const cursor = request.cursor ? pageController.decode(request.cursor) : undefined;
      const source = cursor?.sources[0];
      if (
        cursor !== undefined &&
        (cursor.sourceIndex !== 0 || source === undefined || source.done ||
          source.executionNodeId !== request.executionNodeId || source.cursor === undefined)
      ) throw new ScheduledTaskAggregateCursorError();
      const limit = request.limit ?? 100;
      if (!Number.isSafeInteger(request.maxBytes) || request.maxBytes < 64 || request.maxBytes > MAX_LIST_BYTES) {
        throw new Error('scheduled_task_invalid_byte_budget');
      }
      const page = await agentInstanceService.listScheduledTasksForAgent(request.agentInstanceId, {
        states,
        executionNodeIds: [request.executionNodeId],
        limit,
        maxBytes: request.maxBytes,
        ...(source?.cursor === undefined ? {} : { cursor: source.cursor }),
        signal: context.signal,
      });
      context.signal?.throwIfAborted();
      const nextCursor = page.nextCursor === undefined
        ? undefined
        : pageController.encodePage({
          sourceIndex: 0,
          sources: [{ executionNodeId: request.executionNodeId, done: false, cursor: page.nextCursor }],
        });
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
