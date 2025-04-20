import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type { BehaviorSubject, Observable } from 'rxjs';

import { AgentChannel } from '@/constants/channels';
import { AiAPIConfig } from './defaultAgents/schemas';
import { TaskHandler } from './server/handler';
import * as schema from './server/schema';

/**
 * Agent definition, including basic information and processing logic
 */
export interface Agent {
  /** Unique identifier for the agent */
  id: string;
  /** Agent name */
  name: string;
  /** Agent description */
  description?: string;
  /** Agent icon or avatar URL */
  avatarUrl?: string;
  /** Agent handler function */
  handler: TaskHandler;
  /** Agent feature card */
  card?: schema.AgentCard;
}

/**
 * Agent service configuration
 */
export interface AgentServiceConfig {
  /** Whether to enable HTTP server */
  enableHttpServer?: boolean;
  /** HTTP server port */
  httpServerPort?: number;
  /** HTTP server base path */
  httpServerBasePath?: string;
}

/**
 * Agent task information - adapted from schema.Task with UI-specific additions
 */
export interface AgentTask extends Omit<schema.Task, 'artifacts'> {
  /** Agent ID that owns this task */
  agentId: string;
  /** Task name */
  name?: string;
  /** Message history */
  messages: schema.Message[];
  /** Task creation time (converted from ISO string) */
  createdAt: Date;
  /** Last update time (converted from ISO string) */
  updatedAt: Date;
  /** Optional artifacts */
  artifacts?: schema.Artifact[] | null;
}

/**
 * Agent request result
 */
export interface AgentRequestResult<T = any> {
  data?: T;
  error?: Error;
}

/**
 * Agent service to manage chat agents and tasks
 */
export interface IAgentService {
  /**
   * Get all available agents (simplified, without handler)
   */
  getAgents(): Promise<Omit<Agent, 'handler'>[]>;

  /**
   * Get a specific agent
   * @param id Agent ID
   */
  getAgent(id: string): Promise<Agent | undefined>;

  /**
   * Create a new task (session)
   * @param agentId Agent ID
   */
  createTask(agentId: string): Promise<AgentTask>;

  /**
   * Send a message to a task
   * @param agentId Agent ID
   * @param taskId Task ID
   * @param messageText Message text
   */
  sendMessage(agentId: string, taskId: string, messageText: string): Promise<schema.JSONRPCResponse>;

  /**
   * Stream a message to a task and subscribe to results
   * @param agentId Agent ID
   * @param taskId Task ID
   * @param messageText Message text
   */
  handleStreamingRequest(agentId: string, taskId: string, messageText: string): Observable<schema.TaskStatusUpdateEvent | schema.TaskArtifactUpdateEvent>;

  /**
   * Get a specific task
   * @param taskId Task ID
   */
  getTask(taskId: string): Promise<AgentTask | undefined>;

  /**
   * Get all tasks for an agent
   * @param agentId Agent ID
   */
  getAgentTasks(agentId: string): Promise<AgentTask[]>;

  /**
   * Delete a task
   * @param agentId Agent ID
   * @param taskId Task ID
   */
  deleteTask(agentId: string, taskId: string): Promise<void>;

  /**
   * Start HTTP server
   * @param config Server configuration
   */
  startHttpServer(config: AgentServiceConfig): Promise<void>;

  /**
   * Stop HTTP server
   */
  stopHttpServer(): Promise<void>;

  /** Task updates stream - only includes changed tasks */
  taskUpdates$: BehaviorSubject<Record<string, AgentTask | null>>;

  /**
   * Get default agent ID
   */
  getDefaultAgentId(): Promise<string | undefined>;

  /**
   * 根据任务ID和代理ID获取AI配置
   * 级联获取: task -> agent -> global defaults
   * @param taskId 可选的任务ID
   * @param agentId 可选的代理ID（如果提供了taskId，可以不提供）
   * @returns 合并后的AI配置
   */
  getAIConfigByIds(taskId?: string, agentId?: string): Promise<AiAPIConfig>;

  /**
   * Update agent-specific AI configuration
   */
  updateAgentAIConfig(agentId: string, config: Partial<AiAPIConfig>): Promise<void>;

  /**
   * Update task-specific AI configuration
   */
  updateTaskAIConfig(taskId: string, config: Partial<AiAPIConfig>): Promise<void>;
}

export const AgentServiceIPCDescriptor = {
  channel: AgentChannel.name,
  properties: {
    getAgents: ProxyPropertyType.Function,
    getAgent: ProxyPropertyType.Function,
    createTask: ProxyPropertyType.Function, // 原 createSession
    sendMessage: ProxyPropertyType.Function,
    handleStreamingRequest: ProxyPropertyType.Function$,
    getTask: ProxyPropertyType.Function, // 原 getSession
    getAgentTasks: ProxyPropertyType.Function, // 原 getAgentSessions
    deleteTask: ProxyPropertyType.Function, // 原 deleteSession
    startHttpServer: ProxyPropertyType.Function,
    stopHttpServer: ProxyPropertyType.Function,
    taskUpdates$: ProxyPropertyType.Value$, // 原 sessionUpdates$
    getDefaultAgentId: ProxyPropertyType.Function,
    getAIConfigByIds: ProxyPropertyType.Function,
    updateAgentAIConfig: ProxyPropertyType.Function,
    updateTaskAIConfig: ProxyPropertyType.Function,
  },
};
