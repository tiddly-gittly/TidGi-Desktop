import { AgentEntity, TaskEntity, TaskMessageEntity } from '@services/database/schema/agent';
import { nanoid } from 'nanoid'; // 添加这一行导入
import { DataSource, Repository } from 'typeorm';
import * as schema from './schema';

// Helper type for the simplified store
export interface TaskAndHistory {
  task: schema.Task & { agentId: string };
  history: schema.Message[];
}

// In-memory implementation of TaskStore
export class InMemoryTaskStore implements TaskStore {
  private store: Map<string, TaskAndHistory> = new Map();

  async load(taskId: string): Promise<TaskAndHistory | null> {
    const entry = this.store.get(taskId);
    // Return copies to prevent external mutation
    return entry
      ? { task: { ...entry.task }, history: [...entry.history] }
      : null;
  }

  async save(data: TaskAndHistory): Promise<void> {
    // Store copies to prevent internal mutation if caller reuses objects
    this.store.set(data.task.id, {
      task: { ...data.task },
      history: [...data.history],
    });
  }

  async getAllTaskIds(): Promise<string[]> {
    return Array.from(this.store.keys());
  }

  async getAllTasks(): Promise<(schema.Task & { agentId: string })[]> {
    return Array.from(this.store.values()).map(data => ({ ...data.task }));
  }

  async getTaskHistory(taskId: string): Promise<schema.Message[]> {
    const data = await this.load(taskId);
    return data ? [...data.history] : [];
  }

  async deleteTask(taskId: string): Promise<boolean> {
    const had = this.store.has(taskId);
    this.store.delete(taskId);
    return had;
  }
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
  getAllTasks(): Promise<(schema.Task & { agentId: string })[]>;

  /**
   * Get history for a task
   */
  getTaskHistory(taskId: string): Promise<schema.Message[]>;

  /**
   * Delete a task and its history
   */
  deleteTask(taskId: string): Promise<boolean>;
}

/**
 * SQLite implementation of task store using TypeORM
 */
