import type { AgentInstanceMessage } from '@services/agentInstance/interface';
import type { StoreApi } from 'zustand';
import type { AgentChatStoreType } from '../types';

export const messageActions = (
  set: StoreApi<AgentChatStoreType>['setState'],
  get: StoreApi<AgentChatStoreType>['getState'],
) => ({
  setMessages: (messages: AgentInstanceMessage[]) => {
    const messagesMap = new Map<string, AgentInstanceMessage>();
    const orderedIds = messages.map(message => {
      messagesMap.set(message.id, message);
      return message.id;
    });
    set({ messages: messagesMap, orderedMessageIds: orderedIds });
  },

  addMessage: (message: AgentInstanceMessage) => {
    set(state => {
      const newMessages = new Map(state.messages);
      newMessages.set(message.id, message);
      const newOrderedIds = [...state.orderedMessageIds, message.id];
      return { messages: newMessages, orderedMessageIds: newOrderedIds };
    });
  },

  updateMessage: (message: AgentInstanceMessage) => {
    set(state => {
      if (!state.messages.has(message.id)) return state;
      const newMessages = new Map(state.messages);
      newMessages.set(message.id, message);
      return { messages: newMessages };
    });
  },

  sendMessage: async (content: string) => {
    const storeAgent = get().agent;
    if (!storeAgent?.id) {
      set({ error: new Error('No active agent in store') });
      return;
    }

    try {
      set({ loading: true });
      await window.service.agentInstance.sendMsgToAgent(storeAgent.id, { text: content });
    } catch (error) {
      set({ error: error instanceof Error ? error : new Error(String(error)) });
      console.error('Failed to send message:', error);
    } finally {
      set({ loading: false });
    }
  },
});
