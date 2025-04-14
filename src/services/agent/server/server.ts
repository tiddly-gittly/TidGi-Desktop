import { EventEmitter } from 'events';
import { A2AError } from './error';
import { TaskContext as OldTaskContext, TaskHandler } from './handler';
import * as schema from './schema';
import { InMemoryTaskStore, TaskAndHistory, TaskStore } from './store';
import { getCurrentTimestamp, isArtifactUpdate, isTaskStatusUpdate } from './utils';

/**
 * Options for configuring the A2AServer.
 */
export interface A2AServerOptions {
  /** Task storage implementation. Defaults to InMemoryTaskStore. */
  taskStore?: TaskStore;
  /** Agent Card for the agent being served. */
  card?: schema.AgentCard;
}

// Define new TaskContext without the store, based on the original from handler.ts
export interface TaskContext extends Omit<OldTaskContext, 'taskStore'> {}

/**
 * Implements an A2A specification compliant server.
 */
export class A2AServer {
  private taskHandler: TaskHandler;
  private taskStore: TaskStore;
  // Track active cancellations
  private activeCancellations: Set<string> = new Set();
  card: schema.AgentCard;

  // Helper to apply updates (status or artifact) immutably
  private applyUpdateToTaskAndHistory(
    current: TaskAndHistory,
    update: Omit<schema.TaskStatus, 'timestamp'> | schema.Artifact,
  ): TaskAndHistory {
    const newTask = { ...current.task }; // Shallow copy task
    const newHistory = [...current.history]; // Shallow copy history

    if (isTaskStatusUpdate(update)) {
      // Merge status update
      newTask.status = {
        ...newTask.status, // Keep existing properties if not overwritten
        ...update, // Apply updates
        timestamp: getCurrentTimestamp(), // Always update timestamp
      };

      // 如果更新包含智能体消息，添加到历史记录
      if (update.message && update.message.role === 'agent') {
        console.log(`[Server] Processing agent message: ${update.message.parts.map(p => 'text' in p ? p.text : '').join('')}`);

        // 检查消息是否已存在，避免重复（基于内容比较）
        const messageContent = update.message.parts.map(p => 'text' in p ? p.text : '').join('');
        const isDuplicate = newHistory.some(message =>
          message.role === 'agent' &&
          message.parts.map(p => 'text' in p ? p.text : '').join('') === messageContent
        );

        // 如果是"完成"状态，并且消息内容包含"You said:"，则替换之前的"Processing"消息
        const isCompletedReply = update.state === 'completed' && messageContent.includes('You said:');
        const processingMessageIndex = newHistory.findIndex(message =>
          message.role === 'agent' &&
          message.parts.some(p => 'text' in p && p.text.includes('Processing your message'))
        );

        if (isCompletedReply && processingMessageIndex >= 0) {
          console.log(`[Server] Replacing processing message with final reply`);
          newHistory[processingMessageIndex] = update.message;
        } else if (!isDuplicate) {
          newHistory.push(update.message);
          console.log(`[Server] Added new message to history`);
        } else {
          console.log(`[Server] Skipping duplicate message`);
        }
      }
    } else if (isArtifactUpdate(update)) {
      // Handle artifact update
      if (!newTask.artifacts) {
        newTask.artifacts = [];
      } else {
        // Ensure we're working with a copy of the artifacts array
        newTask.artifacts = [...newTask.artifacts];
      }

      const existingIndex = update.index ?? -1; // Use index if provided
      let replaced = false;

      if (existingIndex >= 0 && existingIndex < newTask.artifacts.length) {
        const existingArtifact = newTask.artifacts[existingIndex];
        if (update.append) {
          // Create a deep copy for modification to avoid mutating original
          const appendedArtifact = JSON.parse(JSON.stringify(existingArtifact));
          appendedArtifact.parts.push(...update.parts);
          if (update.metadata) {
            appendedArtifact.metadata = {
              ...(appendedArtifact.metadata || {}),
              ...update.metadata,
            };
          }
          if (update.lastChunk !== undefined) {
            appendedArtifact.lastChunk = update.lastChunk;
          }
          if (update.description) {
            appendedArtifact.description = update.description;
          }
          newTask.artifacts[existingIndex] = appendedArtifact; // Replace with appended version
          replaced = true;
        } else {
          // Overwrite artifact at index (with a copy of the update)
          newTask.artifacts[existingIndex] = { ...update };
          replaced = true;
        }
      } else if (update.name) {
        const namedIndex = newTask.artifacts.findIndex(
          (a) => a.name === update.name,
        );
        if (namedIndex >= 0) {
          newTask.artifacts[namedIndex] = { ...update }; // Replace by name (with copy)
          replaced = true;
        }
      }

      if (!replaced) {
        newTask.artifacts.push({ ...update }); // Add as a new artifact (copy)
        // Sort if indices are present
        if (newTask.artifacts.some((a) => a.index !== undefined)) {
          newTask.artifacts.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        }
      }
    }

    return { task: newTask, history: newHistory };
  }

