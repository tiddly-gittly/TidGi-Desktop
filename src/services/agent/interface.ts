import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type { Observable } from 'rxjs';

import { AgentChannel } from '@/constants/channels';
import { AiAPIConfig } from './buildinAgentHandlers/promptConcatUtils/promptConcatSchema';

/**
 * Agent definition, including basic information and processing logic
 */
export interface AgentDefinition {
  /** Unique identifier for the agent */
  id: string;
  /** Agent name */
  name: string;
  /** Agent description */
  description?: string;
  /** Agent icon or avatar URL */
  avatarUrl?: string;
  /** Agent handler function's id, we will find function by this id */
  handlerID?: string;
  /** Agent handler's config, specific to the handler. */
  handlerConfig?: Record<string, unknown>;
  /**
   * Overwrite the default AI configuration for this agent.
   * Priority is higher than the global default agent config.
   */
  aiApiConfig?: Partial<AiAPIConfig>;
}

/**
 * Content of a session instance that user chat with an agent.
 */
export interface AgentInstance {
  id: string;
  /** Agent description ID that generates this instance */
  agentDefId: string;
  /** Session name */
  name?: string;
  /**
   * Message history.
   * latest on top, so it's easy to get first one as user's latest input, and rest as history.
   */
  messages: AgentInstanceMessage[];
  status: AgentInstanceLatestStatus;
  /** Session creation time (converted from ISO string) */
  created: Date;
  /**
   * Last update time (converted from ISO string).
   * We don't need `created` for message because it might be stream generated, we only care about its complete time.
   */
  modified?: Date;
  /**
   * Overwrite the default AI configuration for this agent instance.
   * Priority is higher than agent definition, and higher than default agent config.
   */
  aiApiConfig?: Partial<AiAPIConfig>;
  /**
   * Overwrite the default avatar URL from the agent definition.
   */
  avatarUrl?: string;
  /**
   * Indicates whether this agent instance is closed. Closed instances are not deleted from database
   * but are hidden from the default list and don't consume resources.
   */
  closed?: boolean;
}

/**
 * Represents the state of a task within the A2A protocol.
 * @description An enumeration.
 */
export type AgentInstanceState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'canceled'
  | 'failed'
  | 'unknown';

/**
 * Represents the status of a task at a specific point in time.
 */
export interface AgentInstanceLatestStatus {
  /**
   * The current state of the task.
   */
  state: AgentInstanceState;

  /**
   * An optional message associated with the current status (e.g., progress update, final response).
   * @default undefined
   */
  message?: AgentInstanceMessage;

  /** Last update time (converted from ISO string) */
  modified?: Date;
}

export interface AgentInstanceMessage {
  /** Message nano ID */
  id: string;
  agentId: string;
  /** Message role */
  role: 'user' | 'assistant' | 'agent';
  /** Message content */
  content: string;
  contentType?: string; // 'text/plain' | 'text/markdown' | 'text/html' | 'application/json' | 'application/json+ndjson';
  /** Last update time (converted from ISO string) */
  modified?: Date;
  /** Message metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Agent service to manage chat agents and chats
 */
export interface IAgentService {
  /**
   * Initialize the service on application startup.
   */
  initialize(): Promise<void>;
  /**
   * Create a new agent
   * @param agent Agent definition
   */
  createAgentDef(agent: AgentDefinition): Promise<AgentDefinition>;
  /**
   * Update an existing agent
   * @param agent Agent definition
   */
  updateAgentDef(agent: AgentDefinition): Promise<AgentDefinition>;
  /**
   * Get all available agents (simplified, without handler)
   */
  getAgentDefs(options?: { searchName?: string }): Promise<AgentDefinition[]>;
  /**
   * Get a specific agent. No id means get default agent that config in the preference.
   * @param id Agent ID
   */
  getAgentDef(id?: string): Promise<AgentDefinition | undefined>;
  deleteAgentDef(id: string): Promise<void>;

  /**
   * Create a new agent instance from an agent definition
   * @param agentDefinitionID Agent definition ID, if not provided, will use the default agent
   */
  createAgent(agentDefinitionID?: string): Promise<AgentInstance>;

  /**
   * Send a message or file to an agent instance.
   * @param agentId Agent ID
   * @param messageText Message text
   * @param file File to upload
   */
  sendMsgToAgent(agentId: string, content: { text: string; file?: File }): Promise<void>;
  /**
   * Subscribe to full streamed updates from an agent instance.
   * On every token generated, this will send full agent data to the subscriber.
   * @param agentId Agent instance ID
   */
  subscribeToAgentUpdates(agentId: string): Observable<AgentInstance | undefined>;
  subscribeToAgentUpdates(agentId: string, messageId: string): Observable<AgentInstanceLatestStatus | undefined>;
  /**
   * Get latest data of an agent instance.
   * @param agentId Agent instance ID
   */
  getAgent(agentId: string): Promise<AgentInstance | undefined>;
  updateAgent(agentId: string, data: Partial<AgentInstance>): Promise<AgentInstance>;
  deleteAgent(agentId: string): Promise<void>;
  cancelAgent(agentId: string): Promise<void>;
  /**
   * Get all agent instances with pagination
   * @param page Page number
   * @param pageSize Number of items per page
   */
  getAgents(page: number, pageSize: number, options?: { closed?: boolean; searchName?: string }): Promise<AgentInstance[]>;
  /**
   * Clean up subscriptions and cancel the agent, not deleting it, simply free the in-memory resources it uses.
   */
  closeAgent(agentId: string): Promise<void>;
}

export const AgentServiceIPCDescriptor = {
  channel: AgentChannel.name,
  properties: {
    createAgentDef: ProxyPropertyType.Function,
    updateAgentDef: ProxyPropertyType.Function,
    getAgentDefs: ProxyPropertyType.Function,
    getAgentDef: ProxyPropertyType.Function,
    deleteAgentDef: ProxyPropertyType.Function,
    createAgent: ProxyPropertyType.Function,
    sendMsgToAgent: ProxyPropertyType.Function,
    subscribeToAgentUpdates: ProxyPropertyType.Function$,
    getAgent: ProxyPropertyType.Function,
    updateAgent: ProxyPropertyType.Function,
    deleteAgent: ProxyPropertyType.Function,
    cancelAgent: ProxyPropertyType.Function,
    getAgents: ProxyPropertyType.Function,
    closeAgent: ProxyPropertyType.Function,
  },
};
