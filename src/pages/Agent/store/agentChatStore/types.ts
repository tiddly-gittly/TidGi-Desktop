import { AgentDefinition } from '@services/agentDefinition/interface';
import type { AgentInstance, AgentInstanceMessage } from '@services/agentInstance/interface';
import type { AgentPromptDescription, IPrompt } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { ModelMessage } from 'ai';

// Type for agent data without messages - exported for use in other components
export interface AgentWithoutMessages extends Omit<AgentInstance, 'messages'> {
  messages?: never;
}

// Basic agent chat state
export interface AgentChatBaseState {
  // Indicates if the agent chat is loading
  loading: boolean;
  // Holds the latest error, if any
  error: Error | null;
  // The current agent instance data, excluding messages
  agent: AgentWithoutMessages | null;
  // Stores all messages for the current agent, mapped by message ID
  messages: Map<string, AgentInstanceMessage>;
  // Stores the order of message IDs to maintain backend message order
  orderedMessageIds: string[];
  // Tracks which message IDs are currently streaming
  streamingMessageIds: Set<string>;
  // Flag to prevent late streaming updates after user cancels
  isCancelling: boolean;
}

// Preview dialog specific state
export interface PreviewDialogState {
  previewDialogOpen: boolean;
  previewDialogBaseMode: 'preview' | 'edit';
  previewDialogTab: 'flat' | 'tree';
  previewLoading: boolean;
  previewProgress: number; // 0-1, processing progress
  previewCurrentStep: string; // current processing step description
  previewCurrentPlugin: string | null; // current plugin being processed
  previewResult: {
    flatPrompts: ModelMessage[];
    processedPrompts: IPrompt[];
  } | null;
  lastUpdated: Date | null;
  formFieldsToScrollTo: string[];
}

// Basic actions interface
export interface BasicActions {
  /** Set current agent */
  setAgent: (agentData: AgentWithoutMessages | null) => void;
  /** Set messages */
  setMessages: (messages: AgentInstanceMessage[]) => void;
  /** Add a new message */
  addMessage: (message: AgentInstanceMessage) => void;
  /** Update an existing message */
  updateMessage: (message: AgentInstanceMessage) => void;
  /** Start streaming a message */
  streamMessageStart: (message: AgentInstanceMessage) => void;
  /** Update streaming message content */
  streamMessageContent: (content: string, messageId?: string) => void;
  /** End streaming a message */
  streamMessageEnd: (messageId?: string) => void;
  /** Set loading state */
  setLoading: (loading: boolean) => void;
  /** Set error state */
  setError: (error: Error | null) => void;
  /** Clear error state */
  clearError: () => void;
  /** Load an agent by ID */
  loadAgent: (agentId: string) => Promise<void>;
  /**
   * Sends a message from the user to the agent.
   * @param content The message content
   * @param file Optional file attachment
   */
  sendMessage: (content: string, file?: File) => Promise<void>;

  /**
   * Creates a new agent instance from a definition.
   * @param agentDefinitionId The agent definition ID
   * @returns The created agent data (without messages) or null
   */
  createAgent: (agentDefinitionId?: string) => Promise<AgentWithoutMessages | null>;

  /**
   * Updates an agent instance with new data.
   * @param agentId The agent instance ID
   * @param data The partial agent data to update
   * @returns The updated agent data (without messages) or null
   */
  updateAgent: (data: Partial<AgentInstance>) => Promise<AgentWithoutMessages | null>;

  /** Cancels the current operation for the agent instance. */
  cancelAgent: () => Promise<void>;

  /** Get the handler ID for the current agent */
  getAgentFrameworkId: () => Promise<string>;

  /** Get the configuration schema for the current handler */
  getFrameworkConfigSchema: () => Promise<Record<string, unknown>>;

  /** Process raw agent data into store format */
  processAgentData: (
    fullAgent: AgentInstance,
  ) => Promise<{
    agent: AgentWithoutMessages;
    agentDef: AgentDefinition | null;
    messages: Map<string, AgentInstanceMessage>;
    orderedMessageIds: string[];
  }>;

  /** Fetch agent data by ID */
  fetchAgent: (agentId: string) => Promise<void>;

  /** Subscribe to agent updates */
  subscribeToUpdates: (agentId: string) => (() => void) | undefined;
}

// Streaming related actions interface
export interface StreamingActions {
  /**
   * Sets the streaming state for a message
   * @param messageId The ID of the message
   * @param isStreaming Whether the message is currently streaming
   */
  setMessageStreaming: (messageId: string, isStreaming: boolean) => void;

  /**
   * Checks if a message is currently streaming
   * @param messageId The ID of the message to check
   */
  isMessageStreaming: (messageId: string) => boolean;

  /**
   * Gets a message by its ID from the messages map
   * @param messageId The ID of the message to retrieve
   */
  getMessageById: (messageId: string) => AgentInstanceMessage | undefined;
}

// Preview dialog related actions interface
export interface PreviewActions {
  /**
   * Opens the preview dialog
   */
  openPreviewDialog: (options?: { baseMode?: 'preview' | 'edit' }) => void;

  /**
   * Closes the preview dialog
   */
  closePreviewDialog: () => void;

  /**
   * Sets the active tab in the preview dialog
   * @param tab The tab to switch to ('flat' or 'tree')
   */
  setPreviewDialogTab: (tab: 'flat' | 'tree') => void;

  /**
   * Sets the form field paths to scroll to when switching to edit mode
   * @param fieldPaths [targetTab, ...targetFieldPath] where targetTab is the tab name and targetFieldPath is the field path array
   */
  setFormFieldsToScrollTo: (fieldPaths: string[]) => void;

  /**
   * Updates preview progress state
   * @param progress Progress value from 0 to 1
   * @param step Current processing step description
   * @param currentPlugin Current plugin being processed
   */
  updatePreviewProgress: (progress: number, step: string, currentPlugin?: string) => void;

  /**
   * Generates a preview of prompts for the current agent state
   * @param inputText Input text to include in the preview
   * @param agentFrameworkConfig Framework configuration to use for preview
   * @returns Promise that resolves when preview is generated and state is updated
   */
  getPreviewPromptResult: (
    inputText: string,
    agentFrameworkConfig: AgentPromptDescription['agentFrameworkConfig'],
  ) => Promise<
    {
      flatPrompts: ModelMessage[];
      processedPrompts: IPrompt[];
    } | null
  >;

  /**
   * Resets the lastUpdated timestamp, typically called when dialog is closed
   */
  resetLastUpdated: () => void;
}

// Combine all interfaces into the complete state interface
export interface AgentChatState extends AgentChatBaseState, PreviewDialogState {}

// Agent chat store type with agentDef related properties and all actions
export interface AgentChatStoreType extends AgentChatBaseState, PreviewDialogState, BasicActions, StreamingActions, PreviewActions {
  /** Agent definition */
  agentDef: AgentDefinition | null;
}
