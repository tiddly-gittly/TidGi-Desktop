import { CoreMessage } from 'ai';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type { Observable } from 'rxjs';

import { AgentChannel } from '@/constants/channels';
import { AgentDefinition } from '@services/agentDefinition/interface';
import { AgentPromptDescription, Prompt } from '@services/agentInstance/promptConcat/promptConcatSchema';

/**
 * Content of a session instance that user chat with an agent.
 * Extends AgentDefinition to inherit properties like handlerConfig,
 * which allows sharing configuration schema between definitions and instances.
 * This inheritance ensures that type safety is maintained when passing
 * handlerConfig between agent definitions and instances.
 */
export interface AgentInstance extends Omit<AgentDefinition, 'name'> {
  /** Agent description ID that generates this instance */
  agentDefId: string;
  /** Session name, optional in instance unlike definition */
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
  /**
   * Reasoning or thinking content, separated from main content
   * Primarily used with DeepSeek which returns reasoning content separately
   */
  reasoning_content?: string;
  contentType?: string; // 'text/plain' | 'text/markdown' | 'text/html' | 'application/json' | 'application/json+ndjson';
  /** Last update time (converted from ISO string) */
  modified?: Date;
  /** Message metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Agent instance service to manage chat instances and messages
 */
export interface IAgentInstanceService {
  /**
   * Initialize the service on application startup
   */
  initialize(): Promise<void>;

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

  /**
   * Update an agent instance
   * @param agentId Agent instance ID
   * @param data Updated data
   */
  updateAgent(agentId: string, data: Partial<AgentInstance>): Promise<AgentInstance>;

  /**
   * Delete an agent instance and all its messages
   * @param agentId Agent instance ID
   */
  deleteAgent(agentId: string): Promise<void>;

  /**
   * Cancel current operations for agent instance
   * @param agentId Agent instance ID
   */
  cancelAgent(agentId: string): Promise<void>;

  /**
   * Get all agent instances with pagination
   * @param page Page number
   * @param pageSize Number of items per page
   * @param options Filter options
   */
  getAgents(page: number, pageSize: number, options?: { closed?: boolean; searchName?: string }): Promise<AgentInstance[]>;

  /**
   * Clean up subscriptions and cancel the agent, not deleting it, simply free the in-memory resources it uses.
   * @param agentId Agent instance ID
   */
  closeAgent(agentId: string): Promise<void>;

  /**
   * Pure function to concatenate prompts with given prompt description and messages
   * This is useful for front-end to generate prompts from configurations.
   * @param promptDescription Configuration for prompt generation
   * @param messages Messages to be included in prompt generation
   * @returns Processed flat array of prompts and processed prompt tree
   */
  concatPrompt(promptDescription: Pick<AgentPromptDescription, 'promptConfig'>, messages: AgentInstanceMessage[]): Promise<{
    flatPrompts: CoreMessage[];
    processedPrompts: Prompt[];
  }>;

  /**
   * Get JSON Schema for handler configuration
   * This allows frontend to generate a form based on the schema for a specific handler
   * @param handlerId ID of the handler to get schema for
   * @returns JSON Schema for the handler configuration
   */
  getHandlerConfigSchema(handlerId: string): Promise<Record<string, unknown>>;
}

export const AgentInstanceServiceIPCDescriptor = {
  channel: AgentChannel.instance,
  properties: {
    cancelAgent: ProxyPropertyType.Function,
    closeAgent: ProxyPropertyType.Function,
    concatPrompt: ProxyPropertyType.Function,
    createAgent: ProxyPropertyType.Function,
    deleteAgent: ProxyPropertyType.Function,
    getAgent: ProxyPropertyType.Function,
    getAgents: ProxyPropertyType.Function,
    getHandlerConfigSchema: ProxyPropertyType.Function,
    sendMsgToAgent: ProxyPropertyType.Function,
    subscribeToAgentUpdates: ProxyPropertyType.Function$,
    updateAgent: ProxyPropertyType.Function,
  },
};