  constructor(handler: TaskHandler, options: A2AServerOptions = {}) {
    this.taskHandler = handler;
    this.taskStore = options.taskStore ?? new InMemoryTaskStore();
    if (options.card) this.card = options.card;
  }

  /**
   * 处理JSON-RPC请求
   */
  async handleRequest(request: schema.JSONRPCRequest): Promise<schema.JSONRPCResponse> {
    try {
      // 1. 验证基本JSON-RPC结构
      if (!this.isValidJsonRpcRequest(request)) {
        throw A2AError.invalidRequest('Invalid JSON-RPC request structure.');
      }

      const taskId: string | undefined = (request.params as any)?.id;
      let result: any;

      // 2. 基于方法处理请求
      switch (request.method) {
        case 'tasks/send':
          result = await this.processTaskSend(request as schema.SendTaskRequest);
          break;
        case 'tasks/get':
          result = await this.processTaskGet(request as schema.GetTaskRequest);
          break;
        case 'tasks/cancel':
          result = await this.processTaskCancel(request as schema.CancelTaskRequest);
          break;
        case 'tasks/list':
          // 新增：获取所有任务列表（不按会话分组，每个任务就是一个会话）
          result = await this.processListTasks();
          break;
        default:
          throw A2AError.methodNotFound(request.method);
      }

      // 3. 返回成功响应
      return this.createSuccessResponse(request.id, result);
    } catch (error) {
      // 4. 处理错误
      return this.normalizeErrorResponse(error, request.id ?? null);
    }
  }

  /**
   * 处理流式请求
   */
  handleStreamingRequest(
    request: schema.SendTaskStreamingRequest,
  ): EventEmitter {
    const eventEmitter = new EventEmitter();

    if (!this.isValidJsonRpcRequest(request) || request.method !== 'tasks/sendSubscribe') {
      const error = A2AError.invalidRequest('Invalid streaming request.');
      eventEmitter.emit('error', error);
      return eventEmitter;
    }

    // 获取任务ID
    const taskId = (request.params).id;

    // 异步处理流请求
    this.processStreamingRequest(request, eventEmitter).catch((error) => {
      eventEmitter.emit('error', error);
    });

    return eventEmitter;
  }

  /**
   * 处理流式请求实现
   */
  private async processStreamingRequest(
    request: schema.SendTaskStreamingRequest,
    emitter: EventEmitter,
  ): Promise<void> {
    const { id: taskId, message, sessionId, metadata } = request.params;

    try {
      // 加载或创建任务
      let currentData = await this.loadOrCreateTaskAndHistory(
        taskId,
        message,
        sessionId,
        metadata,
      );

      // 创建任务上下文
      const context = this.createTaskContext(
        currentData.task,
        message,
        currentData.history,
      );

      // 获取处理器生成器
      const generator = this.taskHandler(context);

      let lastEventWasFinal = false;
      let lastStatusMessage: schema.Message | null = null;

      // 处理生成器产出的结果
      for await (const yieldValue of generator) {
        // 记录上一条状态消息用于判断
        if (isTaskStatusUpdate(yieldValue) && yieldValue.message) {
          lastStatusMessage = yieldValue.message;
        }

        // 应用更新
        currentData = this.applyUpdateToTaskAndHistory(currentData, yieldValue);
        // 保存更新后的状态
        await this.taskStore.save(currentData);
        // 更新上下文
        context.task = currentData.task;

        let event;
        let isFinal = false;

        // 确定事件类型
        if (isTaskStatusUpdate(yieldValue)) {
          const terminalStates: schema.TaskState[] = [
            'completed',
            'failed',
            'canceled',
            'input-required',
          ];
          isFinal = terminalStates.includes(currentData.task.status.state);
          event = this.createTaskStatusEvent(
            taskId,
            currentData.task.status,
            isFinal,
          );
        } else if (isArtifactUpdate(yieldValue)) {
          const updatedArtifact = currentData.task.artifacts?.find(
            (a) =>
              (a.index !== undefined && a.index === yieldValue.index) ||
              (a.name && a.name === yieldValue.name),
          ) ?? yieldValue;
          event = this.createTaskArtifactEvent(taskId, updatedArtifact, false);
        } else {
          console.warn('[Stream] Handler yielded unknown value:', yieldValue);
          continue;
        }

        // 发送事件
        emitter.emit('update', event);
        lastEventWasFinal = isFinal;

        // 如果是最终状态，停止处理
        if (isFinal) break;
      }

      // 处理结束，确保有最终事件
      if (!lastEventWasFinal) {
        // 确保任务处于最终状态
        const finalStates: schema.TaskState[] = [
          'completed',
          'failed',
          'canceled',
          'input-required',
        ];
        if (!finalStates.includes(currentData.task.status.state)) {
          currentData = this.applyUpdateToTaskAndHistory(currentData, {
            state: 'completed',
          });
          await this.taskStore.save(currentData);
        }
        // 发送最终状态事件
        const finalEvent = this.createTaskStatusEvent(
          taskId,
          currentData.task.status,
          true,
        );
        emitter.emit('update', finalEvent);
      }
    } catch (error) {
      console.error(`[Stream ${taskId}] Error:`, error);
      emitter.emit('error', error);
    }
  }

