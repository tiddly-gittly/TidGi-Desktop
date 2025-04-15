import * as schema from './schema';
import { TaskStore } from './store';

/**
 * Update yielded by a session handler.
 */
export type SessionYieldUpdate =
  | Omit<schema.TaskStatus, 'timestamp'>
  | schema.Artifact;

// 保持与 A2A 协议兼容
export type TaskYieldUpdate = SessionYieldUpdate;

/**
 * Context provided to session handlers for processing messages
 */
export interface SessionContext {
  /**
   * The current session object (kept as 'task' for handler API compatibility)
   */
  task: schema.Task;

  /**
   * The most recent message from the user
   */
  userMessage: schema.Message;

  /**
   * Full history of the conversation
   */
  history: schema.Message[];

  /**
   * Check if the session has been cancelled
   */
  isCancelled: () => boolean;

  /**
   * Optional session store for persistence (rarely needed by handlers)
   */
  taskStore?: TaskStore;
}

// Keep TaskContext type for backward compatibility
export type TaskContext = SessionContext;

/**
 * Session handler function type
 * Takes a session context and returns an async generator of updates
 */
export type SessionHandler = (
  context: SessionContext
) => AsyncGenerator<SessionYieldUpdate>;

// Keep TaskHandler type for backward compatibility with A2A protocol
export type TaskHandler = SessionHandler;
