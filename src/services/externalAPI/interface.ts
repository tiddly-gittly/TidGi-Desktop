import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { ReactElement } from 'react';
import type { BehaviorSubject } from 'rxjs';
import type { ITiddlerFields } from 'tiddlywiki';

import { ExternalAPIChannel } from '@/constants/channels';
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
 * Model feature types
 */
export type ModelFeature = 'language' | 'imageGeneration' | 'toolCalling' | 'reasoning' | 'vision' | 'embedding';

/**
 * Extended model information
 */
export interface ModelInfo {
  /** Unique identifier for the model */
  name: string;
  /** Display name for the model */
  caption?: string;
  /** Features supported by the model */
  features?: ModelFeature[];
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * AI provider configuration
 */
export interface AIProviderConfig {
  provider: string;
  apiKey?: string;
  baseURL?: string;
  models: ModelInfo[];
  /** Type of provider API interface */
  providerClass?: string // like 'openai' | 'openAICompatible' | 'anthropic' | 'deepseek' | 'ollama' | 'custom';
  /** Whether this is a preset provider that can't have its baseURL modified */
  isPreset?: boolean;
  /** Whether this provider is enabled by user */
  enabled?: boolean;
  /** Whether this provider requires showing baseURL field even if it's preset */
  showBaseURLField?: boolean;
}

/**
 * AI session configuration
 */
export interface AISessionConfig {
  provider: string;
  model: string;
  /** 
   * Model specific parameters 
   * Optional, different model types may require different parameters
   */
  modelParameters?: {
    /** Controls randomness: lower values are more deterministic */
    temperature?: number;
    /** Maximum number of tokens to generate */
    maxTokens?: number;
    /** System instructions to set assistant behavior */
    systemPrompt?: string;
    /** Other model specific parameters can be added here */
    [key: string]: any;
  };
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
export interface IExternalAPIService {
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
   * Update provider configuration
   * @param provider Provider ID to update
   * @param config Partial provider configuration to update
   */
  updateProvider(provider: string, config: Partial<AIProviderConfig>): Promise<void>;

  /**
   * Update default AI configuration settings
   * @param config Partial AI configuration to update
   */
  updateDefaultAIConfig(config: Partial<AISessionConfig>): Promise<void>;

  /**
   * Update session AI configuration
   * @param sessionId Session ID
   * @param config AI configuration
   */
  updateSessionAIConfig(sessionId: string, config: AISessionConfig): Promise<void>;
}

export const ExternalAPIServiceIPCDescriptor = {
  channel: ExternalAPIChannel.name,
  properties: {
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
    updateProvider: ProxyPropertyType.Function,
    updateDefaultAIConfig: ProxyPropertyType.Function,
    updateSessionAIConfig: ProxyPropertyType.Function,
  },
};
