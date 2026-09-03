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
    parts: [{ type: 'text', text: content }],
  };
}

describe('persistent todo prompt state', () => {
  it('reads the canonical defineTool result format used by Desktop', () => {
    const text = '- [x] Inspect\n- [ ] Verify';
    const payload = JSON.stringify({ type: 'todo-update', text });

    expect(extractLatestTodoText([
      {
        ...toolMessage(payload),
        parts: [{
          type: 'tool-result',
          toolName: 'manage-todo',
          result: payload,
          payload: JSON.parse(payload),
        }],
      },
    ])).toBe(text);
  });

  it('ignores malformed or legacy text-only results', () => {
    expect(extractLatestTodoText([
      toolMessage('Result from manage-todo: {broken'),
      {
        ...toolMessage('{"type":"todo-update","text":"- [ ] Legacy"}'),
        parts: [{
          type: 'tool-result',
          toolName: 'manage-todo',
          result: '{broken',
          payload: { type: 'todo-update' },
        }],
      },
    ])).toBeUndefined();
  });
});
