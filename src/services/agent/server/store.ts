import { DataSource, Repository } from 'typeorm';
import * as schema from './schema';
import { SessionEntity, SessionMessageEntity } from '@services/database/schema/agent';

// Helper type for the simplified store
export interface SessionAndHistory {
  session: schema.Task & { agentId: string };
  history: schema.Message[];
}

// Rename for compatibility
export type TaskAndHistory = SessionAndHistory;

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
 * Session storage interface (renamed from TaskStore)
 */
export interface SessionStore {
  /**
   * Save session and its related history
   */
  save(data: SessionAndHistory): Promise<void>;

  /**
   * Load session and its history
   */
  load(sessionId: string): Promise<SessionAndHistory | null>;

  /**
   * Get all session IDs
   */
  getAllSessionIds(): Promise<string[]>;

  /**
   * Get all sessions
   */
  getAllSessions(): Promise<(schema.Task & { agentId: string })[]>;

  /**
   * Get history for a session
   */
  getSessionHistory(sessionId: string): Promise<schema.Message[]>;
}

// For compatibility
export interface TaskStore extends SessionStore {
  getAllTaskIds(): Promise<string[]>;
  getAllTasks(): Promise<(schema.Task & { agentId: string })[]>;
  getTaskHistory(taskId: string): Promise<schema.Message[]>;
}

/**
 * SQLite implementation of session store using TypeORM
 */
export class SQLiteSessionStore implements SessionStore, TaskStore {
  private dataSource: DataSource;
  private sessionRepository: Repository<SessionEntity>;
  private messageRepository: Repository<SessionMessageEntity>;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
    this.sessionRepository = dataSource.getRepository(SessionEntity);
    this.messageRepository = dataSource.getRepository(SessionMessageEntity);
  }

  async load(sessionId: string): Promise<SessionAndHistory | null> {
    try {
      // Find session by ID
      const sessionEntity = await this.sessionRepository.findOne({ 
        where: { id: sessionId },
        relations: ['agent'] // 加载关联的agent实体
      });
      
      if (!sessionEntity) {
        return null;
      }

      // Find associated messages
      const messageEntities = await this.messageRepository.find({
        where: { sessionId: sessionId },
        order: { timestamp: 'ASC' }
      });

      // Convert entity to schema object
      const sessionData: schema.Task & { agentId: string } = {
        id: sessionEntity.id,
        agentId: sessionEntity.agentId,
        status: parseJSON<TaskStatusData>(sessionEntity.status, { state: 'unknown' }),
        artifacts: parseJSON<schema.Artifact[] | null>(sessionEntity.artifacts || null, null),
        metadata: parseJSON<Record<string, unknown> | null>(sessionEntity.metadata || null, null),
      };

      // Convert message entities to schema messages
      const history: schema.Message[] = messageEntities.map(message => ({
        role: message.role as 'user' | 'agent',
        parts: parseJSON<schema.Part[]>(message.parts, []),
        metadata: message.metadata ? parseJSON<Record<string, unknown>>(message.metadata, {}) : undefined,
      }));

      return { session: sessionData, history };
    } catch (error) {
      console.error(`Failed to load session ${sessionId} from database:`, error);
      return null;
    }
  }

  async save(data: SessionAndHistory): Promise<void> {
    const { session, history } = data;

    try {
      await this.dataSource.transaction(async transactionalEntityManager => {
        // 检查指定的agentId是否存在
        const agentExists = await transactionalEntityManager.findOne('agents', {
          where: { id: session.agentId }
        });

        if (!agentExists) {
          console.error(`Agent with ID "${session.agentId}" does not exist in the database`);
          throw new Error(`Foreign key constraint failed: Agent with ID "${session.agentId}" does not exist`);
        }

        // Check if session exists
        const existingSession = await transactionalEntityManager.findOne(SessionEntity, {
          where: { id: session.id }
        });

        // Create session entity
        const sessionEntity = existingSession || new SessionEntity();
        sessionEntity.id = session.id;
        sessionEntity.agentId = session.agentId;
        sessionEntity.state = session.status.state;
        sessionEntity.status = JSON.stringify(session.status);
        sessionEntity.artifacts = session.artifacts ? JSON.stringify(session.artifacts) : null;
        sessionEntity.metadata = session.metadata ? JSON.stringify(session.metadata) : null;

        // Save session
        await transactionalEntityManager.save(sessionEntity);

        // Delete existing messages
        if (existingSession) {
          await transactionalEntityManager.delete(SessionMessageEntity, { sessionId: session.id });
        }

        // Save messages
        for (const message of history) {
          const messageEntity = new SessionMessageEntity();
          messageEntity.sessionId = session.id; // 修改: 使用sessionId替代taskId
          messageEntity.role = message.role;
          messageEntity.parts = JSON.stringify(message.parts);
          messageEntity.metadata = message.metadata ? JSON.stringify(message.metadata) : null;
          
          await transactionalEntityManager.save(messageEntity);
        }
      });
    } catch (error) {
      console.error(`Failed to save session ${session.id} to database:`, error);
      throw new Error(`Failed to save session: ${(error as Error).message}`);
    }
  }

  async getAllSessionIds(): Promise<string[]> {
    try {
      const sessions = await this.sessionRepository.find({
        select: ['id']
      });
      return sessions.map(session => session.id);
    } catch (error) {
      console.error('Failed to get all session IDs from database:', error);
      return [];
    }
  }

  async getAllSessions(): Promise<(schema.Task & { agentId: string })[]> {
    try {
      const sessions = await this.sessionRepository.find();
      
      return sessions.map(session => ({
        id: session.id,
        agentId: session.agentId,
        status: parseJSON<TaskStatusData>(session.status, { state: 'unknown' }),
        artifacts: parseJSON<schema.Artifact[] | null>(session.artifacts || null, null),
        metadata: parseJSON<Record<string, unknown> | null>(session.metadata || null, null),
      }));
    } catch (error) {
      console.error('Failed to get all sessions from database:', error);
      return [];
    }
  }

  async getSessionHistory(sessionId: string): Promise<schema.Message[]> {
    try {
      const messages = await this.messageRepository.find({
        where: { sessionId: sessionId }, // 修改: 使用sessionId替代taskId
        order: { timestamp: 'ASC' }
      });
      
      return messages.map(message => ({
        role: message.role as 'user' | 'agent',
        parts: parseJSON<schema.Part[]>(message.parts, []),
        metadata: message.metadata ? parseJSON<Record<string, unknown>>(message.metadata, {}) : undefined,
      }));
    } catch (error) {
      console.error(`Failed to get history for session ${sessionId} from database:`, error);
      return [];
    }
  }

  // Compatibility methods
  getAllTaskIds(): Promise<string[]> {
    return this.getAllSessionIds();
  }

  getAllTasks(): Promise<(schema.Task & { agentId: string })[]> {
    return this.getAllSessions();
  }

  getTaskHistory(taskId: string): Promise<schema.Message[]> {
    return this.getSessionHistory(taskId);
  }
}

// Replace the existing SQLiteTaskStore with our renamed store
export const SQLiteTaskStore = SQLiteSessionStore;
