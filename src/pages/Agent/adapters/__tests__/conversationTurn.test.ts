import type { ChatMessage } from 'memeloop';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteConversationTurn, getConversationTurn } from '../conversationTurn';

const message = (messageId: string, role: ChatMessage['role'], content = messageId) => ({
  messageId,
  role,
  content,
} as ChatMessage);

describe('conversationTurn', () => {
  const mutableService = window.service as unknown as Record<string, unknown>;
  let originalAgentInstance: unknown;

  beforeEach(() => {
    originalAgentInstance = mutableService.agentInstance;
  });

  afterEach(() => {
    mutableService.agentInstance = originalAgentInstance;
    vi.restoreAllMocks();
  });

  it('stops a turn at the next user message', () => {
    const messages = new Map([
      ['user-1', message('user-1', 'user')],
      ['assistant-1', message('assistant-1', 'assistant')],
      ['tool-1', message('tool-1', 'tool')],
      ['user-2', message('user-2', 'user')],
    ]);

    expect(getConversationTurn('user-1', [...messages.keys()], messages)?.messageIds).toEqual([
      'user-1',
      'assistant-1',
      'tool-1',
    ]);
  });

  it('rethrows persistence failures so callers cannot diverge from the backend', async () => {
    const failure = new Error('database unavailable');
    mutableService.agentInstance = { deleteAgentTurn: vi.fn().mockRejectedValue(failure) };
    const messages = new Map([['user-1', message('user-1', 'user')]]);

    await expect(deleteConversationTurn('agent-1', 'user-1', ['user-1'], messages)).rejects.toBe(failure);
  });
});
