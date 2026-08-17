/**
 * DesktopAgentConversationClient — wraps message operations
 * to implement the headless AgentConversationClient interface.
 *
 * Tracks the current agentId internally — set via getMessages/sendMessage calls.
 */

import type { AgentConversationClient, ChatMessage } from 'memeloop';
import { deleteConversationTurn } from './conversationTurn';

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
              for (const message of messages) listener(message);
            }
          });
        agentSubscriptions.set(agentId, {
          unsubscribe: () => {
            subscription.unsubscribe();
          },
        });
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
      const turn = await deleteConversationTurn(agentId, userMessageId, orderedMessageIds, messagesMap);
      return turn?.userMessage.content;
    },

    retryTurn: async (userMessageId) => {
      const agentId = currentAgentId;
      if (!agentId) return;

      const agent = await window.service.agentInstance.getAgent(agentId);
      if (!agent) return;

      const messages = agent.messages ?? [];
      const orderedMessageIds = messages.map((m) => m.messageId);
      const messagesMap = new Map(messages.map((m) => [m.messageId, m]));
      const turn = await deleteConversationTurn(agentId, userMessageId, orderedMessageIds, messagesMap);
      if (!turn) return;

      // Re-send the user message
      await window.service.agentInstance.sendMsgToAgent(agentId, {
        text: turn.userMessage.content,
      });
    },
  };
};