export class SQLiteTaskStore implements TaskStore {
  private dataSource: DataSource;
  private taskRepository: Repository<TaskEntity>;
  private messageRepository: Repository<TaskMessageEntity>;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
    this.taskRepository = dataSource.getRepository(TaskEntity);
    this.messageRepository = dataSource.getRepository(TaskMessageEntity);
  }

  async load(taskId: string): Promise<TaskAndHistory | null> {
    try {
      // Find task by ID
      const taskEntity = await this.taskRepository.findOne({
        where: { id: taskId },
        relations: ['agent'],
      });

      if (!taskEntity) {
        return null;
      }

      // Find associated messages
      const messageEntities = await this.messageRepository.find({
        where: { taskId: taskId },
        order: { timestamp: 'ASC' },
      });

      // Convert entity to schema object
      const taskData: schema.Task & { agentId: string } = {
        id: taskEntity.id,
        agentId: taskEntity.agentId,
        status: parseJSON<TaskStatusData>(taskEntity.status, { state: 'unknown' }),
        artifacts: parseJSON<schema.Artifact[] | null>(taskEntity.artifacts || null, null),
        metadata: parseJSON<Record<string, unknown> | null>(taskEntity.metadata || null, null),
      };

      // Convert message entities to schema messages
      const history: schema.Message[] = messageEntities.map(message => ({
        role: message.role as 'user' | 'agent',
        parts: parseJSON<schema.Part[]>(message.parts, []),
        metadata: message.metadata ? parseJSON<Record<string, unknown>>(message.metadata, {}) : undefined,
      }));

      return { task: taskData, history };
    } catch (error) {
      console.error(`Failed to load task ${taskId} from database:`, error);
      return null;
    }
  }

  async save(data: TaskAndHistory): Promise<void> {
    const { task, history } = data;

    try {
      await this.dataSource.transaction(async transactionalEntityManager => {
        // Check if the specified agentId exists
        const agentExists = await transactionalEntityManager.findOne(AgentEntity, {
          where: { id: task.agentId },
        });

        if (!agentExists) {
          console.error(`Agent with ID "${task.agentId}" does not exist in the database`);
          throw new Error(`Foreign key constraint failed: Agent with ID "${task.agentId}" does not exist`);
        }

        // Check if task exists
        const existingTask = await transactionalEntityManager.findOne(TaskEntity, {
          where: { id: task.id },
        });

        // Create task entity
        const taskEntity = existingTask || new TaskEntity();
        taskEntity.id = task.id;
        taskEntity.agentId = task.agentId;
        taskEntity.state = task.status.state;
        taskEntity.status = JSON.stringify(task.status);
        taskEntity.artifacts = task.artifacts ? JSON.stringify(task.artifacts) : undefined;
        taskEntity.metadata = task.metadata ? JSON.stringify(task.metadata) : undefined;

        // Save task
        await transactionalEntityManager.save(taskEntity);

        // Delete existing messages
        if (existingTask) {
          await transactionalEntityManager.delete(TaskMessageEntity, { taskId: task.id });
        }

        // Save messages
        for (const message of history) {
          const messageEntity = new TaskMessageEntity();
          // 为每个消息生成唯一ID
          messageEntity.id = nanoid();
          messageEntity.task = taskEntity;
          messageEntity.role = message.role;
          messageEntity.parts = JSON.stringify(message.parts);
          messageEntity.metadata = message.metadata ? JSON.stringify(message.metadata) : undefined;

          await transactionalEntityManager.save(messageEntity);
        }
      });
    } catch (error) {
      console.error(`Failed to save task ${task.id} to database:`, error);
      throw new Error(`Failed to save task: ${(error as Error).message}`);
    }
  }

  async getAllTaskIds(): Promise<string[]> {
    try {
      const tasks = await this.taskRepository.find({
        select: ['id'],
      });
      return tasks.map(task => task.id);
    } catch (error) {
      console.error('Failed to get all task IDs from database:', error);
      return [];
    }
  }

  async getAllTasks(): Promise<(schema.Task & { agentId: string })[]> {
    try {
      const tasks = await this.taskRepository.find();

      return tasks.map(task => ({
        id: task.id,
        agentId: task.agentId,
        status: parseJSON<TaskStatusData>(task.status, { state: 'unknown' }),
        artifacts: parseJSON<schema.Artifact[] | null>(task.artifacts || null, null),
        metadata: parseJSON<Record<string, unknown> | null>(task.metadata || null, null),
      }));
    } catch (error) {
      console.error('Failed to get all tasks from database:', error);
      return [];
    }
  }

  async getTaskHistory(taskId: string): Promise<schema.Message[]> {
    try {
      const messages = await this.messageRepository.find({
        where: { taskId: taskId },
        order: { timestamp: 'ASC' },
      });

      return messages.map(message => ({
        role: message.role as 'user' | 'agent',
        parts: parseJSON<schema.Part[]>(message.parts, []),
        metadata: message.metadata ? parseJSON<Record<string, unknown>>(message.metadata, {}) : undefined,
      }));
    } catch (error) {
      console.error(`Failed to get history for task ${taskId} from database:`, error);
      return [];
    }
  }

  /**
   * Delete a task and all its related messages
   */
  async deleteTask(taskId: string): Promise<boolean> {
    try {
      await this.dataSource.transaction(async transactionalEntityManager => {
        // First delete all messages
        await transactionalEntityManager.delete(TaskMessageEntity, {
          taskId: taskId,
        });

        // Then delete the task
        const result = await transactionalEntityManager.delete(TaskEntity, {
          id: taskId,
        });

        const deleted = result.affected && result.affected > 0;
        if (deleted) {
          console.log(`Successfully deleted task ${taskId} from database`);
        } else {
          console.log(`No task found to delete with ID ${taskId}`);
        }

        return deleted;
      });
      return true;
    } catch (error) {
      console.error(`Failed to delete task ${taskId} from database:`, error);
      return false;
    }
  }
}
