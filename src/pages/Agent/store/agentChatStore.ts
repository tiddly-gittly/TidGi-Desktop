import { AgentInstance, AgentInstanceMessage } from '@services/agentInstance/interface';
import { Subscription } from 'rxjs';
import { create } from 'zustand';

// Type for agent data without messages - exported for use in other components
export type AgentWithoutMessages = Omit<AgentInstance, 'messages'>;

interface AgentChatState {
  // State
  loading: boolean;
  error: Error | null;
  agent: AgentWithoutMessages | null;
  // Store messages separately in a Map for more efficient updates
  messages: Map<string, AgentInstanceMessage>;
  // Store message IDs in order to maintain backend's message ordering
  orderedMessageIds: string[];
  // Track which messages are currently streaming
  streamingMessageIds: Set<string>;

  // Helper method to process agent data
  processAgentData: (fullAgent: AgentInstance) => {
    agent: AgentWithoutMessages;
    messages: Map<string, AgentInstanceMessage>;
    orderedMessageIds: string[];
  };

  // Actions
  fetchAgent: (agentId: string) => Promise<void>;
  subscribeToUpdates: (agentId: string) => (() => void) | undefined;
  sendMessage: (agentId: string, content: string) => Promise<void>;
  createAgent: (agentDefinitionId?: string) => Promise<AgentWithoutMessages | null>;
  updateAgent: (agentId: string, data: Partial<AgentInstance>) => Promise<AgentWithoutMessages | null>;
  cancelAgent: (agentId: string) => Promise<void>;
  clearError: () => void;

  // Message-specific actions
  setMessageStreaming: (messageId: string, isStreaming: boolean) => void;
  isMessageStreaming: (messageId: string) => boolean;
  getMessageById: (messageId: string) => AgentInstanceMessage | undefined;
}

