import type { ConversationMessageListProjection } from 'memeloop';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDesktopMessageReasoningLoader } from '../DesktopMessageReasoningLoader';

const message: ConversationMessageListProjection = {
  messageId: 'assistant-1',
  turnId: 'user-1',
  conversationId: 'conversation-1',
  originNodeId: 'peer-1',
  originSequence: 2,
  lamportClock: 3,
  timestamp: 4,
  role: 'assistant',
  content: 'answer',
};

const identity = {
  messageId: message.messageId,
  timestamp: message.timestamp,
  lamportClock: message.lamportClock,
  originNodeId: message.originNodeId,
};

describe('DesktopMessageReasoningLoader', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the reasoning-only range behind stable message identity checks', async () => {
    const bytes = new TextEncoder().encode('推理');
    const getAgentMessageIdentity = vi.fn().mockResolvedValue(identity);
    const readAgentMessageReasoningRange = vi.fn().mockResolvedValue({
      found: true,
      offset: 0,
      totalBytes: bytes.byteLength,
      bytes,
    });
    Object.defineProperty(window.service, 'agentInstance', {
      configurable: true,
      value: { getAgentMessageIdentity, readAgentMessageReasoningRange },
    });

    const result = await createDesktopMessageReasoningLoader()(message, {
      offset: 0,
      maxBytes: 64 * 1024,
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({ found: true, offset: 0, totalBytes: bytes.byteLength });
    expect(readAgentMessageReasoningRange).toHaveBeenCalledWith('conversation-1', 'assistant-1', 0, 64 * 1024);
    expect(getAgentMessageIdentity).toHaveBeenCalledTimes(2);
  });

  it('rejects identity drift and observes cancellation before IPC', async () => {
    const getAgentMessageIdentity = vi.fn().mockResolvedValue({ ...identity, lamportClock: 99 });
    const readAgentMessageReasoningRange = vi.fn();
    Object.defineProperty(window.service, 'agentInstance', {
      configurable: true,
      value: { getAgentMessageIdentity, readAgentMessageReasoningRange },
    });
    await expect(
      createDesktopMessageReasoningLoader()(message, {
        offset: 0,
        maxBytes: 64 * 1024,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('identity does not match');
    expect(readAgentMessageReasoningRange).not.toHaveBeenCalled();

    const cancelled = new AbortController();
    cancelled.abort(new Error('cancelled'));
    await expect(
      createDesktopMessageReasoningLoader()(message, {
        offset: 0,
        maxBytes: 64 * 1024,
        signal: cancelled.signal,
      }),
    ).rejects.toThrow('cancelled');
  });
});
