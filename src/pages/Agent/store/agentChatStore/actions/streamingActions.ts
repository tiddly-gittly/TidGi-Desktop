import type { AgentInstanceMessage } from '@services/agentInstance/interface';
import { StateCreator } from 'zustand';
import { AgentChatStoreType, StreamingActions } from '../types';

/**
 * Streaming message related actions
 * Handles message streaming state and retrieval
 */
export const streamingActionsMiddleware: StateCreator<AgentChatStoreType, [], [], StreamingActions> = (
  set,
  get,
) => ({
  setMessageStreaming: (messageId: string, isStreaming: boolean) => {
    // If user is cancelling, ignore any attempts to set streaming state
    const { streamingMessageIds, isCancelling } = get();
    if (isCancelling && isStreaming) {
      // Block late streaming updates during cancellation
      return;
    }

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

  streamMessageStart: (message: AgentInstanceMessage) => {
    set(state => {
      const newMessages = new Map(state.messages);
      newMessages.set(message.id, message);
      const newOrderedIds = [...state.orderedMessageIds, message.id];
      const newStreamingMessageIds = new Set(state.streamingMessageIds);
      newStreamingMessageIds.add(message.id);
      return {
        messages: newMessages,
        orderedMessageIds: newOrderedIds,
        streamingMessageIds: newStreamingMessageIds,
      };
    });
  },

  streamMessageContent: (content: string, messageId?: string) => {
    set(state => {
      // Get current streaming message ID
      let targetMessageId = messageId;
      if (!targetMessageId) {
        // Use the last streaming message if no ID provided
        const streamingIds = Array.from(state.streamingMessageIds);
        targetMessageId = streamingIds[streamingIds.length - 1];
      }

      if (!targetMessageId || !state.messages.has(targetMessageId)) {
        return state;
      }

      // Update message content
      const newMessages = new Map(state.messages);
      const currentMessage = newMessages.get(targetMessageId);
      if (currentMessage) {
        const updatedMessage = { ...currentMessage, content };
        newMessages.set(targetMessageId, updatedMessage);
      }

      return { messages: newMessages };
    });
  },

  streamMessageEnd: (messageId?: string) => {
    set(state => {
      // Get current streaming message ID
      let targetMessageId = messageId;
      if (!targetMessageId) {
        // Use the last streaming message if no ID provided
        const streamingIds = Array.from(state.streamingMessageIds);
        targetMessageId = streamingIds[streamingIds.length - 1];
      }

      if (!targetMessageId) {
        return state;
      }

      // Remove from streaming set
      const newStreamingMessageIds = new Set(state.streamingMessageIds);
      newStreamingMessageIds.delete(targetMessageId);

      return { streamingMessageIds: newStreamingMessageIds };
    });
  },
});
