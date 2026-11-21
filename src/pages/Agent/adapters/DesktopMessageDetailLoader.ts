import { createAgentRunLogDetailLoader, getDisplayTruncation, type MessageDetailLoader } from '@memeloop/react-ui/chat';

import { createDesktopAgentConversationClient } from './DesktopAgentConversationClient';
import { loadDesktopMessageDetail } from './DesktopMessageContent';

export { assertDesktopMessageHydrationIdentity, assertDesktopMessageIdentity, canonicalMessageHydrationIdentity, loadDesktopCanonicalMessage } from './DesktopMessageContent';

export function createDesktopMessageDetailLoader(): MessageDetailLoader {
  const client = createDesktopAgentConversationClient();
  const runLogLoader = createAgentRunLogDetailLoader({
    pull: async ({ message, cursor, limit, maxBytes, signal }) => {
      const response = await client.getTurnDetail({
        conversationId: message.conversationId,
        turnId: message.turnId,
        cursor,
        direction: 'forward',
        limit,
        maxBytes,
      }, { signal });
      return {
        items: response.items.map(item => ({ label: item.role, content: item.content })),
        truncated: response.hasMoreAfter,
        ...(response.nextCursor === undefined ? {} : { nextCursor: response.nextCursor }),
      };
    },
  });

  return async (message, request) => {
    if (message.detailRef?.type === 'agent-run') return runLogLoader(message, request);
    if (getDisplayTruncation(message)?.capability !== 'detail') return null;
    return loadDesktopMessageDetail(message, request);
  };
}
