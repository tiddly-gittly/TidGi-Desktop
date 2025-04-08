import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { ReactElement } from 'react';
import type { BehaviorSubject } from 'rxjs';
import type { ITiddlerFields } from 'tiddlywiki';

import { WorkflowChannel } from '@/constants/channels';
import { IWorkspaceWithMetadata } from '@services/workspaces/interface';

/**
 * Represents the state machine execution state of a callback, not including the result, results that is valuable to user should be stored in UIElementState.content.
 */
export interface IExecutionState {
  /** The callback method name */
  method: string;
  state: 'running' | 'success' | 'error';
  /** The execution state of this callback, may based on xstate's serialized state */
  fullState: unknown;
}

/**
 * All state from database to restore an agent's back to alive.
 */
export interface AgentState {
  /** Chat items created during a chat and persisted execution result. */
  ui?: Session;
  /** All callback's execution states, key is callback method name, value is array of state machine serialized state, because callback might execute multiple times. */
  execution?: Record<string, IExecutionState[]>;
  /** Session id */
  id: string;
  /** Session title */
  title?: string;
  /** Created timestamp */
  createdAt?: Date;
  /** Updated timestamp */
  updatedAt?: Date;
  /** Conversation history list */
  conversations?: Conversation[];
  /** AI session configuration */
  aiConfig?: AISessionConfig;
}

export interface ConversationSource {
  /** URL of the source, if applicable */
  url?: string;
  /** Title or description of the source */
  title?: string;
  /** Image URL of the source, if applicable. */
  image?: string;
}

export interface ConversationFile {
  /** Name of the file */
  name: string;
  /** Type of the file */
  type?: string;
  /** Size of the file */
  size?: number;
  /** URL of the file */
  url?: string;
}

export interface Template {
  /** Unique identifier for the template */
  id: string;
  /** Title of the template */
  title: string;
  /** Message to be sent when template is selected */
  message: string;
  /** Icon to display next to the template */
  icon?: ReactElement;
}

/**
 * reachat's conversation object type. We follow its standard.
 */
export interface Conversation {
  /** Unique identifier for the conversation */
  id: string;
  /** Date and time when the conversation was created */
  createdAt: Date;
  /** Date and time when the conversation was last updated */
  updatedAt?: Date;
  /** The user's question or input that initiated the conversation */
  question: string;
  /** The AI's response to the user's question */
  response?: string;
  /** Array of sources referenced in the conversation */
  sources?: ConversationSource[];
  /** Array of file paths or identifiers associated with the conversation */
  files?: ConversationFile[];
}

/**
 * reachat's session object type. We follow its standard.
 */
export interface Session {
  /** Unique identifier for the session */
  id: string;
  /** Title of the session */
  title?: string;
  /** Date and time when the session was created */
  createdAt?: Date;
  /** Date and time when the session was last updated */
  updatedAt?: Date;
  /** Array of conversations within this session */
  conversations: Conversation[];
}

/**
 * Base interface for agent definition
 */
export interface IAgentDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  /** URL to icon image */
  icon?: string;
  /** URI pointing to callback definition, could be remote URL or local file */
  callbackURI?: string;
}

/**
 * Chat agent handles conversations with users
 * ChatAgent - Conversation-based agent
 * Chinese name: Conversation Assistant, directly indicates basic chat functionality with low user cognitive cost
 * Use case: Immediate interaction scenarios
 */
