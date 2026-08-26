import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDesktopAgentConversationClient } from '../DesktopAgentConversationClient';

describe('DesktopAgentConversationClient', () => {
  const mutableService = window.service as unknown as { agentInstance: Record<string, unknown> };
  let originalAgentInstance: Record<string, unknown>;

  beforeEach(() => {
    originalAgentInstance = mutableService.agentInstance;
  });

  afterEach(() => {
    mutableService.agentInstance = originalAgentInstance;
    vi.restoreAllMocks();
  });

  it('omits absent cursors so an empty page remains strict canonical JSON', async () => {
    mutableService.agentInstance = {
      ...originalAgentInstance,
      getAgentMessagePage: vi.fn(async () => ({
        conversationId: 'agent-1',
        revision: 'revision-1',
        items: [],
        hasMoreBefore: false,
        hasMoreAfter: false,
      })),
    };

    const page = await createDesktopAgentConversationClient().getMessagePage('agent-1', {
      direction: 'backward',
      limit: 50,
      maxBytes: 256 * 1024,
      mode: 'on-demand',
    });

    expect(page).toStrictEqual({
      reset: false,
      conversationId: 'agent-1',
      revision: 'revision-1',
      items: [],
      hasMoreBefore: false,
      hasMoreAfter: false,
    });
    expect(Reflect.ownKeys(page)).not.toContain('previousCursor');
    expect(Reflect.ownKeys(page)).not.toContain('nextCursor');
    expect(JSON.parse(JSON.stringify(page))).toStrictEqual(page);
  });

  it('fails closed when a non-terminal page omits its boundary cursor', async () => {
    mutableService.agentInstance = {
      ...originalAgentInstance,
      getAgentMessagePage: vi.fn(async () => ({
        conversationId: 'agent-1',
        revision: 'revision-1',
        items: [],
        hasMoreBefore: true,
        hasMoreAfter: false,
      })),
    };

    await expect(
      createDesktopAgentConversationClient().getMessagePage('agent-1', {
        direction: 'backward',
        limit: 50,
        maxBytes: 256 * 1024,
        mode: 'on-demand',
      }),
    ).rejects.toThrow('Desktop conversation page omitted a required boundary cursor');
  });
});
