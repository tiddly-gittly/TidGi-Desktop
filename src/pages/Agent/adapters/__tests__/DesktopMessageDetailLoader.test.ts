import { MEMELOOP_MESSAGE_DETAIL_LIMIT, MEMELOOP_MESSAGE_DETAIL_MAX_BYTES } from '@memeloop/react-ui/chat';
import type { ChatMessage, ConversationMessageIdentity } from 'memeloop';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDesktopMessageDetailLoader } from '../DesktopMessageDetailLoader';

const mutableService = window.service as unknown as Record<string, unknown>;
const originalAgentInstance = mutableService.agentInstance;

function identity(message: ChatMessage): ConversationMessageIdentity {
  return {
    messageId: message.messageId,
    timestamp: message.timestamp,
    lamportClock: message.lamportClock,
    originNodeId: message.originNodeId,
  };
}

function fullMessage(content = 'complete 🙂 response'): ChatMessage {
  return {
    messageId: 'message-1',
    conversationId: 'conversation-1',
    turnId: 'turn-1',
    originNodeId: 'peer-desktop',
    originSequence: 1,
    lamportClock: 1,
    timestamp: 1,
    role: 'assistant',
    content,
    reasoning_content: 'private reasoning',
  };
}

function projection(message: ChatMessage): ChatMessage {
  return {
    ...message,
    content: 'complete…',
    reasoning_content: undefined,
    metadata: {
      displayTruncation: {
        truncated: true,
        originalCharacterCount: Array.from(message.content).length,
        originalEstimatedBytes: new TextEncoder().encode(message.content).byteLength,
        originalEstimatedRenderRows: 1,
        contentTruncated: true,
        omittedFields: ['reasoning_content'],
        capability: 'detail',
      },
    },
  };
}

function request(signal = new AbortController().signal) {
  return {
    limit: MEMELOOP_MESSAGE_DETAIL_LIMIT,
    maxBytes: MEMELOOP_MESSAGE_DETAIL_MAX_BYTES,
    signal,
  } as const;
}

describe('DesktopMessageDetailLoader', () => {
  beforeEach(() => {
    mutableService.agentInstance = {};
  });

  afterEach(() => {
    mutableService.agentInstance = originalAgentInstance;
    vi.restoreAllMocks();
  });

  it('streams arbitrary UTF-8 byte ranges, validates identity, and formats omitted fields', async () => {
    const canonical = fullMessage();
    const bytes = new TextEncoder().encode(JSON.stringify(canonical));
    const emojiStart = findSubarray(bytes, new TextEncoder().encode('🙂'));
    const split = emojiStart + 1;
    const readAgentMessageDetailRange = vi.fn(async (_conversationId: string, _messageId: string, offset: number) => ({
      found: true as const,
      offset,
      totalBytes: bytes.byteLength,
      bytes: offset === 0 ? bytes.slice(0, split) : bytes.slice(split),
    }));
    mutableService.agentInstance = {
      getAgentMessageIdentity: vi.fn(async () => identity(canonical)),
      readAgentMessageDetailRange,
    };

    const page = await createDesktopMessageDetailLoader()(projection(canonical), request());

    expect(page).toMatchObject({ itemCount: 1, truncated: false });
    expect(page?.text).toContain(canonical.content);
    expect(page?.text).toContain('private reasoning');
    expect(readAgentMessageDetailRange).toHaveBeenCalledTimes(2);
  });

  it('returns one UI-bounded fragment even when canonical content is much larger', async () => {
    const canonical = fullMessage('x'.repeat(MEMELOOP_MESSAGE_DETAIL_MAX_BYTES * 2));
    const bytes = new TextEncoder().encode(JSON.stringify(canonical));
    mutableService.agentInstance = {
      getAgentMessageIdentity: vi.fn(async () => identity(canonical)),
      readAgentMessageDetailRange: vi.fn(async (_conversationId: string, _messageId: string, offset: number, maxBytes: number) => ({
        found: true as const,
        offset,
        totalBytes: bytes.byteLength,
        bytes: bytes.slice(offset, offset + maxBytes),
      })),
    };

    const page = await createDesktopMessageDetailLoader()(projection(canonical), request());

    expect(page?.truncated).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(page)).byteLength).toBeLessThanOrEqual(MEMELOOP_MESSAGE_DETAIL_MAX_BYTES);
  });

  it('fences cancellation between main-process range reads', async () => {
    const canonical = fullMessage();
    const bytes = new TextEncoder().encode(JSON.stringify(canonical));
    const controller = new AbortController();
    mutableService.agentInstance = {
      getAgentMessageIdentity: vi.fn(async () => identity(canonical)),
      readAgentMessageDetailRange: vi.fn(async () => {
        controller.abort(new DOMException('closed', 'AbortError'));
        return { found: true as const, offset: 0, totalBytes: bytes.byteLength, bytes };
      }),
    };

    await expect(createDesktopMessageDetailLoader()(projection(canonical), request(controller.signal)))
      .rejects.toMatchObject({ name: 'AbortError' });
  });

  it.each(
    [
      ['turnId', 'replacement-turn'],
      ['originSequence', 99],
    ] as const,
  )('rejects canonical %s drift that the lightweight database identity cannot represent', async (field, value) => {
    const resident = fullMessage();
    const canonical = { ...resident, [field]: value };
    const bytes = new TextEncoder().encode(JSON.stringify(canonical));
    mutableService.agentInstance = {
      getAgentMessageIdentity: vi.fn(async () => identity(canonical)),
      readAgentMessageDetailRange: vi.fn(async (_conversationId: string, _messageId: string, offset: number, maxBytes: number) => ({
        found: true as const,
        offset,
        totalBytes: bytes.byteLength,
        bytes: bytes.slice(offset, offset + maxBytes),
      })),
    };

    await expect(createDesktopMessageDetailLoader()(projection(resident), request()))
      .rejects.toThrow('message detail hydration identity does not match its projection');
  });

  it('does not request canonical detail for an ordinary untruncated message', async () => {
    mutableService.agentInstance = {
      getAgentMessageIdentity: vi.fn(),
      readAgentMessageDetailRange: vi.fn(),
    };
    await expect(createDesktopMessageDetailLoader()(fullMessage(), request())).resolves.toBeNull();
  });
});

function findSubarray(value: Uint8Array, target: Uint8Array): number {
  for (let index = 0; index <= value.length - target.length; index += 1) {
    if (target.every((byte, offset) => value[index + offset] === byte)) return index;
  }
  throw new Error('target bytes not found');
}