export const useAgentChatStore = create<AgentChatState>((set, get) => ({
  // Initial state
  loading: false,
  error: null,
  agent: null,
  messages: new Map<string, AgentInstanceMessage>(),
  orderedMessageIds: [],
  streamingMessageIds: new Set<string>(),

  // Helper to process agent data and update store
  // This centralizes the logic for extracting messages from a full agent instance
  // and preparing the data structure for the store
  processAgentData: (fullAgent: AgentInstance) => {
    // Create a messages map for efficient lookup
    const messagesMap = new Map<string, AgentInstanceMessage>();

    // Messages are already sorted by the backend in ascending order by modified time
    // Just map them to maintain that order in our orderedIds array
    const orderedIds = fullAgent.messages.map(message => {
      messagesMap.set(message.id, message);
      return message.id;
    });

    // Separate agent data from messages
    const { messages: _, ...agentWithoutMessages } = fullAgent;

    return {
      agent: agentWithoutMessages,
      messages: messagesMap,
      orderedMessageIds: orderedIds,
    };
  },

  // Fetch agent instance
  fetchAgent: async (agentId: string) => {
    if (!agentId) return;

    try {
      set({ loading: true, error: null });
      const fullAgent = await window.service.agentInstance.getAgent(agentId);

      if (fullAgent) {
        // Process agent data using our helper method
        const storeData = get().processAgentData(fullAgent);
        set({ ...storeData, error: null });
      }
    } catch (error) {
      set({ error: error instanceof Error ? error : new Error(String(error)) });
      console.error('Failed to fetch agent:', error);
    } finally {
      set({ loading: false });
    }
  },

  // Subscribe to agent updates
  subscribeToUpdates: (agentId: string) => {
    if (!agentId) return undefined;

    try {
      // Track message-specific subscriptions for cleanup
      const messageSubscriptions = new Map<string, Subscription>();

      // Subscribe to overall agent updates (primarily for new messages)
      const agentSubscription = window.observables.agentInstance.subscribeToAgentUpdates(agentId).subscribe({
        next: (fullAgent) => {
          // Ensure fullAgent exists before processing
          if (!fullAgent) return;

          // Extract current state
          const { messages: currentMessages, orderedMessageIds: currentOrderedIds } = get();
          const newMessageIds: string[] = [];

          // Process new messages - backend already sorts messages by modified time
          fullAgent.messages.forEach(message => {
            const existingMessage = currentMessages.get(message.id);

            // If this is a new message
            if (!existingMessage) {
              // Add new message to the map
              currentMessages.set(message.id, message);
              newMessageIds.push(message.id);

              // Subscribe to AI message updates
              if ((message.role === 'agent' || message.role === 'assistant') && !messageSubscriptions.has(message.id)) {
                // Mark as streaming
                get().setMessageStreaming(message.id, true);

                // Create message-specific subscription
                messageSubscriptions.set(
                  message.id,
                  window.observables.agentInstance.subscribeToAgentUpdates(agentId, message.id).subscribe({
                    next: (status) => {
                      if (status?.message) {
                        // Update the message in our map
                        get().messages.set(status.message.id, status.message);
                        // Check if completed
                        if (status.state === 'completed') {
                          get().setMessageStreaming(status.message.id, false);
                        }
                      }
                    },
                    error: (error) => {
                      console.error(`Error in message subscription for ${message.id}:`, error);
                    },
                    complete: () => {
                      get().setMessageStreaming(message.id, false);
                      messageSubscriptions.delete(message.id);
                    },
                  }),
                );
              }
            }
          });

          // Extract agent data without messages
          const { messages: _, ...agentWithoutMessages } = fullAgent;

          // Update state based on whether we have new messages
          if (newMessageIds.length > 0) {
            // Update agent and append new message IDs to maintain order
            set({
              agent: agentWithoutMessages,
              orderedMessageIds: [...currentOrderedIds, ...newMessageIds],
            });
          } else {
            // No new messages, just update agent state
            set({ agent: agentWithoutMessages });
          }
        },
        error: (error) => {
          console.error('Error in agent subscription:', error);
          set({ error: error instanceof Error ? error : new Error(String(error)) });
        },
      });

      // Return cleanup function
      return () => {
        agentSubscription.unsubscribe();
        messageSubscriptions.forEach(subscription => {
          subscription.unsubscribe();
        });
      };
    } catch (error) {
      console.error('Failed to subscribe to agent updates:', error);
      set({ error: error instanceof Error ? error : new Error(String(error)) });
      return undefined;
    }
  },

  // Send message to agent
  sendMessage: async (agentId: string, content: string) => {
    if (!agentId) {
      set({ error: new Error('No agent ID provided') });
      return;
    }

    try {
      set({ loading: true });
      await window.service.agentInstance.sendMsgToAgent(agentId, { text: content });
    } catch (error) {
      set({ error: error instanceof Error ? error : new Error(String(error)) });
      console.error('Failed to send message:', error);
    } finally {
      set({ loading: false });
    }
  },

  createAgent: async (agentDefinitionId?: string) => {
    try {
      set({ loading: true });
      const fullAgent = await window.service.agentInstance.createAgent(agentDefinitionId);

      // Process agent data using our helper method
      const storeData = get().processAgentData(fullAgent);

      set({
        ...storeData,
        error: null,
      });

      return storeData.agent;
    } catch (error) {
      set({ error: error instanceof Error ? error : new Error(String(error)) });
      console.error('Failed to create agent:', error);
      return null;
    } finally {
      set({ loading: false });
    }
  },

  updateAgent: async (agentId: string, data: Partial<AgentInstance>) => {
    if (!agentId) {
      set({ error: new Error('No agent ID provided') });
      return null;
    }

    try {
      set({ loading: true });
      const fullAgent = await window.service.agentInstance.updateAgent(agentId, data);
      const storeData = get().processAgentData(fullAgent);
      set({
        ...storeData,
        error: null,
      });
      return storeData.agent;
    } catch (error) {
      set({ error: error instanceof Error ? error : new Error(String(error)) });
      console.error('Failed to update agent:', error);
      return null;
    } finally {
      set({ loading: false });
    }
  },

  // Cancel current operation
  cancelAgent: async (agentId: string) => {
    if (!agentId) return;

    try {
      await window.service.agentInstance.cancelAgent(agentId);

      // Clear streaming state for all messages
      const { streamingMessageIds } = get();
      if (streamingMessageIds.size > 0) {
        const newStreamingIds = new Set<string>();
        set({ streamingMessageIds: newStreamingIds });
      }
    } catch (error) {
      console.error('Failed to cancel agent:', error);
    }
  },

  clearError: () => {
    set({ error: null });
  },

  setMessageStreaming: (messageId: string, isStreaming: boolean) => {
    const { streamingMessageIds } = get();
    const newStreamingIds = new Set(streamingMessageIds);

    if (isStreaming) {
      newStreamingIds.add(messageId);
    } else {
      newStreamingIds.delete(messageId);
    }

    set({ streamingMessageIds: newStreamingIds });
  },

  isMessageStreaming: (messageId: string) => {
    return get().streamingMessageIds.has(messageId);
  },

  getMessageById: (messageId: string) => {
    return get().messages.get(messageId);
  },
}));
