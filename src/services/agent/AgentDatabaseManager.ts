import { nanoid } from 'nanoid';
import { DataSource, Repository } from 'typeorm';

import { AgentEntity, TaskEntity, TaskMessageEntity } from '@services/database/schema/agent';
import { logger } from '@services/libs/log';
import { AgentConfigSchema, AgentPromptDescription, AiAPIConfig } from './defaultAgents/schemas';
import * as schema from './server/schema';

/**
 * Manages all database operations for agent service
 */
export class AgentDatabaseManager {
  private dataSource: DataSource;
  private agentRepository: Repository<AgentEntity>;
  private taskRepository: Repository<TaskEntity>;
  private messageRepository: Repository<TaskMessageEntity>;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
    this.agentRepository = this.dataSource.getRepository(AgentEntity);
    this.taskRepository = this.dataSource.getRepository(TaskEntity);
    this.messageRepository = this.dataSource.getRepository(TaskMessageEntity);
  }

  /**
   * Get the data source
   */
  getDataSource(): DataSource {
    return this.dataSource;
  }

  /**
   * Save agent to database
   */
  async saveAgent(agent: {
    id: string;
    name: string;
    description?: string;
    avatarUrl?: string;
    card?: schema.AgentCard;
    aiConfig?: AgentPromptDescription;
  }): Promise<AgentEntity> {
    try {
      // Check if agent already exists
      const existingAgent = await this.agentRepository.findOne({ where: { id: agent.id } });

      const agentToSave: Partial<AgentEntity> = {
        id: agent.id,
        name: agent.name,
        description: agent.description || null,
        avatarUrl: agent.avatarUrl || null,
        card: agent.card ? JSON.stringify(agent.card) : null,
        aiConfig: agent.aiConfig ? JSON.stringify(agent.aiConfig) : null,
      };

      if (existingAgent) {
        // Update existing agent
        Object.assign(existingAgent, agentToSave);
        return await this.agentRepository.save(existingAgent);
      } else {
        // Create new agent
        return await this.agentRepository.save(agentToSave);
      }
    } catch (error) {
      logger.error(`Failed to save agent ${agent.id} to database:`, error);
      throw error;
    }
  }

  /**
   * Get agent from database
   */
  async getAgent(agentId: string): Promise<AgentEntity | null> {
    try {
      return await this.agentRepository.findOne({ where: { id: agentId } });
    } catch (error) {
      logger.error(`Failed to get agent ${agentId} from database:`, error);
      return null;
    }
  }

  /**
   * Get all agents from database
   */
  async getAllAgents(): Promise<AgentEntity[]> {
    try {
      return await this.agentRepository.find();
    } catch (error) {
      logger.error('Failed to get all agents from database:', error);
      return [];
    }
  }

  /**
   * Get AI configuration for an agent
   */
  async getAgentAIConfig(agentId: string): Promise<AgentPromptDescription | null> {
    try {
      const agent = await this.agentRepository.findOne({ where: { id: agentId } });

      if (agent && agent.aiConfig) {
        // 直接让 Zod 处理类型验证和转换，不需要额外的类型断言
        return AgentConfigSchema.parse(JSON.parse(agent.aiConfig));
      }

      return null;
    } catch (error) {
      logger.error(`Failed to get AI config for agent ${agentId}:`, error);
      return null;
    }
  }

  /**
   * Update agent AI configuration
   */
  async updateAgentAIConfig(agentId: string, config: Partial<AgentPromptDescription>): Promise<void> {
    try {
      const agent = await this.agentRepository.findOne({ where: { id: agentId } });
      
      if (!agent) {
        throw new Error(`Agent with ID ${agentId} not found`);
      }
      
      // Parse existing configuration
      let currentConfig: Partial<AgentPromptDescription> = {};
      if (agent.aiConfig) {
        try {
          // 使用 JSON.parse 并进行类型断言 - 这里需要断言因为我们只关心部分配置
          currentConfig = JSON.parse(agent.aiConfig) as Partial<AgentPromptDescription>;
        } catch (parseError) {
          logger.error(`Failed to parse existing agent AI config: ${parseError}`);
          // Continue with empty config if parsing fails
        }
      }
      
      // Merge configurations
      const mergedConfig = {
        ...currentConfig,
        ...config,
        // Handle nested objects separately
        api: {
          ...(currentConfig.api || {}),
          ...(config.api || {}),
        },
        modelParameters: {
          ...(currentConfig.modelParameters || {}),
          ...(config.modelParameters || {}),
        },
        promptConfig: {
          ...(currentConfig.promptConfig || {}),
          ...(config.promptConfig || {}),
          prompts: [
            ...(currentConfig.promptConfig?.prompts || []),
            ...(config.promptConfig?.prompts || []),
          ],
        },
      };
      
      // Save updated configuration
      agent.aiConfig = JSON.stringify(mergedConfig);
      await this.agentRepository.save(agent);
      
      logger.info(`Updated AI config for agent ${agentId}`);
    } catch (error) {
      logger.error(`Failed to update AI config for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Create a task record in database
   */
  async createTask(agentId: string): Promise<TaskEntity> {
    try {
      // Generate task ID
      const taskId = nanoid();

      // Create task object
      const now = new Date();
      const task: Partial<TaskEntity> = {
        id: taskId,
        agentId,
        state: 'submitted',
        status: JSON.stringify({
          state: 'submitted',
          timestamp: now.toISOString(),
        }),
        createdAt: now,
        updatedAt: now,
      };

      return await this.taskRepository.save(task);
    } catch (error) {
      logger.error(`Failed to create task for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Get task from database
   */
  async getTask(taskId: string): Promise<TaskEntity | null> {
    try {
      return await this.taskRepository.findOne({
        where: { id: taskId },
        relations: ['agent'], // Include agent relation
      });
    } catch (error) {
      logger.error(`Failed to get task ${taskId} from database:`, error);
      return null;
    }
  }

  /**
   * Get all tasks for an agent
   */
  async getAgentTasks(agentId: string): Promise<TaskEntity[]> {
    try {
      return await this.taskRepository.find({
        where: { agentId },
        order: { updatedAt: 'DESC' },
      });
    } catch (error) {
      logger.error(`Failed to get tasks for agent ${agentId}:`, error);
      return [];
    }
  }

  /**
   * Update task in database
   */
  async updateTask(taskId: string, update: Partial<TaskEntity>): Promise<TaskEntity | null> {
    try {
      const task = await this.taskRepository.findOne({ where: { id: taskId } });

      if (!task) {
        logger.warn(`Task ${taskId} not found for update`);
        return null;
      }

      // Apply updates
      Object.assign(task, update);
      task.updatedAt = new Date();

      return await this.taskRepository.save(task);
    } catch (error) {
      logger.error(`Failed to update task ${taskId}:`, error);
      return null;
    }
  }

  /**
   * Delete task from database
   */
  async deleteTask(taskId: string): Promise<boolean> {
    try {
      // First delete all messages
      await this.messageRepository.delete({ taskId });

      // Then delete the task
      const result = await this.taskRepository.delete({ id: taskId });

      return result.affected !== undefined && result.affected > 0;
    } catch (error) {
      logger.error(`Failed to delete task ${taskId}:`, error);
      return false;
    }
  }

  /**
   * Get task messages from database
   */
  async getTaskMessages(taskId: string): Promise<TaskMessageEntity[]> {
    try {
      return await this.messageRepository.find({
        where: { taskId },
        order: { timestamp: 'ASC' },
      });
    } catch (error) {
      logger.error(`Failed to get messages for task ${taskId}:`, error);
      return [];
    }
  }

  /**
   * Save message to database
   */
  async saveMessage(taskId: string, message: {
    role: string;
    parts: schema.MessagePart[];
    metadata?: Record<string, unknown>;
  }): Promise<TaskMessageEntity | null> {
    try {
      const messageEntity: Partial<TaskMessageEntity> = {
        id: nanoid(),
        taskId,
        role: message.role,
        parts: JSON.stringify(message.parts),
        metadata: message.metadata ? JSON.stringify(message.metadata) : null,
        timestamp: new Date(),
      };

      return await this.messageRepository.save(messageEntity);
    } catch (error) {
      logger.error(`Failed to save message for task ${taskId}:`, error);
      return null;
    }
  }

  /**
   * Get the latest task based on activity
   */
  async getLatestTask(): Promise<TaskEntity | null> {
    try {
      return await this.taskRepository
        .createQueryBuilder('task')
        .innerJoinAndSelect('task.agent', 'agent')
        .orderBy('task.updatedAt', 'DESC')
        .take(1)
        .getOne();
    } catch (error) {
      logger.error('Failed to get latest task:', error);
      return null;
    }
  }

  /**
   * Get default agent ID based on latest activity
   */
  async getDefaultAgentId(): Promise<string | undefined> {
    try {
      // First try to get agent ID from latest task
      const latestTask = await this.getLatestTask();
      if (latestTask) {
        return latestTask.agentId;
      }

      // If no tasks found, get most recently created agent
      const agent = await this.agentRepository
        .createQueryBuilder('agent')
        .orderBy('agent.createdAt', 'DESC')
        .take(1)
        .getOne();

      return agent?.id;
    } catch (error) {
      logger.error('Failed to get default agent ID:', error);
      return undefined;
    }
  }

  /**
   * Get AI configuration cascade based on task and agent IDs
   */
  async getAIConfigCascade(taskId?: string, agentId?: string): Promise<{
    taskConfig: Partial<AiAPIConfig> | null;
    agentConfig: Partial<AgentPromptDescription> | null;
    effectiveAgentId: string | undefined;
  }> {
    try {
      let taskConfig: Partial<AiAPIConfig> | null = null;
      let agentConfig: Partial<AgentPromptDescription> | null = null;
      let effectiveAgentId = agentId;

      // If task ID provided, get task config and agent ID
      if (taskId) {
        const task = await this.getTask(taskId);

        if (task) {
          effectiveAgentId = task.agentId;

          if (task.aiConfig) {
            try {
              taskConfig = JSON.parse(task.aiConfig) as Partial<AiAPIConfig>;
            } catch (parseError) {
              logger.error(`Failed to parse task AI config for ${taskId}:`, parseError);
            }
          }
        }
      }

      // If we have an agent ID (either provided or from task), get agent config
      if (effectiveAgentId) {
        const agent = await this.getAgent(effectiveAgentId);

        if (agent?.aiConfig) {
          try {
            agentConfig = JSON.parse(agent.aiConfig) as Partial<AgentPromptDescription>;
          } catch (parseError) {
            logger.error(`Failed to parse agent AI config for ${effectiveAgentId}:`, parseError);
          }
        }
      }

      return { taskConfig, agentConfig, effectiveAgentId };
    } catch (error) {
      logger.error('Failed to get AI config cascade:', error);
      return { taskConfig: null, agentConfig: null, effectiveAgentId: undefined };
    }
  }

  /**
   * Update task-specific AI configuration
   */
  async updateTaskAIConfig(taskId: string, config: Partial<AiAPIConfig>): Promise<void> {
    try {
      const task = await this.getTask(taskId);

      if (!task) {
        throw new Error(`Task with ID ${taskId} not found`);
      }

      // Parse existing configuration
      let currentConfig: Partial<AiAPIConfig> = {};
      if (task.aiConfig) {
        try {
          currentConfig = JSON.parse(task.aiConfig) as Partial<AiAPIConfig>;
        } catch (parseError) {
          logger.error(`Failed to parse existing task AI config for ${taskId}:`, parseError);
        }
      }

      // Merge configurations
      const mergedConfig = {
        ...currentConfig,
        ...config,
        // Handle nested objects separately
        api: {
          ...(currentConfig.api || {}),
          ...(config.api || {}),
        },
        modelParameters: {
          ...(currentConfig.modelParameters || {}),
          ...(config.modelParameters || {}),
        },
      };

      // Save updated configuration
      task.aiConfig = JSON.stringify(mergedConfig);
      await this.taskRepository.save(task);

      logger.info(`Updated AI config for task ${taskId}`);
    } catch (error) {
      logger.error(`Failed to update AI config for task ${taskId}:`, error);
      throw error;
    }
  }
}
