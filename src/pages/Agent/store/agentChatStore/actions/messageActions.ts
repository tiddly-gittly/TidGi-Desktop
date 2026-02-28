import type { AgentInstanceMessage } from '@services/agentInstance/interface';
import type { StoreApi } from 'zustand';
import type { AgentChatStoreType } from '../types';

/** Get IDs belonging to a turn started by the given user message. Includes the user message itself. */
function getTurnMessageIds(
  userMessageId: string,
  orderedMessageIds: string[],
  messages: Map<string, AgentInstanceMessage>,
): string[] {
  const startIndex = orderedMessageIds.indexOf(userMessageId);
  if (startIndex === -1) return [];
  const ids: string[] = [userMessageId];
  for (let index = startIndex + 1; index < orderedMessageIds.length; index++) {
    const message = messages.get(orderedMessageIds[index]);
    if (message?.role === 'user') break; // Next turn
    ids.push(orderedMessageIds[index]);
  }
  return ids;
}

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

  sendMessage: async (content: string, file?: File, wikiTiddlers?: Array<{ workspaceName: string; tiddlerTitle: string }>) => {
    const storeAgent = get().agent;
    if (!storeAgent?.id) {
      set({ error: new Error('No active agent in store') });
      return;
    }

    try {
      set({ loading: true });
      // In Electron Renderer, File object has a 'path' property which is the absolute path.
      // We need to extract it because simple serialization might lose it or fail to transmit the File object correctly via IPC.
      void window.service.native.log(
        'debug',
        'Sending message with attachments',
        {
          function: 'messageActions.sendMessage',
          hasFile: !!file,
          fileName: file?.name,
          fileType: file?.type,
          fileSize: file?.size,
          filePath: (file as unknown as { path?: string })?.path,
          hasWikiTiddlers: !!(wikiTiddlers && wikiTiddlers.length > 0),
          wikiTiddlersCount: wikiTiddlers?.length || 0,
        },
      );

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
          path: (file as unknown as { path?: string }).path,
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
        wikiTiddlers,
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

  deleteTurn: async (userMessageId: string): Promise<string | undefined> => {
    const state = get();
    const agentId = state.agent?.id;
    if (!agentId) return undefined;

    const turnIds = getTurnMessageIds(userMessageId, state.orderedMessageIds, state.messages);
    if (turnIds.length === 0) return undefined;

    const userMessage = state.messages.get(userMessageId);
    const userContent = userMessage?.content;

    // Remove from backend DB
    try {
      await window.service.agentInstance.deleteMessages(agentId, turnIds);
    } catch (error) {
      void window.service.native.log('error', 'Failed to delete turn messages', { error });
    }

    // Remove from frontend store
    const deletedSet = new Set(turnIds);
    set(prev => {
      const newMessages = new Map(prev.messages);
      for (const id of turnIds) newMessages.delete(id);
      const newOrderedIds = prev.orderedMessageIds.filter(id => !deletedSet.has(id));
      return { messages: newMessages, orderedMessageIds: newOrderedIds };
    });

    return userContent;
  },

  retryTurn: async (userMessageId: string): Promise<void> => {
    const state = get();
    const agentId = state.agent?.id;
    if (!agentId) return;

    const userMessage = state.messages.get(userMessageId);
    if (!userMessage || userMessage.role !== 'user') return;
    const userContent = userMessage.content;

    // Delete entire turn (user msg + all agent responses) from backend and store
    const turnIds = getTurnMessageIds(userMessageId, state.orderedMessageIds, state.messages);
    if (turnIds.length > 0) {
      try {
        await window.service.agentInstance.deleteMessages(agentId, turnIds);
      } catch (error) {
        void window.service.native.log('error', 'Failed to delete turn for retry', { error });
      }
      const deletedSet = new Set(turnIds);
      set(previous => {
        const newMessages = new Map(previous.messages);
        for (const id of turnIds) newMessages.delete(id);
        const newOrderedIds = previous.orderedMessageIds.filter(id => !deletedSet.has(id));
        return { messages: newMessages, orderedMessageIds: newOrderedIds };
      });
    }

    // Re-send — sendMessage creates a fresh user message + triggers agent
    await get().sendMessage(userContent);
  },
});
