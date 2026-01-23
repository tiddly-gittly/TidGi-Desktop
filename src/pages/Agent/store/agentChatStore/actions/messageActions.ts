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

  sendMessage: async (content: string, file?: File) => {
    const storeAgent = get().agent;
    if (!storeAgent?.id) {
      set({ error: new Error('No active agent in store') });
      return;
    }

    try {
      set({ loading: true });
      // In Electron Renderer, File object has a 'path' property which is the absolute path.
      // We need to extract it because simple serialization might lose it or fail to transmit the File object correctly via IPC.
      console.log('Sending message with file:', file);
      if (file) {
        console.log('File path:', (file as unknown as { path?: string }).path);
      }

      let fileBuffer: ArrayBuffer | undefined;
      // If path is missing (e.g. web file, pasted image), read content
      if (file && !(file as unknown as { path?: string }).path) {
        try {
          fileBuffer = await file.arrayBuffer();
        } catch (error) {
          console.error('Failed to read file buffer', error);
        }
      }

      const fileData = file
        ? {
          path: (file as unknown as { path: string }).path,
          name: file.name,
          type: file.type,
          size: file.size,
          lastModified: file.lastModified,
          buffer: fileBuffer,
        }
        : undefined;

      await window.service.agentInstance.sendMsgToAgent(storeAgent.id, {
        text: content,
        file: fileData as unknown as File,
      });
    } catch (error) {
      set({ error: error as Error });
      void window.service.native.log(
        'error',
        'Failed to send message',
        { function: 'messageActions.sendMessage', error },
      );
    } finally {
      set({ loading: false });
    }
  },
});
