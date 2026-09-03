import { type MemeLoopMessageReasoningLoader, messageHydrationIdentity } from '@memeloop/react-ui/chat';

import { assertDesktopMessageIdentity } from './DesktopMessageDetailLoader';

/** Identity-fenced bridge to Desktop's reasoning-only UTF-8 range query. */
export function createDesktopMessageReasoningLoader(): MemeLoopMessageReasoningLoader {
  return async (message, request) => {
    request.signal.throwIfAborted();
    const before = await window.service.agentInstance.getAgentMessageIdentity(
      message.conversationId,
      message.messageId,
    );
    request.signal.throwIfAborted();
    if (!before) return { found: false };
    assertDesktopMessageIdentity(messageHydrationIdentity(message), before);
    const page = await window.service.agentInstance.readAgentMessageReasoningRange(
      message.conversationId,
      message.messageId,
      request.offset,
      request.maxBytes,
    );
    request.signal.throwIfAborted();
    if (!page.found) return page;
    const after = await window.service.agentInstance.getAgentMessageIdentity(
      message.conversationId,
      message.messageId,
    );
    request.signal.throwIfAborted();
    if (!after) throw new Error('message reasoning identity disappeared during read');
    assertDesktopMessageIdentity(messageHydrationIdentity(message), after);
    if (
      before.messageId !== after.messageId || before.timestamp !== after.timestamp ||
      before.lamportClock !== after.lamportClock || before.originNodeId !== after.originNodeId
    ) throw new Error('message reasoning identity changed during read');
    return page;
  };
}
