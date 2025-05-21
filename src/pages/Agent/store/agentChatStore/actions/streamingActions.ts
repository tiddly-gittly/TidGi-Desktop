import { StateCreator } from 'zustand';
import { AgentChatState, StreamingActions } from '../types';

/**
 * Streaming message related actions
 * Handles message streaming state and retrieval
 */
export const streamingActionsMiddleware: StateCreator<AgentChatState, [], [], StreamingActions> = (
  set,
  get,
) => ({
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
});
