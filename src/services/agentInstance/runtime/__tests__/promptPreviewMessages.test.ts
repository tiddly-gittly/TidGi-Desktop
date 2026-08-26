import { describe, expect, it } from 'vitest';

import type { ChatMessage } from 'memeloop';
import { includeConversationHistoryInPreview } from '../promptPreviewMessages';

function message(role: ChatMessage['role'], content: string, index: number): ChatMessage {
  return {
    messageId: `message-${index}`,
    turnId: `turn-${Math.ceil(index / 2)}`,
    conversationId: 'conversation',
    originNodeId: 'desktop',
    originSequence: index,
    timestamp: index,
    lamportClock: index,
    role,
    content,
  };
}

describe('prompt preview message ordering', () => {
  it('shows the complete multi-turn history after the system prompt', () => {
    const history = [
      message('user', 'first question', 1),
      message('agent', 'first answer', 2),
      message('user', 'follow-up question', 3),
    ];

    expect(includeConversationHistoryInPreview([
      { role: 'system', content: 'system instructions' },
      { role: 'user', content: 'follow-up question' },
    ], history)).toEqual([
      { role: 'system', content: 'system instructions' },
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first answer' },
      { role: 'user', content: 'follow-up question' },
    ]);
  });
});
