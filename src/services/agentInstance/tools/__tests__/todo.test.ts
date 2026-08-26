import type { ChatMessage } from 'memeloop';
import { describe, expect, it } from 'vitest';

import { extractLatestTodoText } from '../todo';

function toolMessage(content: string): ChatMessage {
  return {
    messageId: 'tool-1',
    turnId: 'turn-1',
    conversationId: 'agent-1',
    originNodeId: 'test',
    originSequence: 1,
    timestamp: 1,
    lamportClock: 1,
    role: 'tool',
    content,
  };
}

describe('persistent todo prompt state', () => {
  it('reads the canonical defineTool result format used by Desktop', () => {
    const text = '- [x] Inspect\n- [ ] Verify';
    const payload = JSON.stringify({ type: 'todo-update', text });

    expect(extractLatestTodoText([
      toolMessage(`Result from manage-todo: ${payload}`),
    ])).toBe(text);
  });

  it('reads legacy result wrappers and ignores malformed results', () => {
    expect(extractLatestTodoText([
      toolMessage('Result from manage-todo: {broken'),
      toolMessage('Result: {"type":"todo-update","text":"- [ ] Legacy"}'),
    ])).toBe('- [ ] Legacy');
  });
});
