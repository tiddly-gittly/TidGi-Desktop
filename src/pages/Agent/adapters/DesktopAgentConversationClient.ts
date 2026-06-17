/**
 * DesktopAgentConversationClient — wraps message operations
 * to implement the headless AgentConversationClient interface.
 */

/**
 * DesktopAgentConversationClient — wraps message operations
 * to implement the headless AgentConversationClient interface.
 *
 * Tracks the current agentId internally — set via getMessages/sendMessage calls.
 */

import type { AgentConversationClient, ChatMessage } from 'memeloop';

/** Get message IDs for a turn starting from a user message. */
function getTurnMessageIds(
  userMessageId: string,
  orderedMessageIds: string[],
  messagesMap: Map<string, ChatMessage>,
): string[] {
  const startIndex = orderedMessageIds.indexOf(userMessageId);
  if (startIndex === -1) return [];
  const ids: string[] = [userMessageId];
  for (let index = startIndex + 1; index < orderedMessageIds.length; index++) {
    const message = messagesMap.get(orderedMessageIds[index]);
    if (message?.role === 'user') break;
    ids.push(orderedMessageIds[index]);
  }
  return ids;
}

/**
 * Desktop implementation of AgentConversationClient.
 * Wraps agent instance message operations via IPC.
 */
export const createDesktopAgentConversationClient = (): AgentConversationClient => {
  // Track the active agent ID (updated on each getMessages/sendMessage call)
  let currentAgentId: string | null = null;
  const agentSubscriptions = new Map<string, { unsubscribe: () => void }>();

  return {
    getMessages: async (agentId) => {
      currentAgentId = agentId;
      const agent = await window.service.agentInstance.getAgent(agentId);
      if (!agent) return [];
      return agent.messages ?? [];
    },

    sendMessage: async (agentId, content, file, wikiTiddlers) => {
      currentAgentId = agentId;
      await window.service.agentInstance.sendMsgToAgent(agentId, {
        text: content,
        file,
        wikiTiddlers,
      });
    },

    subscribeToMessages: (agentId, listener) => {
      const existing = agentSubscriptions.get(agentId);
      if (!existing) {
        const subscription = window.observables.agentInstance.subscribeToAgentUpdates(agentId)
          .subscribe((update) => {
            if (!update) return;
            const messages = (update as { messages?: ChatMessage[] }).messages;
            if (messages) {
              for (const msg of messages) listener(msg);
            }
          });
        agentSubscriptions.set(agentId, { unsubscribe: () => subscription.unsubscribe() });
      }

      return () => {
        const entry = agentSubscriptions.get(agentId);
        if (entry) {
          entry.unsubscribe();
          agentSubscriptions.delete(agentId);
        }
      };
    },

    deleteTurn: async (userMessageId) => {
      const agentId = currentAgentId;
      if (!agentId) return undefined;

      const agent = await window.service.agentInstance.getAgent(agentId);
      if (!agent) return undefined;

      const messages = agent.messages ?? [];
      const orderedMessageIds = messages.map((m) => m.messageId);
      const messagesMap = new Map(messages.map((m) => [m.messageId, m]));
      const userMessage = messagesMap.get(userMessageId);

      const turnIds = getTurnMessageIds(userMessageId, orderedMessageIds, messagesMap);
      if (turnIds.length === 0) return undefined;

      try {
        await window.service.agentInstance.deleteMessages(agentId, turnIds);
      } catch (error) {
        void window.service.native.log('error', 'Failed to delete turn messages', { error });
      }

      return userMessage?.content;
    },

    retryTurn: async (userMessageId) => {
      const agentId = currentAgentId;
      if (!agentId) return;

      const agent = await window.service.agentInstance.getAgent(agentId);
      if (!agent) return;

      const messages = agent.messages ?? [];
      const orderedMessageIds = messages.map((m) => m.messageId);
      const messagesMap = new Map(messages.map((m) => [m.messageId, m]));
      const userMessage = messagesMap.get(userMessageId);
      if (!userMessage || userMessage.role !== 'user') return;

      const turnIds = getTurnMessageIds(userMessageId, orderedMessageIds, messagesMap);
      if (turnIds.length > 0) {
        try {
          await window.service.agentInstance.deleteMessages(agentId, turnIds);
        } catch (error) {
          void window.service.native.log('error', 'Failed to delete turn for retry', { error });
        }
      }

      // Re-send the user message
      await window.service.agentInstance.sendMsgToAgent(agentId, {
        text: userMessage.content,
      });
    },
  };
};