  /**
   * 获取所有任务列表
   * 注意：这个不是标准A2A API的一部分，但对客户端非常有用
   * 在我们的应用中，每个A2A任务就是一个完整的会话
   */
  private async processListTasks(): Promise<schema.Task[]> {
    // 获取所有任务ID
    const taskIds = await this.getAllTaskIds();
    const tasks: schema.Task[] = [];

    // 加载每个任务的详细信息
    for (const taskId of taskIds) {
      const taskAndHistory = await this.taskStore.load(taskId);
      if (taskAndHistory) {
        tasks.push({ ...taskAndHistory.task });
      }
    }

    return tasks;
  }

  // 处理任务发送请求
  private async processTaskSend(request: schema.SendTaskRequest): Promise<schema.Task> {
    this.validateTaskSendParams(request.params);
    const { id: taskId, message, metadata } = request.params;
    // 不使用sessionId，将每个task视为独立的会话

    // 加载或创建任务
    let currentData = await this.loadOrCreateTaskAndHistory(
      taskId,
      message,
      undefined, // 不使用sessionId
      metadata,
    );

    const context = this.createTaskContext(
      currentData.task,
      message,
      currentData.history,
    );
    const generator = this.taskHandler(context);

    // 处理生成器产出
    try {
      for await (const yieldValue of generator) {
        currentData = this.applyUpdateToTaskAndHistory(currentData, yieldValue);
        await this.taskStore.save(currentData);
        context.task = currentData.task;
      }
    } catch (handlerError) {
      // 处理器错误
      const failureStatusUpdate: Omit<schema.TaskStatus, 'timestamp'> = {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [
            {
              text: `Handler failed: ${
                handlerError instanceof Error
                  ? handlerError.message
                  : String(handlerError)
              }`,
            },
          ],
        },
      };
      currentData = this.applyUpdateToTaskAndHistory(
        currentData,
        failureStatusUpdate,
      );
      try {
        await this.taskStore.save(currentData);
      } catch (saveError) {
        console.error(
          `Failed to save task ${taskId} after handler error:`,
          saveError,
        );
      }
      throw this.normalizeError(handlerError, request.id, taskId);
    }

