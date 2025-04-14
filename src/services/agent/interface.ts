import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type { BehaviorSubject, Observable } from 'rxjs';

import { AgentChannel } from '@/constants/channels';
import { TaskHandler } from './server/handler';
import * as schema from './server/schema';

/**
 * 智能体定义，包含智能体的基本信息和处理逻辑
 */
export interface Agent {
  /** 智能体唯一标识符 */
  id: string;
  /** 智能体名称 */
  name: string;
  /** 智能体描述 */
  description?: string;
  /** 智能体图标或头像URL */
  avatarUrl?: string;
  /** 智能体处理器函数 */
  handler: TaskHandler;
  /** 智能体特性卡片 */
  card?: schema.AgentCard;
}

/**
 * 智能体服务配置
 */
export interface AgentServiceConfig {
  /** 是否启用HTTP服务器 */
  enableHttpServer?: boolean;
  /** HTTP服务器端口 */
  httpServerPort?: number;
  /** HTTP服务基础路径 */
  httpServerBasePath?: string;
}

/**
 * 智能体会话信息
 */
export interface AgentSession {
  /** 会话ID */
  id: string;
  /** 智能体ID */
  agentId: string;
  /** 消息历史 */
  messages: schema.Message[];
  /** 当前任务ID */
  currentTaskId?: string;
  /** 会话创建时间 */
  createdAt: Date;
  /** 上次更新时间 */
  updatedAt: Date;
}

/**
 * 智能体请求结果
 */
export interface AgentRequestResult<T = any> {
  data?: T;
  error?: Error;
}

/**
 * Agent service to manage chat agents and service agents
 */
export interface IAgentService {
  /**
   * 获取所有可用智能体列表（简化版，不包含handler）
   */
  getAgents(): Promise<Omit<Agent, 'handler'>[]>;

  /**
   * 获取指定智能体
   * @param id 智能体ID
   */
  getAgent(id: string): Promise<Agent | undefined>;

  /**
   * 创建新会话
   * @param agentId 智能体ID
   */
  createSession(agentId: string): Promise<AgentSession>;

  /**
   * 发送消息到会话
   * @param agentId 智能体ID
   * @param sessionId 会话ID
   * @param messageText 消息文本
   */
  sendMessage(agentId: string, sessionId: string, messageText: string): Promise<schema.JSONRPCResponse>;

  /**
   * 流式发送消息到会话并订阅结果
   * @param agentId 智能体ID
   * @param sessionId 会话ID
   * @param messageText 消息文本
   */
  handleStreamingRequest(agentId: string, sessionId: string, messageText: string): Observable<schema.TaskStatusUpdateEvent | schema.TaskArtifactUpdateEvent>;

  /**
   * 获取指定会话
   * @param sessionId 会话ID
   */
  getSession(sessionId: string): Promise<AgentSession | undefined>;

  /**
   * 获取智能体的所有会话
   * @param agentId 智能体ID
   */
  getAgentSessions(agentId: string): Promise<AgentSession[]>;

  /**
   * 删除会话
   * @param agentId 智能体ID
   * @param sessionId 会话ID
   */
  deleteSession(agentId: string, sessionId: string): Promise<void>;

  /**
   * 启动HTTP服务器
   * @param config 服务器配置
   */
  startHttpServer(config: AgentServiceConfig): Promise<void>;

  /**
   * 停止HTTP服务器
   */
  stopHttpServer(): Promise<void>;

  /** 会话更新流 - 只包含变更的会话 */
  sessionUpdates$: BehaviorSubject<Record<string, AgentSession>>;
}

export const AgentServiceIPCDescriptor = {
  channel: AgentChannel.name,
  properties: {
    getAgents: ProxyPropertyType.Function,
    getAgent: ProxyPropertyType.Function,
    createSession: ProxyPropertyType.Function,
    sendMessage: ProxyPropertyType.Function,
    handleStreamingRequest: ProxyPropertyType.Function$,
    getSession: ProxyPropertyType.Function,
    getAgentSessions: ProxyPropertyType.Function,
    deleteSession: ProxyPropertyType.Function,
    startHttpServer: ProxyPropertyType.Function,
    stopHttpServer: ProxyPropertyType.Function,
    sessionUpdates$: ProxyPropertyType.Value$,
  },
};
