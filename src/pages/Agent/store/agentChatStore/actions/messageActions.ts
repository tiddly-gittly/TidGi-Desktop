import type { ChatMessage } from 'memeloop';
import type { StoreApi } from 'zustand';
import { deleteConversationTurn } from '../../../adapters/conversationTurn';
import type { AgentChatStoreType } from '../types';

export const messageActions = (
  set: StoreApi<AgentChatStoreType>['setState'],
  get: StoreApi<AgentChatStoreType>['getState'],
) => ({
  setMessages: (messages: ChatMessage[]) => {
    const messagesMap = new Map<string, ChatMessage>();
    const orderedIds = messages.map(message => {
      messagesMap.set(message.messageId, message);
      return message.messageId;
    });
    set({ messages: messagesMap, orderedMessageIds: orderedIds });
  },

  addMessage: (message: ChatMessage) => {
    set(state => {
      const newMessages = new Map(state.messages);
      newMessages.set(message.messageId, message);
      const newOrderedIds = [...state.orderedMessageIds, message.messageId];
      return { messages: newMessages, orderedMessageIds: newOrderedIds };
    });
  },

  updateMessage: (message: ChatMessage) => {
    set(state => {
      if (!state.messages.has(message.messageId)) return state;
      const newMessages = new Map(state.messages);
      newMessages.set(message.messageId, message);
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

      // sendMsgToAgent throws on hard errors (including configuration errors
      // emitted by the LLM provider). The service persists a role='error'
      // message before re-throwing, so the chat history still contains the
      // failure record.
      await window.service.agentInstance.sendMsgToAgent(storeAgent.id, {
        text: content,
        file: fileData as unknown as File,
        wikiTiddlers,
      });

      // Refresh UI state after a successful turn.
      await get().fetchAgent(storeAgent.id);
    } catch (error) {
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

    const turn = await deleteConversationTurn(agentId, userMessageId, state.orderedMessageIds, state.messages);
    if (!turn) return undefined;

    // Remove from frontend store
    const deletedSet = new Set(turn.messageIds);
    set(previous => {
      const newMessages = new Map(previous.messages);
      for (const id of turn.messageIds) newMessages.delete(id);
      const newOrderedIds = previous.orderedMessageIds.filter(id => !deletedSet.has(id));
      return { messages: newMessages, orderedMessageIds: newOrderedIds };
    });

    return turn.userMessage.content;
  },

  retryTurn: async (userMessageId: string): Promise<void> => {
    const state = get();
    const agentId = state.agent?.id;
    if (!agentId) return;

    const turn = await deleteConversationTurn(agentId, userMessageId, state.orderedMessageIds, state.messages);
    if (!turn) return;

    const deletedSet = new Set(turn.messageIds);
    set(previous => {
      const newMessages = new Map(previous.messages);
      for (const id of turn.messageIds) newMessages.delete(id);
      const newOrderedIds = previous.orderedMessageIds.filter(id => !deletedSet.has(id));
      return { messages: newMessages, orderedMessageIds: newOrderedIds };
    });

    // Re-send — sendMessage creates a fresh user message + triggers agent
    await get().sendMessage(turn.userMessage.content);
  },
});
