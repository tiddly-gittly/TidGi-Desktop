import { AgentInstance, AgentInstanceMessage } from '@services/agentInstance/interface';
import type { AiAPIConfig, Prompt } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { CoreMessage } from 'ai';

// Type for agent data without messages - exported for use in other components
export type AgentWithoutMessages = Omit<AgentInstance, 'messages'>;

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
}

// Preview dialog specific state
export interface PreviewDialogState {
  previewDialogOpen: boolean;
  previewDialogTab: 'flat' | 'tree';
  previewLoading: boolean;
  previewResult: {
    flatPrompts: CoreMessage[];
    processedPrompts: Prompt[];
  } | null;
}

// Basic actions interface
export interface BasicActions {
  /**
   * Processes a full agent instance and extracts agent data, messages map, and ordered message IDs.
   * @param fullAgent The complete agent instance including messages
   * @returns An object with agent data (without messages), messages map, and ordered message IDs
   */
  processAgentData: (fullAgent: AgentInstance) => {
    agent: AgentWithoutMessages;
    messages: Map<string, AgentInstanceMessage>;
    orderedMessageIds: string[];
  };

  /**
   * Fetches the agent instance data by ID and updates the store.
   * @param agentId The agent instance ID
   */
  fetchAgent: (agentId: string) => Promise<void>;

  /**
   * Subscribes to agent instance updates and returns a cleanup function.
   * @param agentId The agent instance ID
   * @returns Cleanup function or undefined
   */
  subscribeToUpdates: (agentId: string) => (() => void) | undefined;

  /**
   * Sends a message to the agent instance.
   * @param agentId The agent instance ID
   * @param content The message content
   */
  sendMessage: (agentId: string, content: string) => Promise<void>;

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
  updateAgent: (agentId: string, data: Partial<AgentInstance>) => Promise<AgentWithoutMessages | null>;

  /**
   * Cancels the current operation for the agent instance.
   * @param agentId The agent instance ID
   */
  cancelAgent: (agentId: string) => Promise<void>;

  /**
   * Clears the current error state.
   */
  clearError: () => void;
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
  openPreviewDialog: () => void;

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
   * Generates a preview of prompts for the current agent state
   * @param agentId The ID of the current agent
   * @param agentDefinitionId The ID of the agent definition
   * @param inputText Optional input text to include in preview
   * @param aiApiConfig Optional AI API configuration
   * @returns Promise that resolves when preview is generated and state is updated
   */
  getPreviewPromptResult: (
    agentId: string,
    agentDefinitionId: string,
    inputText: string,
    aiApiConfig?: AiAPIConfig,
  ) => Promise<{
    flatPrompts: CoreMessage[];
    processedPrompts: Prompt[];
  } | null>;
}

// Combine all interfaces into the complete state interface
export interface AgentChatState extends AgentChatBaseState, PreviewDialogState, BasicActions, StreamingActions, PreviewActions {}
