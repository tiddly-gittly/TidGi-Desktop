import { EventEmitter } from 'events';
import { AgentPromptDescription } from '../defaultAgents/schemas';
import { A2AError } from './error';
import { TaskContext, TaskHandler } from './handler';
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
  /** AI Configuration for the agent (parsed JSON object) */
  aiConfig?: AgentPromptDescription;
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
  // AI Configuration
  private aiConfig?: AgentPromptDescription;

  constructor(handler: TaskHandler, options: A2AServerOptions = {}) {
    this.taskHandler = handler;
    this.taskStore = options.taskStore ?? new InMemoryTaskStore();
    if (options.card) this.card = options.card;
    this.aiConfig = options.aiConfig;

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

      // Add agent message to history if present
      if (update.message && update.message.role === 'agent') {
        let existingMessageIndex = -1;

        // Find existing message with the same ID or similar content
        if (update.message.metadata?.id) {
          existingMessageIndex = newHistory.findIndex(message =>
            message.role === 'agent' &&
            message.metadata?.id === update.message?.metadata?.id
          );
        }

        // Special handling for completed replies that should replace "Processing" messages
        const messageContent = update.message.parts.map(p => 'text' in p ? p.text : '').join('');
        const isCompletedReply = update.state === 'completed' && messageContent.includes('You said:');
        const processingMessageIndex = newHistory.findIndex(message =>
          message.role === 'agent' &&
          message.parts.some(p => 'text' in p && p.text.includes('Processing your message'))
        );

        if (isCompletedReply && processingMessageIndex >= 0) {
          newHistory[processingMessageIndex] = update.message;
        } // Update existing message if found (stream update case)
        else if (existingMessageIndex >= 0) {
          newHistory[existingMessageIndex] = update.message;
        } // If no existing message found, add as new
        else {
          newHistory.push(update.message);
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
          const appendedArtifact = JSON.parse(JSON.stringify(existingArtifact)) as schema.Artifact;
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
   * Handle JSON-RPC requests
   */
  async handleRequest(request: schema.JSONRPCRequest): Promise<schema.JSONRPCResponse> {
    try {
      // Validate basic JSON-RPC structure
      if (!this.isValidJsonRpcRequest(request)) {
        throw A2AError.invalidRequest('Invalid JSON-RPC request structure.');
      }
      let result;

      // Handle request based on method - follow A2A protocol naming conventions
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
          // Get all tasks list
          result = await this.processListTasks();
          break;
        default:
          throw A2AError.methodNotFound(request.method);
      }

      // Return success response
      return this.createSuccessResponse(request.id as string, result);
    } catch (error) {
      // Handle error
      return this.normalizeErrorResponse(error, request.id ?? null);
    }
  }

  /**
   * Handle streaming requests
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

    // Asynchronously process streaming request
    this.processStreamingSession(request, eventEmitter).catch((error: unknown) => {
      eventEmitter.emit('error', error);
    });

    return eventEmitter;
  }

  /**
   * Implementation for streaming session processing
   */
  private async processStreamingSession(
    request: schema.SendTaskStreamingRequest,
    emitter: EventEmitter,
  ): Promise<void> {
    const { id: taskId, message, sessionId: requestSessionId, metadata } = request.params;

    try {
      // Load or create task
      let currentData = await this.loadOrCreateTaskAndHistory(
        taskId,
        message,
        requestSessionId,
        metadata,
      );
      // Remove active cancellation mark
      this.activeCancellations.delete(taskId);
      // Add global aiConfig to task if available and not already set
      if (this.aiConfig && !currentData.task.aiConfig) {
        currentData.task.aiConfig = this.aiConfig;
        await this.taskStore.save(currentData);
      }

      // Create task context
      const context = this.createTaskContext(
        currentData.task,
        message,
        currentData.history,
      );

      // Get handler generator
      const generator = this.taskHandler(context);

      let lastEventWasFinal = false;
      let lastStatusMessage: schema.Message | null = null;

      // Process generator yield values
      for await (const yieldValue of generator) {
        // Record last status message for final event determination
        if (isTaskStatusUpdate(yieldValue) && yieldValue.message) {
          lastStatusMessage = yieldValue.message;
        }

        // Apply updates
        currentData = this.applyUpdateToTaskAndHistory(currentData, yieldValue);
        // Save updated state
        await this.taskStore.save(currentData);
        // Update context
        context.task = currentData.task;

        let event;
        let isFinal = false;

        // Determine event type
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

        // Emit event
        emitter.emit('update', event);
        lastEventWasFinal = isFinal;

        // Stop processing if final state
        if (isFinal) break;
      }

      // Ensure final event if not already emitted
      if (!lastEventWasFinal) {
        // Ensure task is in final state
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
        // Emit final state event
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
   * Get all tasks
   * Note: This is not part of the standard A2A API, but useful for clients
   */
  private async processListTasks(): Promise<schema.Task[]> {
    // Get all task IDs
    const taskIds = await this.getAllTaskIds();
    const tasks: schema.Task[] = [];

    // Load details for each task
    for (const taskId of taskIds) {
      const taskAndHistory = await this.taskStore.load(taskId);
      if (taskAndHistory) {
        tasks.push({ ...taskAndHistory.task });
      }
    }

    return tasks;
  }

  // Process task send request (tasks/send)
  private async processTaskSend(request: schema.SendTaskRequest): Promise<schema.Task> {
    this.validateTaskSendParams(request.params);
    const { id: taskId, message, metadata } = request.params;

    // Remove active cancellation mark
    this.activeCancellations.delete(taskId);
    // Load or create task
    let currentData = await this.loadOrCreateTaskAndHistory(
      taskId,
      message,
      undefined, // Do not use sessionId parameter
      metadata,
    );

    const context = this.createTaskContext(
      currentData.task,
      message,
      currentData.history,
    );
    const generator = this.taskHandler(context);

    // Process generator yield values
    try {
      for await (const yieldValue of generator) {
        currentData = this.applyUpdateToTaskAndHistory(currentData, yieldValue);
        await this.taskStore.save(currentData);
        context.task = currentData.task;
      }
    } catch (handlerError) {
      // Handle handler error
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

  // Process task get request (tasks/get)
  private async processTaskGet(request: schema.GetTaskRequest): Promise<schema.Task> {
    const { id: taskId } = request.params;
    if (!taskId) throw A2AError.invalidParams('Missing task ID.');

    const data = await this.taskStore.load(taskId);
    if (!data) {
      throw A2AError.taskNotFound(taskId);
    }

    return data.task;
  }

  // Process task cancel request (tasks/cancel)
  private async processTaskCancel(request: schema.CancelTaskRequest): Promise<schema.Task> {
    const { id: taskId } = request.params;
    if (!taskId) throw A2AError.invalidParams('Missing task ID.');

    // Load task
    let data = await this.taskStore.load(taskId);
    if (!data) {
      throw A2AError.taskNotFound(taskId);
    }

    // Check if cancellable
    const finalStates: schema.TaskState[] = ['completed', 'failed', 'canceled'];
    if (finalStates.includes(data.task.status.state)) {
      console.log(
        `Task ${taskId} already in final state ${data.task.status.state}, cannot cancel.`,
      );
      return data.task;
    }

    // Mark as cancelled
    this.activeCancellations.add(taskId);

    // Update status to cancelled
    const cancelUpdate: Omit<schema.TaskStatus, 'timestamp'> = {
      state: 'canceled',
      message: {
        role: 'agent',
        parts: [{ text: 'Task cancelled by request.' }],
      },
    };
    data = this.applyUpdateToTaskAndHistory(data, cancelUpdate);

    // Save updated status
    await this.taskStore.save(data);

    return data.task;
  }

  /**
   * Delete a task from storage
   * Note: This is not part of the standard A2A protocol, but our custom extension
   */
  async deleteTask(taskId: string): Promise<boolean> {
    try {
      // Remove active cancellation mark
      this.activeCancellations.delete(taskId);
      // Delete task from task store
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
   * @deprecated Use deleteTask instead
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    return this.deleteTask(sessionId);
  }

  // --- Helper Methods ---

  /**
   * Get all task IDs
   */
  async getAllTaskIds(): Promise<string[]> {
    return this.taskStore.getAllTaskIds();
  }

  /**
   * Get all tasks
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
   * Get task history
   */
  async getTaskHistory(taskId: string): Promise<schema.Message[]> {
    const data = await this.taskStore.load(taskId);
    if (!data) {
      return [];
    }
    return data.history;
  }

  // Load or create task and its history
  private async loadOrCreateTaskAndHistory(
    taskId: string,
    initialMessage: schema.Message,
    _sessionIdParameter?: string | null, // Ignored parameter, no longer used
    metadata?: Record<string, unknown> | null, // Can be null
  ): Promise<TaskAndHistory> {
    let data = await this.taskStore.load(taskId);
    let needsSave = false;

    if (!data) {
      // Create new task and history
      const initialTask: schema.Task & { agentId: string } = {
        id: taskId,
        // Use current agentId
        agentId: this.agentId,
        status: {
          state: 'submitted', // Initial state is submitted
          timestamp: getCurrentTimestamp(),
          message: null, // Initial user message only goes into history
        },
        artifacts: [],
        metadata: metadata ?? undefined, // Convert null to undefined
        // Add global aiConfig to task if available
        aiConfig: this.aiConfig,
      };
      const initialHistory: schema.Message[] = [initialMessage]; // History starts with user message
      data = { task: initialTask, history: initialHistory };
      needsSave = true; // Mark as needing save
    } else {
      // Add current user message to history
      // Create copies before possible modifications
      data = { task: data.task, history: [...data.history, initialMessage] };
      needsSave = true; // History updated, mark for saving

      // Set agentId if missing in loaded task
      if (!data.task.agentId) {
        data.task.agentId = this.agentId;
        needsSave = true;
      }

      // Handle state transitions for existing tasks
      const finalStates: schema.TaskState[] = [
        'completed',
        'failed',
        'canceled',
      ];
      if (finalStates.includes(data.task.status.state)) {
        // Option 1: Reset to 'submitted' (keeping history, effectively restarting)
        const resetUpdate: Omit<schema.TaskStatus, 'timestamp'> = {
          state: 'submitted',
          message: null, // Clear old agent message
        };
        data = this.applyUpdateToTaskAndHistory(data, resetUpdate);
        // needsSave is already true
      } else if (data.task.status.state === 'input-required') {
        // Update state to 'working' if waiting for input
        const workingUpdate: Omit<schema.TaskStatus, 'timestamp'> = {
          state: 'working',
        };
        data = this.applyUpdateToTaskAndHistory(data, workingUpdate);
        // needsSave is already true
      } else if (data.task.status.state === 'working') {
        // Allow continuing with warning if already working
        // No state change needed, but history updated so needsSave is true
      }
      // Continue processing even if receiving messages in 'submitted' state
    }

    // Save if created or modified before returning
    if (needsSave) {
      await this.taskStore.save(data);
    }

    // Return copies to prevent modification before handler runs
    return { task: { ...data.task }, history: [...data.history] };
  }

  // Create task context
  private createTaskContext(
    task: schema.Task,
    userMessage: schema.Message,
    history: schema.Message[], // Add history parameter
  ): TaskContext {
    return {
      task: { ...task },
      userMessage: userMessage,
      history: [...history], // Pass a copy of history
      isCancelled: () => this.activeCancellations.has(task.id),
      agentId: this.agentId, // Add agentId to context
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
        typeof body.id === 'number') && // Requests expecting a response need an ID
      (body.params === undefined ||
        typeof body.params === 'object' || // Allow null, array, or object
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
    // Additional checks for message structure, sessionID, metadata, etc. can be added
  }

  // --- Response Formatting ---

  private createSuccessResponse<T>(
    id: number | string | null,
    result: T,
  ): schema.JSONRPCResponse<T> {
    if (id === null) {
      // This should not happen for methods expecting a response, but as a safeguard
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
    // For errors, the ID should match the request ID, or be null if undetermined
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
      status: status, // Assume status already has timestamp from applyUpdate
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
      final: final, // Typically false unless it's the last thing
    };
  }
}
