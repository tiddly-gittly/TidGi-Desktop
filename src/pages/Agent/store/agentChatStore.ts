import { AgentInstance } from '@services/agentInstance/interface';
import { create } from 'zustand';

interface AgentChatState {
  // State
  loading: boolean;
  error: Error | null;
  agent: AgentInstance | null;

  // Actions
  fetchAgent: (agentId: string) => Promise<void>;
  subscribeToUpdates: (agentId: string) => (() => void) | undefined;
  sendMessage: (agentId: string, content: string) => Promise<void>;
  createAgent: (agentDefinitionId?: string) => Promise<AgentInstance | null>;
  updateAgent: (agentId: string, data: Partial<AgentInstance>) => Promise<AgentInstance | null>;
  cancelAgent: (agentId: string) => Promise<void>;
  clearError: () => void;
}

export const useAgentChatStore = create<AgentChatState>((set) => ({
  // Initial state
  loading: false,
  error: null,
  agent: null,

  // Fetch agent instance
  fetchAgent: async (agentId: string) => {
    if (!agentId) return;

    try {
      set({ loading: true, error: null });
      const agent = await window.service.agentInstance.getAgent(agentId);
      if (agent) {
        set({ agent });
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
      const subscription = window.observables.agentInstance.subscribeToAgentUpdates(agentId).subscribe({
        next: (agent) => {
          if (agent) {
            set({ agent });
          }
        },
        error: (error) => {
          console.error('Error in agent subscription:', error);
          set({ error: error instanceof Error ? error : new Error(String(error)) });
        },
      });

      // Return cleanup function
      return () => {
        subscription.unsubscribe();
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

  // Create new agent instance
  createAgent: async (agentDefinitionId?: string) => {
    try {
      set({ loading: true });
      const newAgent = await window.service.agentInstance.createAgent(agentDefinitionId);
      set({
        agent: newAgent,
        error: null,
      });
      return newAgent;
    } catch (error) {
      set({ error: error instanceof Error ? error : new Error(String(error)) });
      console.error('Failed to create agent:', error);
      return null;
    } finally {
      set({ loading: false });
    }
  },

  // Update agent
  updateAgent: async (agentId: string, data: Partial<AgentInstance>) => {
    if (!agentId) {
      set({ error: new Error('No agent ID provided') });
      return null;
    }

    try {
      set({ loading: true });
      const updatedAgent = await window.service.agentInstance.updateAgent(agentId, data);
      set({
        agent: updatedAgent,
        error: null,
      });
      return updatedAgent;
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
    } catch (error) {
      console.error('Failed to cancel agent:', error);
    }
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },
}));
