import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDesktopAgentConversationClient } from '../DesktopAgentConversationClient';

describe('DesktopAgentConversationClient exact contracts', () => {
  const mutableService = window.service as unknown as { agentInstance: Record<string, unknown> };
  let originalAgentInstance: Record<string, unknown>;

  beforeEach(() => {
    originalAgentInstance = mutableService.agentInstance;
  });

  afterEach(() => {
    mutableService.agentInstance = originalAgentInstance;
    vi.restoreAllMocks();
  });

  it('passes the opaque Core page request and response through unchanged', async () => {
    const response = {
      reset: false as const,
      conversationId: 'agent-1',
      revision: 'revision-1',
      items: [],
      hasMoreBefore: true,
      hasMoreAfter: false,
      previousCursor: 'opaque-older',
    };
    const getAgentMessagePage = vi.fn(async () => response);
    mutableService.agentInstance = { ...originalAgentInstance, getAgentMessagePage };
    const options = {
      direction: 'backward' as const,
      cursor: 'opaque-current',
      expectedRevision: 'revision-1',
      limit: 50,
      maxBytes: 256 * 1024,
      mode: 'on-demand' as const,
    };

    const page = await createDesktopAgentConversationClient().getMessagePage('agent-1', options);

    expect(getAgentMessagePage).toHaveBeenCalledWith('agent-1', options);
    expect(page).toBe(response);
  });

  it('passes the exact Core window request and response through unchanged', async () => {
    const request = {
      conversationId: 'agent-1',
      focus: { kind: 'message' as const, messageId: 'message-1', turnId: 'turn-1', cursor: 'opaque-focus' },
      expectedRevision: 'revision-1',
      maxMessages: 50,
      maxBytes: 256 * 1024,
    };
    const response = {
      reset: false as const,
      conversationId: 'agent-1',
      revision: 'revision-1',
      focus: request.focus,
      recenterAnchor: { messageId: 'message-1', turnId: 'turn-1' },
      items: [],
      hasMoreBefore: false,
      hasMoreAfter: true,
      nextCursor: 'opaque-newer',
    };
    const getAgentMessageWindowAround = vi.fn(async () => response);
    mutableService.agentInstance = { ...originalAgentInstance, getAgentMessageWindowAround };

    const windowResult = await createDesktopAgentConversationClient().getMessageWindowAround(request);

    expect(getAgentMessageWindowAround).toHaveBeenCalledWith(request);
    expect(windowResult).toBe(response);
  });
});
