/* eslint-disable @typescript-eslint/no-invalid-void-type */
import { AgentDefinition, AgentInstance, AgentInstanceLatestStatus } from '../interface';

export interface AgentHandlerContext {
  agent: AgentInstance;
  agentDef: AgentDefinition;

  /**
   * Function to check if cancellation has been requested for this task.
   * Handlers should ideally check this periodically during long-running operations.
   * @returns {boolean} True if cancellation has been requested, false otherwise.
   */
  isCancelled(): boolean;
}

/**
 * Defines the signature for a task handler function.
 *
 * Handlers are implemented as async generators. They receive context about the
 * task and the triggering message. They can perform work and `yield` status
 * or artifact updates (`TaskYieldUpdate`). The server consumes these yields,
 * updates the task state in the store, and streams events if applicable.
 *
 * @param context - The TaskContext object containing task details, cancellation status, and store access.
 * @yields {TaskYieldUpdate} - Updates to the task's status or artifacts.
 * @returns {Promise<schema.Task | void>} - Optionally returns the final complete Task object
 *   (needed for non-streaming 'tasks/send'). If void is returned, the server uses the
 *   last known state from the store after processing all yields.
 */
export type AgentHandler = (
  context: AgentHandlerContext,
) => AsyncGenerator<AgentInstanceLatestStatus, AgentInstance | undefined | void, unknown>;
