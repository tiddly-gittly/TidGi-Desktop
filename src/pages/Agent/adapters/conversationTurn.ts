import type { ChatMessage } from 'memeloop';

export interface ConversationTurn {
  messageIds: string[];
  userMessage: ChatMessage;
}

/** Resolve the user message and every response before the next user turn. */
export function getConversationTurn(
  userMessageId: string,
  orderedMessageIds: string[],
  messages: Map<string, ChatMessage>,
): ConversationTurn | undefined {
  const startIndex = orderedMessageIds.indexOf(userMessageId);
  const userMessage = messages.get(userMessageId);
  if (startIndex === -1 || !userMessage || userMessage.role !== 'user') return undefined;

  const messageIds = [userMessageId];
  for (let index = startIndex + 1; index < orderedMessageIds.length; index++) {
    const message = messages.get(orderedMessageIds[index]);
    if (message?.role === 'user') break;
    messageIds.push(orderedMessageIds[index]);
  }
  return { messageIds, userMessage };
}

/**
 * Delete a complete turn from persistence. Failures are logged and rethrown so
 * callers never update UI state or retry a prompt while stale rows remain.
 */
export async function deleteConversationTurn(
  agentId: string,
  userMessageId: string,
  _orderedMessageIds: string[],
  _messages: Map<string, ChatMessage>,
): Promise<ConversationTurn | undefined> {
  try {
    return await window.service.agentInstance.deleteAgentTurn(agentId, userMessageId);
  } catch (error) {
    void window.service.native.log('error', 'Failed to delete conversation turn', {
      agentId,
      error,
      userMessageId,
    });
    throw error;
  }
}
