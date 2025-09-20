import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type { Observable } from 'rxjs';

import { AgentChannel } from '@/constants/channels';
import { AgentDefinition } from '@services/agentDefinition/interface';
import { PromptConcatStreamState } from '@services/agentInstance/promptConcat/promptConcat';
import { AgentPromptDescription } from '@services/agentInstance/promptConcat/promptConcatSchema';

/**
 * Content of a session instance that user chat with an agent.
 * Inherits from AgentDefinition but makes handlerConfig optional to allow fallback.
 * The instance can override the definition's configuration, or fall back to using it.
 */
export interface AgentInstance extends Omit<AgentDefinition, 'name' | 'handlerConfig'> {
  /** Agent description ID that generates this instance */
  agentDefId: string;
  /** Session name, optional in instance unlike definition */
  name?: string;
  /** Agent handler's config - optional, falls back to AgentDefinition.handlerConfig if not set */
  handlerConfig?: Record<string, unknown>;
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
  /**
   * Indicates whether this agent instance is a preview instance used for testing during agent creation.
   * Preview instances are excluded from normal agent instance lists and should be cleaned up automatically.
   */
  volatile?: boolean;
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

  /** Creation time (converted from ISO string) */
  created?: Date;
  /** Last update time (converted from ISO string) */
  modified?: Date;
}

export interface AgentInstanceMessage {
  /** Message nano ID */
  id: string;
  agentId: string;
  /** Message role */
  role: 'user' | 'assistant' | 'agent' | 'tool' | 'error';
  /** Message content */
  content: string;
  /**
   * Reasoning or thinking content, separated from main content
   * Primarily used with DeepSeek which returns reasoning content separately
   */
  reasoning_content?: string;
  contentType?: string; // 'text/plain' | 'text/markdown' | 'text/html' | 'application/json' | 'application/json+ndjson';
  /** Creation time (converted from ISO string) */
  created?: Date;
  /** Last update time (converted from ISO string) */
  modified?: Date;
  /** Message metadata */
  metadata?: Record<string, unknown>;
  /** Whether this message should be hidden from UI/history (default: false) */
  hidden?: boolean;
  /**
   * Duration in rounds that this message should be included in AI context
   * When set to a number > 0, the message will only be sent to AI for that many rounds from current position
   * undefined/null means the message persists in AI context indefinitely (default behavior)
   * 0 means the message is excluded from AI context immediately but remains visible in UI
   */
  duration?: number | null;
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
   * For testing purposes, only initialize the built-in handlers without database
   */
  initializeHandlers(): Promise<void>;

  /**
   * Create a new agent instance from a definition
   * @param agentDefinitionID Agent definition ID, if not provided, will use the default agent
   * @param options Additional options for creating the agent instance
   */
  createAgent(agentDefinitionID?: string, options?: { preview?: boolean }): Promise<AgentInstance>;

  /**
   * Send a message or file to an agent instance, and put response to observables. Persistence and tool calling is handled by the plugins.
   * @param agentId Agent ID
   * @param messageText Message text
   * @param file File to upload
   */
  sendMsgToAgent(agentId: string, content: { text: string; file?: File }): Promise<void>;

  /**
   * Subscribe to agent instance updates
   * @param agentId Agent instance ID
   */
  subscribeToAgentUpdates(agentId: string): Observable<AgentInstance | undefined>;
  /**
   * Subscribe to agent instance message status updates
   * @param agentId Agent instance ID
   * @param messageId Message ID
   */
  subscribeToAgentUpdates(agentId: string, messageId: string): Observable<AgentInstanceLatestStatus | undefined>;

  /**
   * Get agent instance data by ID
   * @param agentId Agent instance ID
   */
  getAgent(agentId: string): Promise<AgentInstance | undefined>;

  /**
   * Update agent instance data
   * @param agentId Agent instance ID
   * @param data Updated data
   */
  updateAgent(agentId: string, data: Partial<AgentInstance>): Promise<AgentInstance>;

  /**
   * Delete agent instance and all its messages
   * @param agentId Agent instance ID
   */
  deleteAgent(agentId: string): Promise<void>;

  /**
   * Cancel current operations for agent instance
   * @param agentId Agent instance ID
   */
  cancelAgent(agentId: string): Promise<void>;

  /**
   * Get all agent instances with pagination and optional filters
   * Only return light-weight instance data without messages to avoid unnecessary payload.
   * @param page Page number
   * @param pageSize Number of items per page
   * @param options Filter options
   */
  getAgents(page: number, pageSize: number, options?: { closed?: boolean; searchName?: string }): Promise<Omit<AgentInstance, 'messages'>[]>;

  /**
   * Close agent instance without deleting it
   * @param agentId Agent instance ID
   */
  closeAgent(agentId: string): Promise<void>;

  /**
   * Pure function to concatenate prompts with given prompt description and messages
   * This is useful for front-end to generate prompts from configurations.
   * Returns an Observable stream that yields intermediate processing states and final result
   * @param promptDescription Configuration for prompt generation
   * @param messages Messages to be included in prompt generation
   * @returns Observable stream of processing states, with final state containing complete results
   */
  concatPrompt(promptDescription: Pick<AgentPromptDescription, 'handlerConfig'>, messages: AgentInstanceMessage[]): Observable<PromptConcatStreamState>;

  /**
   * Get JSON Schema for handler configuration
   * This allows frontend to generate a form based on the schema for a specific handler
   * @param handlerId Handler ID to get schema for
   * @returns JSON Schema for handler configuration
   */
  getHandlerConfigSchema(handlerId: string): Record<string, unknown>;

  /**
   * Save user message to database
   * Made public so plugins can use it for message persistence
   * @param userMessage User message to save
   */
  saveUserMessage(userMessage: AgentInstanceMessage): Promise<void>;

  /**
   * Debounced message update to reduce database writes
   * Made public so plugins can use it for UI updates
   * @param message Message to update
   * @param agentId Agent ID for status subscribers
   * @param debounceMs Debounce delay in milliseconds
   */
  debounceUpdateMessage(message: AgentInstanceMessage, agentId?: string, debounceMs?: number): void;
}

export const AgentInstanceServiceIPCDescriptor = {
  channel: AgentChannel.instance,
  properties: {
    cancelAgent: ProxyPropertyType.Function,
    closeAgent: ProxyPropertyType.Function,
    concatPrompt: ProxyPropertyType.Function$,
    createAgent: ProxyPropertyType.Function,
    deleteAgent: ProxyPropertyType.Function,
    getAgent: ProxyPropertyType.Function,
    getAgents: ProxyPropertyType.Function,
    getHandlerConfigSchema: ProxyPropertyType.Function,
    saveUserMessage: ProxyPropertyType.Function,
    sendMsgToAgent: ProxyPropertyType.Function,
    subscribeToAgentUpdates: ProxyPropertyType.Function$,
    updateAgent: ProxyPropertyType.Function,
  },
};