    return currentData.task;
  }

  // 处理获取任务请求
  private async processTaskGet(request: schema.GetTaskRequest): Promise<schema.Task> {
    const { id: taskId } = request.params;
    if (!taskId) throw A2AError.invalidParams('Missing task ID.');

    const data = await this.taskStore.load(taskId);
    if (!data) {
      throw A2AError.taskNotFound(taskId);
    }

    return data.task;
  }

  // 处理取消任务请求
  private async processTaskCancel(request: schema.CancelTaskRequest): Promise<schema.Task> {
    const { id: taskId } = request.params;
    if (!taskId) throw A2AError.invalidParams('Missing task ID.');

    // 加载任务
    let data = await this.taskStore.load(taskId);
    if (!data) {
      throw A2AError.taskNotFound(taskId);
    }

    // 检查是否可取消
    const finalStates: schema.TaskState[] = ['completed', 'failed', 'canceled'];
    if (finalStates.includes(data.task.status.state)) {
      console.log(
        `Task ${taskId} already in final state ${data.task.status.state}, cannot cancel.`,
      );
      return data.task;
    }

    // 标记取消
    this.activeCancellations.add(taskId);

    // 更新状态为已取消
    const cancelUpdate: Omit<schema.TaskStatus, 'timestamp'> = {
      state: 'canceled',
      message: {
        role: 'agent',
        parts: [{ text: 'Task cancelled by request.' }],
      },
    };
    data = this.applyUpdateToTaskAndHistory(data, cancelUpdate);

    // 保存更新状态
    await this.taskStore.save(data);

    // 移除活跃取消标记
    this.activeCancellations.delete(taskId);

    return data.task;
  }

  // --- Helper Methods ---

  /**
   * 获取所有任务的ID列表
   */
  async getAllTaskIds(): Promise<string[]> {
    if ('getAllTaskIds' in this.taskStore) {
      return (this.taskStore as any).getAllTaskIds();
    }
    return [];
  }

  /**
   * 获取所有任务
   */
  async getAllTasks(): Promise<schema.Task[]> {
    const taskIds = await this.getAllTaskIds();
    const tasks: schema.Task[] = [];

    for (const taskId of taskIds) {
      const data = await this.taskStore.load(taskId);
      if (data) {
        tasks.push(data.task);
      }
    }

    return tasks;
  }

  // Renamed and updated to handle both task and history
  private async loadOrCreateTaskAndHistory(
    taskId: string,
    initialMessage: schema.Message,
    _sessionId?: string | null, // 忽略sessionId参数，不再使用
    metadata?: Record<string, unknown> | null, // Allow null
  ): Promise<TaskAndHistory> {
    let data = await this.taskStore.load(taskId);
    let needsSave = false;

    if (!data) {
      // Create new task and history
      const initialTask: schema.Task = {
        id: taskId,
        // 不设置sessionId，每个task就是一个独立的会话
        status: {
          state: 'submitted', // Start as submitted
          timestamp: getCurrentTimestamp(),
          message: null, // Initial user message goes only to history for now
        },
        artifacts: [],
        metadata: metadata ?? undefined, // Store undefined if null
      };
      const initialHistory: schema.Message[] = [initialMessage]; // History starts with user message
      data = { task: initialTask, history: initialHistory };
      needsSave = true; // Mark for saving
      console.log(`[Task ${taskId}] Created new task and history.`);
    } else {
      console.log(`[Task ${taskId}] Loaded existing task and history.`);
      // Add current user message to history
      // Make a copy before potentially modifying
      data = { task: data.task, history: [...data.history, initialMessage] };
      needsSave = true; // History updated, mark for saving

      // Handle state transitions for existing tasks
      const finalStates: schema.TaskState[] = [
        'completed',
        'failed',
        'canceled',
      ];
      if (finalStates.includes(data.task.status.state)) {
        console.warn(
          `[Task ${taskId}] Received message for task already in final state ${data.task.status.state}. Handling as new submission (keeping history).`,
        );
        // Option 1: Reset state to 'submitted' (keeps history, effectively restarts)
        const resetUpdate: Omit<schema.TaskStatus, 'timestamp'> = {
          state: 'submitted',
          message: null, // Clear old agent message
        };
        data = this.applyUpdateToTaskAndHistory(data, resetUpdate);
        // needsSave is already true

        // Option 2: Throw error (stricter)
        // throw A2AError.invalidRequest(`Task ${taskId} is already in a final state.`);
      } else if (data.task.status.state === 'input-required') {
        console.log(
          `[Task ${taskId}] Received message while 'input-required', changing state to 'working'.`,
        );
        // If it was waiting for input, update state to 'working'
        const workingUpdate: Omit<schema.TaskStatus, 'timestamp'> = {
          state: 'working',
        };
        data = this.applyUpdateToTaskAndHistory(data, workingUpdate);
        // needsSave is already true
      } else if (data.task.status.state === 'working') {
        // If already working, maybe warn but allow? Or force back to submitted?
        console.warn(
          `[Task ${taskId}] Received message while already 'working'. Proceeding.`,
        );
        // No state change needed, but history was updated, so needsSave is true.
      }
      // If 'submitted', receiving another message might be odd, but proceed.
    }

    // Save if created or modified before returning
    if (needsSave) {
      await this.taskStore.save(data);
    }

    // Return copies to prevent mutation by caller before handler runs
    return { task: { ...data.task }, history: [...data.history] };
  }

  // Update context creator to accept and include history
  private createTaskContext(
    task: schema.Task,
    userMessage: schema.Message,
    history: schema.Message[], // Add history parameter
  ): TaskContext {
    return {
      task: { ...task }, // Pass a copy
      userMessage: userMessage,
      history: [...history], // Pass a copy of the history
      isCancelled: () => this.activeCancellations.has(task.id),
      // taskStore is removed
    };
  }

  private isValidJsonRpcRequest(body: any): body is schema.JSONRPCRequest {
    return (
      typeof body === 'object' &&
      body !== null &&
      body.jsonrpc === '2.0' &&
      typeof body.method === 'string' &&
      (body.id === null ||
        typeof body.id === 'string' ||
        typeof body.id === 'number') && // ID is required for requests needing response
      (body.params === undefined ||
        typeof body.params === 'object' || // Allows null, array, or object
        Array.isArray(body.params))
    );
  }

  private validateTaskSendParams(
    parameters: any,
  ): asserts parameters is schema.TaskSendParams {
    if (!parameters || typeof parameters !== 'object') {
      throw A2AError.invalidParams('Missing or invalid params object.');
    }
    if (typeof parameters.id !== 'string' || parameters.id === '') {
      throw A2AError.invalidParams('Invalid or missing task ID (params.id).');
    }
    if (
      !parameters.message ||
      typeof parameters.message !== 'object' ||
      !Array.isArray(parameters.message.parts)
    ) {
      throw A2AError.invalidParams(
        'Invalid or missing message object (params.message).',
      );
    }
    // Add more checks for message structure, sessionID, metadata, etc. if needed
  }

  // --- Response Formatting ---

  private createSuccessResponse<T>(
    id: number | string | null,
    result: T,
  ): schema.JSONRPCResponse<T> {
    if (id === null) {
      // This shouldn't happen for methods that expect a response, but safeguard
      throw A2AError.internalError(
        'Cannot create success response for null ID.',
      );
    }
    return {
      jsonrpc: '2.0',
      id: id,
      result: result,
    };
  }

  private createErrorResponse(
    id: number | string | null,
    error: schema.JSONRPCError,
  ): schema.JSONRPCResponse<null> {
    // For errors, ID should be the same as request ID, or null if that couldn't be determined
    return {
      jsonrpc: '2.0',
      id: id, // Can be null if request ID was invalid/missing
      error: error,
    };
  }

  private normalizeErrorResponse(
    error: any,
    requestId: number | string | null,
  ): schema.JSONRPCResponse<null> {
    let a2aError: A2AError;
    if (error instanceof A2AError) {
      a2aError = error;
    } else if (error instanceof Error) {
      a2aError = A2AError.internalError(error.message, { stack: error.stack });
    } else {
      a2aError = A2AError.internalError('An unknown error occurred.', error);
    }

    console.error(
      `Error processing request (ReqID: ${requestId ?? 'N/A'}):`,
      a2aError,
    );

    return this.createErrorResponse(requestId, a2aError.toJSONRPCError());
  }

  private createTaskStatusEvent(
    taskId: string,
    status: schema.TaskStatus,
    final: boolean,
  ): schema.TaskStatusUpdateEvent {
    return {
      id: taskId,
      status: status, // Assumes status already has timestamp from applyUpdate
      final: final,
    };
  }

  private createTaskArtifactEvent(
    taskId: string,
    artifact: schema.Artifact,
    final: boolean,
  ): schema.TaskArtifactUpdateEvent {
    return {
      id: taskId,
      artifact: artifact,
      final: final, // Usually false unless it's the very last thing
    };
  }

  /**
   * 获取任务的消息历史记录
   * 这不是A2A协议的标准部分，但对客户端很有用
   */
  async getTaskHistory(taskId: string): Promise<schema.Message[]> {
    try {
      const data = await this.taskStore.load(taskId);
      if (!data) {
        throw A2AError.taskNotFound(taskId);
      }
      return [...data.history]; // 返回副本以防止修改
    } catch (error) {
      console.error(`Failed to get history for task ${taskId}:`, error);
      return [];
    }
  }
}
