/* eslint-disable unicorn/prevent-abbreviations */
import { AgentDefinition } from '@services/agentDefinition/interface';
import type { AgentInstance, AgentInstanceMessage } from '@services/agentInstance/interface';
import { Subscription } from 'rxjs';
import type { StoreApi } from 'zustand';
import type { AgentChatStoreType, AgentWithoutMessages } from '../types';

export const agentActions = (
  set: StoreApi<AgentChatStoreType>['setState'],
  get: StoreApi<AgentChatStoreType>['getState'],
) => ({
  processAgentData: async (
    fullAgent: AgentInstance,
  ): Promise<{
    agent: AgentWithoutMessages;
    agentDef: AgentDefinition | null;
    messages: Map<string, AgentInstanceMessage>;
    orderedMessageIds: string[];
  }> => {
    // Convert message array to a Map with ID as key
    const messagesMap = new Map<string, AgentInstanceMessage>();
    // Create an ordered array of message IDs
    const orderedIds: string[] = [];

    // Split agent data into agent without messages and message Map
    const { messages = [], ...agentWithoutMessages } = fullAgent;

    // Sort messages by modified time in ascending order
    const sortedMessages = [...messages].sort((a, b) => {
      const dateA = a.modified ? new Date(a.modified).getTime() : 0;
      const dateB = b.modified ? new Date(b.modified).getTime() : 0;
      return dateA - dateB;
    });

    // Populate message Map and ordered ID array
    sortedMessages.forEach(message => {
      messagesMap.set(message.id, message);
      orderedIds.push(message.id);
    });

    // If there's an agentDefId, load the agentDef
    let agentDef: AgentDefinition | null = null;
    if (agentWithoutMessages.agentDefId) {
      try {
        const fetchedDef = await window.service.agentDefinition.getAgentDef(agentWithoutMessages.agentDefId);
        agentDef = fetchedDef || null;
      } catch (error) {
        console.error(`Failed to fetch agent definition for ${agentWithoutMessages.agentDefId}:`, error);
      }
    }

    return {
      agent: agentWithoutMessages as AgentWithoutMessages,
      agentDef,
      messages: messagesMap,
      orderedMessageIds: orderedIds,
    };
  },

  setAgent: (agentData: AgentWithoutMessages | null) => {
    set({ agent: agentData });
  },

  loadAgent: async (agentId: string) => {
    if (!agentId) return;

    try {
      set({ loading: true, error: null });
      const fullAgent = await window.service.agentInstance.getAgent(agentId);

      if (!fullAgent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      const processedData = await get().processAgentData(fullAgent);

      set({
        agent: processedData.agent,
        agentDef: processedData.agentDef,
        messages: processedData.messages,
        orderedMessageIds: processedData.orderedMessageIds,
        error: null,
        loading: false,
      });
    } catch (error) {
      set({ error: error instanceof Error ? error : new Error(String(error)) });
      console.error('Failed to load agent:', error);
    } finally {
      set({ loading: false });
    }
  },

  createAgent: async (agentDefinitionId?: string): Promise<AgentWithoutMessages | null> => {
    try {
      set({ loading: true });
      const fullAgent = await window.service.agentInstance.createAgent(agentDefinitionId);

      // Process agent data using our helper method and await agentDef loading
      const processedData = await get().processAgentData(fullAgent);

      set({
        agent: processedData.agent,
        agentDef: processedData.agentDef,
        messages: processedData.messages,
        orderedMessageIds: processedData.orderedMessageIds,
        error: null,
        loading: false,
      });

      return processedData.agent;
    } catch (error) {
      set({ error: error instanceof Error ? error : new Error(String(error)) });
      console.error('Failed to create agent:', error);
      return null;
    } finally {
      set({ loading: false });
    }
  },

  updateAgent: async (data: Partial<AgentInstance>): Promise<AgentWithoutMessages | null> => {
    const storeAgent = get().agent;
    if (!storeAgent?.id) {
      set({ error: new Error('No active agent in store') });
      return null;
    }

    try {
      set({ loading: true });
      const updatedAgent = await window.service.agentInstance.updateAgent(storeAgent.id, data);

      // Process agent data using our helper method
      const processedData = await get().processAgentData(updatedAgent);

      set({
        agent: processedData.agent,
        agentDef: processedData.agentDef,
        messages: processedData.messages,
        orderedMessageIds: processedData.orderedMessageIds,
        error: null,
        loading: false,
      });

      return processedData.agent;
    } catch (error) {
      set({ error: error instanceof Error ? error : new Error(String(error)) });
      console.error('Failed to update agent:', error);
      return null;
    } finally {
      set({ loading: false });
    }
  },

  fetchAgent: async (agentId: string) => {
    try {
      // Only set loading state on initial call
      const isInitialCall = !get().agent;
      if (isInitialCall) {
        set({ loading: true });
      }

      const agent = await window.service.agentInstance.getAgent(agentId);
      if (agent) {
        const { agent: processedAgent, agentDef, messages, orderedMessageIds } = await get().processAgentData(agent);
        set({
          agent: processedAgent,
          agentDef,
          messages,
          orderedMessageIds,
          ...(isInitialCall ? { loading: false } : {}),
          error: null,
        });
      }
    } catch (error) {
      const isInitialCall = !get().agent;
      set({
        error: error instanceof Error ? error : new Error(String(error)),
        ...(isInitialCall ? { loading: false } : {}),
      });
    }
  },

  subscribeToUpdates: (agentId: string) => {
    if (!agentId) return undefined;

    try {
      // Track message-specific subscriptions for cleanup
      const messageSubscriptions = new Map<string, Subscription>();

      // Subscribe to overall agent updates (primarily for new messages)
      const agentSubscription = window.observables.agentInstance.subscribeToAgentUpdates(agentId).subscribe({
        next: async (fullAgent: AgentInstance) => {
          // Ensure fullAgent exists before processing
          if (!fullAgent) return;

          // Extract current state
          const { messages: currentMessages, orderedMessageIds: currentOrderedIds } = get();
          const newMessageIds: string[] = [];

          // Process new messages - backend already sorts messages by modified time
          fullAgent.messages.forEach((message: AgentInstanceMessage) => {
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
                    next: (status: any) => {
                      if (status?.message) {
                        // Update the message in our map
                        get().messages.set(status.message.id, status.message);
                        // Check if completed
                        if (status.state === 'completed') {
                          get().setMessageStreaming(status.message.id, false);
                        }
                      }
                    },
                    error: (error: any) => {
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
        error: (error: any) => {
          console.error('Error in agent subscription:', error);
          set({ error: error instanceof Error ? error : new Error(String(error)) });
        },
      });

      // Return cleanup function
      return () => {
        agentSubscription.unsubscribe();
        messageSubscriptions.forEach((subscription) => {
          subscription.unsubscribe();
        });
      };
    } catch (error) {
      console.error('Failed to subscribe to agent updates:', error);
      set({ error: error instanceof Error ? error : new Error(String(error)) });
      return undefined;
    }
  },

  getHandlerId: async () => {
    try {
      const { agent, agentDef } = get();
      if (agentDef?.handlerID) {
        return agentDef.handlerID;
      }
      if (agent?.agentDefId) {
        const agentDef = await window.service.agentDefinition.getAgentDef(agent.agentDefId);
        if (agentDef?.handlerID) {
          return agentDef.handlerID;
        }
      }

      throw new Error('No active agent in store or handler ID not found');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const finalError = new Error(`Failed to get handler ID: ${errorMessage}`);
      set({ error: finalError });
      throw finalError;
    }
  },

  /**
   * Get handler configuration schema for current handler
   */
  getHandlerConfigSchema: async () => {
    try {
      const handlerId = await get().getHandlerId();
      return await window.service.agentInstance.getHandlerConfigSchema(handlerId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const finalError = new Error(`Failed to get handler schema: ${errorMessage}`);
      set({ error: finalError });
      throw finalError;
    }
  },
});
