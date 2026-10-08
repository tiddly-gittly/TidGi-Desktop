import type { ConversationTimelinePageClient, ConversationTimelinePageRequest } from '@memeloop/react-ui/chat';

const DESKTOP_TIMELINE_PAGE_LIMIT = 50;
const DESKTOP_TIMELINE_PAGE_MAX_BYTES = 256 * 1024;

function assertTimelineRequest(request: ConversationTimelinePageRequest): void {
  if (!Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > DESKTOP_TIMELINE_PAGE_LIMIT) {
    throw new RangeError(`Desktop timeline pages are limited to ${DESKTOP_TIMELINE_PAGE_LIMIT} entries`);
  }
  if (!Number.isSafeInteger(request.maxBytes) || request.maxBytes < 1 || request.maxBytes > DESKTOP_TIMELINE_PAGE_MAX_BYTES) {
    throw new RangeError(`Desktop timeline pages are limited to ${DESKTOP_TIMELINE_PAGE_MAX_BYTES} bytes`);
  }
}

/** Desktop host binding for the shared revisioned timeline controller. */
export function createDesktopConversationTimelineClient(): ConversationTimelinePageClient {
  return {
    async getPage(request, options) {
      options.signal.throwIfAborted();
      assertTimelineRequest(request);
      const page = await window.service.agentInstance.getAgentConversationTimelinePage(request.conversationId, {
        limit: request.limit,
        maxBytes: request.maxBytes,
        expectedRevision: request.expectedRevision,
        beforeCursor: request.beforeCursor,
        afterCursor: request.afterCursor,
        aroundEntryIndex: request.aroundEntryIndex,
      });
      options.signal.throwIfAborted();
      return page;
    },
  };
}
