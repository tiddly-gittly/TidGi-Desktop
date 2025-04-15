import { DataSource } from 'typeorm';
import * as schema from './schema';

// Helper type for the simplified store
export interface TaskAndHistory {
  task: schema.Task & { agentId?: string | null };
  history: schema.Message[];
}

// Database row types
interface AgentTaskRow {
  id: string;
  agentId: string | null;
  state: string;
  status: string;
  artifacts?: string | null;
  metadata?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface AgentTaskMessageRow {
  id: number;
  taskId: string;
  role: string;
  parts: string;
  metadata?: string | null;
  timestamp: string;
}

// Typed JSON parsing helpers
function parseJSON<T>(json: string | null | undefined, defaultValue: T): T {
  if (!json) return defaultValue;
  try {
    return JSON.parse(json) as T;
  } catch (e) {
    console.error('Error parsing JSON:', e);
    return defaultValue;
  }
}

// Interface for task status
interface TaskStatusData {
  state: schema.TaskState;
  message?: schema.Message | null;
  timestamp?: string;
}

// Interface for transaction
interface Transaction {
  query<T = any>(query: string, parameters?: any[]): Promise<T[]>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
}

/**
 * Task storage interface
 */
export interface TaskStore {
  /**
   * Save task and its related history
   */
  save(data: TaskAndHistory): Promise<void>;

  /**
   * Load task and its history
   */
  load(taskId: string): Promise<TaskAndHistory | null>;

  /**
   * Get all task IDs
   */
  getAllTaskIds(): Promise<string[]>;

  /**
   * Get all tasks
   */
  getAllTasks(): Promise<(schema.Task & { agentId?: string | null })[]>;

  /**
   * Get history for a task
   */
  getTaskHistory(taskId: string): Promise<schema.Message[]>;
}

/**
 * SQLite implementation of task store
 */
export class SQLiteTaskStore implements TaskStore {
  private dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
  }

  async load(taskId: string): Promise<TaskAndHistory | null> {
    try {
      // Query task
      const taskRows = await this.dataSource.query<AgentTaskRow[]>(
        `SELECT * FROM agent_tasks WHERE id = ?`,
        [taskId],
      );
      const task = taskRows[0];
      if (!task) {
        return null;
      }

      // Query messages
      const messages = await this.dataSource.query<AgentTaskMessageRow[]>(
        `SELECT * FROM agent_task_messages WHERE taskId = ? ORDER BY timestamp ASC`,
        [taskId],
      );

      // Parse JSON with proper typing
      const status = parseJSON<TaskStatusData>(task.status, { state: 'unknown' });
      const artifacts = parseJSON<schema.Artifact[] | null>(task.artifacts, null);
      const metadata = parseJSON<Record<string, unknown> | null>(task.metadata, null);

      const taskData: schema.Task & { agentId?: string | null } = {
        id: task.id,
        agentId: task.agentId,
        status: status,
        artifacts: artifacts,
        metadata: metadata,
      };

      const history: schema.Message[] = messages.map((message) => ({
        role: message.role as 'user' | 'agent',
        parts: parseJSON<schema.Part[]>(message.parts, []),
        metadata: message.metadata ? parseJSON<Record<string, unknown>>(message.metadata, {}) : undefined,
      }));

      return { task: taskData, history };
    } catch (error) {
      console.error(`Failed to load task ${taskId} from SQLite:`, error);
      return null;
    }
  }

  async save(data: TaskAndHistory): Promise<void> {
    try {
      const { task, history } = data;

      // Start a transaction
      await this.dataSource.transaction(async (entityManager) => {
        const transaction = entityManager as unknown as Transaction;

        // Check if task exists
        const existsResult = await transaction.query<{ exists: number }[]>(
          'SELECT COUNT(*) as exists FROM agent_tasks WHERE id = ?',
          [task.id],
        );
        const exists = existsResult[0]?.exists > 0;

        if (exists) {
          // Update existing task
          await transaction.query(
            `UPDATE agent_tasks SET 
              agentId = ?, 
              state = ?, 
              status = ?, 
              artifacts = ?, 
              metadata = ?,
              updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [
              task.agentId || null,
              task.status.state,
              JSON.stringify(task.status),
              task.artifacts ? JSON.stringify(task.artifacts) : null,
              task.metadata ? JSON.stringify(task.metadata) : null,
              task.id,
            ],
          );
        } else {
          // Insert new task
          await transaction.query(
            `INSERT INTO agent_tasks (id, agentId, state, status, artifacts, metadata) 
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
              task.id,
              task.agentId || null,
              task.status.state,
              JSON.stringify(task.status),
              task.artifacts ? JSON.stringify(task.artifacts) : null,
              task.metadata ? JSON.stringify(task.metadata) : null,
            ],
          );
        }

        // Delete existing messages for this task to avoid duplicates
        await transaction.query('DELETE FROM agent_task_messages WHERE taskId = ?', [task.id]);

        // Insert all messages
        for (const message of history) {
          await transaction.query(
            `INSERT INTO agent_task_messages (taskId, role, parts, metadata) 
            VALUES (?, ?, ?, ?)`,
            [
              task.id,
              message.role,
              JSON.stringify(message.parts),
              message.metadata ? JSON.stringify(message.metadata) : null,
            ],
          );
        }
      });
    } catch (error) {
      console.error(`Failed to save task ${data.task.id} to SQLite:`, error);
      throw new Error(`Failed to save task: ${(error as Error).message}`);
    }
  }

  async getAllTaskIds(): Promise<string[]> {
    try {
      const rows = await this.dataSource.query<Pick<AgentTaskRow, 'id'>[]>(
        'SELECT id FROM agent_tasks',
      );
      return rows.map((t) => t.id);
    } catch (error) {
      console.error('Failed to get all task IDs from SQLite:', error);
      return [];
    }
  }

  async getAllTasks(): Promise<(schema.Task & { agentId?: string | null })[]> {
    try {
      const rows = await this.dataSource.query<AgentTaskRow[]>(
        'SELECT * FROM agent_tasks',
      );
      return rows.map((task) => ({
        id: task.id,
        agentId: task.agentId,
        status: parseJSON<TaskStatusData>(task.status, { state: 'unknown' }),
        artifacts: parseJSON<schema.Artifact[] | null>(task.artifacts, null),
        metadata: parseJSON<Record<string, unknown> | null>(task.metadata, null),
      }));
    } catch (error) {
      console.error('Failed to get all tasks from SQLite:', error);
      return [];
    }
  }

  async getTaskHistory(taskId: string): Promise<schema.Message[]> {
    try {
      const messages = await this.dataSource.query<AgentTaskMessageRow[]>(
        'SELECT * FROM agent_task_messages WHERE taskId = ? ORDER BY timestamp ASC',
        [taskId],
      );
      return messages.map((message) => ({
        role: message.role as 'user' | 'agent',
        parts: parseJSON<schema.Part[]>(message.parts, []),
        metadata: message.metadata ? parseJSON<Record<string, unknown>>(message.metadata, {}) : undefined,
      }));
    } catch (error) {
      console.error(`Failed to get history for task ${taskId} from SQLite:`, error);
      return [];
    }
  }
}
