import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type { BehaviorSubject, Observable } from 'rxjs';

import { AgentChannel } from '@/constants/channels';
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
 * Agent session information
 */
export interface AgentSession {
  /** Session ID */
  id: string;
  /** Agent ID */
  agentId: string;
  /** Message history */
  messages: schema.Message[];
  /** Current session ID - used as reference to task in A2A protocol */
  currentSessionId: string;
  /** Session creation time */
  createdAt: Date;
  /** Last update time */
  updatedAt: Date;
}

/**
 * Agent request result
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
   * Get all available agents (simplified, without handler)
   */
  getAgents(): Promise<Omit<Agent, 'handler'>[]>;

  /**
   * Get a specific agent
   * @param id Agent ID
   */
  getAgent(id: string): Promise<Agent | undefined>;

  /**
   * Create a new session
   * @param agentId Agent ID
   */
  createSession(agentId: string): Promise<AgentSession>;

  /**
   * Send a message to a session
   * @param agentId Agent ID
   * @param sessionId Session ID
   * @param messageText Message text
   */
  sendMessage(agentId: string, sessionId: string, messageText: string): Promise<schema.JSONRPCResponse>;

  /**
   * Stream a message to a session and subscribe to results
   * @param agentId Agent ID
   * @param sessionId Session ID
   * @param messageText Message text
   */
  handleStreamingRequest(agentId: string, sessionId: string, messageText: string): Observable<schema.TaskStatusUpdateEvent | schema.TaskArtifactUpdateEvent>;

  /**
   * Get a specific session
   * @param sessionId Session ID
   */
  getSession(sessionId: string): Promise<AgentSession | undefined>;

  /**
   * Get all sessions for an agent
   * @param agentId Agent ID
   */
  getAgentSessions(agentId: string): Promise<AgentSession[]>;

  /**
   * Delete a session
   * @param agentId Agent ID
   * @param sessionId Session ID
   */
  deleteSession(agentId: string, sessionId: string): Promise<void>;

  /**
   * Start HTTP server
   * @param config Server configuration
   */
  startHttpServer(config: AgentServiceConfig): Promise<void>;

  /**
   * Stop HTTP server
   */
  stopHttpServer(): Promise<void>;

  /** Session updates stream - only includes changed sessions */
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
