import { EventEmitter } from 'events';
import { A2AError } from './error';
import { TaskHandler } from './handler';
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
  /** Database ID of the agent this server instance belongs to */
  agentId?: string;
}

/**
 * Task context interface for handlers
 */
export interface TaskContext {
  /** The current task state */
  task: schema.Task;
  /** The user message that triggered this task */
  userMessage: schema.Message;
  /** The full message history for this task */
  history: schema.Message[];
  /** Function to check if task was cancelled */
  isCancelled: () => boolean;
}

/**
 * Implements an A2A specification compliant server.
 */
export class A2AServer {
  private taskHandler: TaskHandler;
  private taskStore: TaskStore;
  // Track active cancellations
  private activeCancellations: Set<string> = new Set();
  card: schema.AgentCard;
  // Agent ID - this should be the database ID
  private agentId: string;

  constructor(handler: TaskHandler, options: A2AServerOptions = {}) {
    this.taskHandler = handler;
    this.taskStore = options.taskStore ?? new InMemoryTaskStore();
    if (options.card) this.card = options.card;
    
    this.agentId = options.agentId || 'echo-agent';
    
    console.log(`A2AServer initialized with agentId: ${this.agentId}`);
  }

  // Helper to apply updates immutably
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

      // 2. 基于方法处理请求 - 保持A2A协议命名约定
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
          // 获取所有任务列表
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
    this.processStreamingSession(request, eventEmitter).catch((error) => {
      eventEmitter.emit('error', error);
    });