export interface IChatAgentDefinition extends IAgentDefinition {
  type: 'chat';
  /** URI pointing to message handler callback */
  onUserSendMessageURI: string;
  /** Optional URIs to additional callbacks */
  callbacks?: {
    onInit?: string;
    onExit?: string;
    onError?: string;
  };
  /** Default system prompt or configuration */
  defaultSystemPrompt?: string;
  /** Model configuration */
  modelConfig?: {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
}

/**
 * Service agent performs scheduled or event-triggered tasks
 * RoutineAgent - Task-oriented agent
 * Chinese name: Task Manager, "Manager" emphasizes automated service nature more than "Agent"
 * Use case: Scheduled tasks/automated processing
 */
export interface IRoutineAgentDefinition extends IAgentDefinition {
  type: 'routine';
  callbacks: {
    /** Main execution callback */
    onExecute: string;
    /** Triggered at scheduled intervals */
    onSchedule?: string;
    /** Triggered on specific events */
    onEvent?: string;
    onInit?: string;
    onExit?: string;
    onError?: string;
  };
  schedule?: {
    /** Cron expression or interval in ms */
    interval?: string | number;
    /** Random execution between min and max interval */
    randomInterval?: { min: number; max: number };
  };
  /** Event types this agent listens to */
  listenEvents?: string[];
}

export type AgentDefinition = IChatAgentDefinition | IRoutineAgentDefinition;

export interface IChatTiddler extends ITiddlerFields {
  description: string;
  ['page-cover']: string;
  type: 'application/json';
  /** Which agent creates this chat */
  agentID: string;
}

export interface IChatListItem {
  /** Serialized JSON of the SingleChatState.
   * We store the chat as a JSON tiddler in the wiki, and render the content i18nly from the JSON data */
  chatJSONString?: string;
  description?: string;
  /** Random generated ID */
  id: string;
  image?: string;
  metadata?: {
    tiddler: IChatTiddler;
    workspace: IWorkspaceWithMetadata;
  };
  running?: boolean;
  tags: string[];
  /** From caption field, or use ID */
  title: string;
  agentID: string;
  workspaceID: string;
}

/**
 * AI message interface for external AI API communication
 */
export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * AI streaming response status interface
 */
export interface AIStreamResponse {
  sessionId: string;
  content: string;
  status: 'start' | 'update' | 'done' | 'error' | 'cancel';
}

/**
 * Session synchronization data interface for client-server communication
 */
export interface SessionSyncData {
  session: AgentState;
  action: 'create' | 'update' | 'delete';
}

/**
 * Supported AI providers
 */
export type AIProvider = string;

/**
 * AI provider configuration
 */
export interface AIProviderConfig {
  provider: string;
  apiKey?: string;
  baseURL?: string;
  models: string[];
}

/**
 * AI session configuration
 */
export interface AISessionConfig {
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

/**
 * Agent service settings type
 */
export interface AgentSettings {
  /** Providers configuration including API keys and base URLs */
  providers: AIProviderConfig[];
  /** Default AI configuration */
  defaultConfig: AISessionConfig;
}

/**
 * Agent service to manage chat agents and service agents
 */
export interface IAgentService {
  /**
   * Create agent from definition
   * Add to the memory, and add to the database. Ready to execute, or start immediately.
   *
   * @param agentInfo Please provide `agentID` if this agent is already in the database, so we can resume its state.
   */
  createAgentAndAdd(
    agentInfo: { definition: AgentDefinition; agentID?: string; workspaceID: string },
    options?: { start?: boolean },
  ): Promise<{ id: string; state: AgentState }>;
  getAgentDefinitionFromURI(definitionURI: string): Promise<{ definition: AgentDefinition; definitionTiddlerTitle: string; workspaceID: string }>;
  /**
   * Get current state of an agent, including viewModel and chat history, etc.
   * @param agentID The agent/chat ID
   * @param providedState Normally we get state from stores, you can provide it here, so we can skip getting it from the store.
   */
  getAgentState(agentID: string, providedState?: Partial<AgentState>): AgentState;
  listAgents(): Array<[string, AgentDefinition]>;
  /**
   * Get agent's definition
   */
  serializeAgent(agentID: string): string;
  /**
   * Get agent's runtime state, including viewModel and chat history, etc.
   * @param providedState Normally we get state from stores, you can provide it here, so we can skip getting it from the store.
   */
  serializeAgentState(agentID: string, providedState?: Partial<AgentState>): string;
  /**
   * Start running an agent by its id. Resume its state based on serializedState on database.
   *
   * The agent must be added to the memory and database (by `createAgentAndAdd`) before calling this method.
   * You can pass `start: true` to `createAgentAndAdd` to start the agent immediately by automatically calling this method.
   */
  startAgent(agentID: string): Promise<void>;
  /**
   * Start all agents that are marked as running in the database. Resume their state based on serializedState on database.
   */
  startWorkflows(): Promise<void>;
  /**
   * Stop an agent by its id. Save its state to database.
   */
  stopAgent(agentID: string): Promise<void>;
  /**
   * subscribe to the agent state, to see if we need to update the UI elements
   * @param agentID The agent/chat ID
   */
  subscribeAgentState$(agentID: string): BehaviorSubject<AgentState>;
  updateAgentState(agentID: string, nextState: AgentState): Promise<void>;
  /**
   * Send a message to a chat agent
   * @param agentID Agent ID to send message to
   * @param message User message to send
   */
  sendMessageToAgent(agentID: string, message: string): Promise<void>;
  /**
   * Trigger execution of a service agent
   * @param agentID Agent ID to execute
   * @param params Optional parameters for execution
   */
  executeServiceAgent(agentID: string, parameters?: Record<string, any>): Promise<any>;
  /**
   * BehaviorSubject for AI streaming responses
   * Note: This is a shared stream containing responses for all sessions
   * Use sessionId to distinguish responses for different sessions
   */
  aiResponseStream$: BehaviorSubject<AIStreamResponse | undefined>;
  /**
   * BehaviorSubject for session data synchronization
   * Used to sync server-side session state to the frontend
   */
  sessionSync$: BehaviorSubject<SessionSyncData | undefined>;
  /**
   * Send message to AI and get streaming response
   * This method handles conversation creation and API calls
   * @param sessionId Session ID
   * @param message User message
   */
  sendMessageToAI(sessionId: string, message: string): Promise<void>;
  /**
   * Cancel the current ongoing AI request
   * @param sessionId Session ID
   */
  cancelAIRequest(sessionId: string): Promise<void>;
  /**
   * Get available AI models list
   */
  getAvailableAIModels(): Promise<string[]>;
  /**
   * Create new session
   */
  createSession(session?: AgentState): Promise<AgentState>;
  /**
   * Update session
   * @param session Session data
   */
  updateSession(session: AgentState): Promise<void>;
  /**
   * Delete session
   * @param sessionId Session ID
   */
  deleteSession(sessionId: string): Promise<void>;
  /**
   * Get all sessions
   */
  getAllSessions(): Promise<AgentState[]>;
  /**
   * Get all supported AI providers and their models
   */
  getAIProviders(): Promise<AIProviderConfig[]>;
  /**
   * Get AI configuration for providers. You can pass an optional config to overwrite default global configs.
   * @param partialConfig Optional partial configuration to merge with default settings
   */
  getAIConfig(partialConfig?: Partial<AISessionConfig>): Promise<AISessionConfig>;
  /**
   * Update session AI configuration
   * @param sessionId Session ID
   * @param config AI configuration
   */
  updateSessionAIConfig(sessionId: string, config: AISessionConfig): Promise<void>;
}

export const AgentServiceIPCDescriptor = {
  channel: WorkflowChannel.name,
  properties: {
    addAgentFromDefinitionTiddlerTitle: ProxyPropertyType.Function,
    createAgentAndAdd: ProxyPropertyType.Function,
    getAgentDefinitionFromURI: ProxyPropertyType.Function,
    getAgentState: ProxyPropertyType.Function,
    listAgents: ProxyPropertyType.Function,
    serializeAgent: ProxyPropertyType.Function,
    serializeAgentState: ProxyPropertyType.Function,
    startAgent: ProxyPropertyType.Function,
    startWorkflows: ProxyPropertyType.Function,
    stopAgent: ProxyPropertyType.Function,
    subscribeAgentState$: ProxyPropertyType.Function$,
    updateAgentState: ProxyPropertyType.Function,
    sendMessageToAgent: ProxyPropertyType.Function,
    executeServiceAgent: ProxyPropertyType.Function,
    aiResponseStream$: ProxyPropertyType.Value$,
    sessionSync$: ProxyPropertyType.Value$,
    sendMessageToAI: ProxyPropertyType.Function,
    cancelAIRequest: ProxyPropertyType.Function,
    getAvailableAIModels: ProxyPropertyType.Function,
    createSession: ProxyPropertyType.Function,
    updateSession: ProxyPropertyType.Function,
    deleteSession: ProxyPropertyType.Function,
    getAllSessions: ProxyPropertyType.Function,
    getAIProviders: ProxyPropertyType.Function,
    getAIConfig: ProxyPropertyType.Function,
    updateSessionAIConfig: ProxyPropertyType.Function,
  },
};