    return eventEmitter;
  }

  /**
   * 处理流式请求实现
   */
  private async processStreamingSession(
    request: schema.SendTaskStreamingRequest,
    emitter: EventEmitter,
  ): Promise<void> {
    const { id: taskId, message, sessionId: requestSessionId, metadata } = request.params;

    try {
      // 加载或创建任务
      let currentData = await this.loadOrCreateTaskAndHistory(
        taskId,
        message,
        requestSessionId,
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

  // 处理任务发送请求 (tasks/send)
  private async processTaskSend(request: schema.SendTaskRequest): Promise<schema.Task> {
    this.validateTaskSendParams(request.params);
    const { id: taskId, message, metadata } = request.params;

    // 加载或创建任务
    let currentData = await this.loadOrCreateTaskAndHistory(
      taskId,
      message,
      undefined, // 不使用传入的sessionId参数
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

  // 处理获取任务请求 (tasks/get)
  private async processTaskGet(request: schema.GetTaskRequest): Promise<schema.Task> {
    const { id: taskId } = request.params;
    if (!taskId) throw A2AError.invalidParams('Missing task ID.');

    const data = await this.taskStore.load(taskId);
    if (!data) {
      throw A2AError.taskNotFound(taskId);
    }

    return data.task;
  }

  // 处理取消任务请求 (tasks/cancel)
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

  /**
   * Delete a task from storage
   * 注意：这不是A2A协议的标准部分，是我们添加的扩展功能
   */
  async deleteTask(taskId: string): Promise<boolean> {
    try {
      // 从任务存储中删除任务
      if ('deleteTask' in this.taskStore) {
        const result = await this.taskStore.deleteTask(taskId);
        return result;
      }
      return false;
    } catch (error) {
      console.error(`Failed to delete task ${taskId}:`, error);
      return false;
    }
  }

  /**
   * @deprecated 使用 deleteTask 代替
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    return this.deleteTask(sessionId);
  }

  // --- Helper Methods ---

  /**
   * 获取所有任务的ID列表
   */
  async getAllTaskIds(): Promise<string[]> {
    return this.taskStore.getAllTaskIds();
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

  /**
   * 获取任务历史记录
   */
  async getTaskHistory(taskId: string): Promise<schema.Message[]> {
    const data = await this.taskStore.load(taskId);
    if (!data) {
      return [];
    }
    return data.history;
  }

  // 加载或创建任务及其历史记录
  private async loadOrCreateTaskAndHistory(
    taskId: string,
    initialMessage: schema.Message,
    _sessionIdParam?: string | null, // 忽略sessionId参数，不再使用
    metadata?: Record<string, unknown> | null, // 允许为null
  ): Promise<TaskAndHistory> {
    let data = await this.taskStore.load(taskId);
    let needsSave = false;

    if (!data) {
      // 创建新任务和历史记录
      const initialTask: schema.Task & { agentId: string } = {
        id: taskId,
        // 使用当前agentId
        agentId: this.agentId,
        status: {
          state: 'submitted', // 初始状态为submitted
          timestamp: getCurrentTimestamp(),
          message: null, // 初始用户消息仅放入历史记录
        },
        artifacts: [],
        metadata: metadata ?? undefined, // null转为undefined
      };
      const initialHistory: schema.Message[] = [initialMessage]; // 历史记录以用户消息开始
      data = { task: initialTask, history: initialHistory };
      needsSave = true; // 标记需要保存
      console.log(`[Task ${taskId}] Created new task and history.`);
    } else {
      console.log(`[Task ${taskId}] Loaded existing task and history.`);
      // 将当前用户消息添加到历史记录
      // 在可能修改前创建副本
      data = { task: data.task, history: [...data.history, initialMessage] };
      needsSave = true; // 历史记录已更新，标记需要保存

      // 如果加载的现有任务没有agentId，设置为当前agentId
      if (!data.task.agentId) {
        data.task.agentId = this.agentId;
        needsSave = true;
      }

      // 处理现有任务的状态转换
      const finalStates: schema.TaskState[] = [
        'completed',
        'failed',
        'canceled',
      ];
      if (finalStates.includes(data.task.status.state)) {
        console.warn(
          `[Task ${taskId}] Received message for task already in final state ${data.task.status.state}. Handling as new submission (keeping history).`,
        );
        // 选项1：重置状态为'submitted'（保留历史记录，实际上是重新启动）
        const resetUpdate: Omit<schema.TaskStatus, 'timestamp'> = {
          state: 'submitted',
          message: null, // 清除旧的智能体消息
        };
        data = this.applyUpdateToTaskAndHistory(data, resetUpdate);
        // needsSave已为true
      } else if (data.task.status.state === 'input-required') {
        console.log(
          `[Task ${taskId}] Received message while 'input-required', changing state to 'working'.`,
        );
        // 如果它在等待输入，将状态更新为'working'
        const workingUpdate: Omit<schema.TaskStatus, 'timestamp'> = {
          state: 'working',
        };
        data = this.applyUpdateToTaskAndHistory(data, workingUpdate);
        // needsSave已为true
      } else if (data.task.status.state === 'working') {
        // 如果已经在工作，可能发出警告但允许继续
        console.warn(
          `[Task ${taskId}] Received message while already 'working'. Proceeding.`,
        );
        // 不需要状态更改，但历史记录已更新，所以needsSave为true
      }
      // 如果状态为'submitted'，收到另一条消息可能很奇怪，但继续处理
    }

    // 如果创建或修改过，保存再返回
    if (needsSave) {
      await this.taskStore.save(data);
    }

    // 返回副本以防止处理程序运行前被调用者修改
    return { task: { ...data.task }, history: [...data.history] };
  }

  // 创建任务上下文
  private createTaskContext(
    task: schema.Task,
    userMessage: schema.Message,
    history: schema.Message[], // 添加历史记录参数
  ): TaskContext {
    return {
      task: { ...task },
      userMessage: userMessage,
      history: [...history], // 传递历史记录副本
      isCancelled: () => this.activeCancellations.has(task.id),
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
        typeof body.id === 'number') && // 需要响应的请求需要ID
      (body.params === undefined ||
        typeof body.params === 'object' || // 允许null、数组或对象
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
    // 可以添加更多有关消息结构、sessionID、metadata等的检查
  }

  // --- Response Formatting ---

  private createSuccessResponse<T>(
    id: number | string | null,
    result: T,
  ): schema.JSONRPCResponse<T> {
    if (id === null) {
      // 这对于期望响应的方法不应该发生，但作为保障
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
    // 对于错误，ID应与请求ID相同，如果无法确定，则为null
    return {
      jsonrpc: '2.0',
      id: id, // 如果请求ID无效/缺失，可以为null
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

  private normalizeError(error: any, requestId: any, taskId: string): A2AError {
    if (error instanceof A2AError) {
      return error;
    }
    console.error(
      `Handler error for request ${requestId ?? 'N/A'}, task ${taskId}:`,
      error,
    );
    return A2AError.internalError(
      error instanceof Error ? error.message : String(error),
      { originalError: error },
    );
  }

  private createTaskStatusEvent(
    taskId: string,
    status: schema.TaskStatus,
    final: boolean,
  ): schema.TaskStatusUpdateEvent {
    return {
      id: taskId,
      status: status, // 假设状态已经从applyUpdate获取了时间戳
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
      final: final, // 通常为false，除非是最后一件事
    };
  }
}
