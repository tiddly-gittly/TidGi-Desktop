import { createHash } from 'node:crypto';

import { MEMELOOP_VISIBLE_ATTACHMENT_MAX_BYTES, MEMELOOP_VISIBLE_ATTACHMENT_MAX_COUNT, messageHydrationIdentity, messageHydrationRevision } from '@memeloop/react-ui/chat';
import type { ChatMessage, ConversationMessageIdentity } from 'memeloop';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDesktopVisibleAttachmentLoader } from '../DesktopVisibleAttachmentLoader';

const mutableService = window.service as unknown as Record<string, unknown>;
const originalAgentInstance = mutableService.agentInstance;
const imageBytes = new Uint8Array(300_000).map((_, index) => index % 251);
const secondImageBytes = new Uint8Array(600_000).map((_, index) => (index * 7) % 251);

function imageReference(data: Uint8Array, filename = 'durable.png') {
  return {
    contentHash: `sha256:${createHash('sha256').update(data).digest('hex')}`,
    filename,
    mimeType: 'image/png',
    size: data.byteLength,
  };
}

function canonicalMessage(references = [imageReference(imageBytes)]): ChatMessage {
  return {
    messageId: 'message-image',
    conversationId: 'conversation-image',
    turnId: 'message-image',
    originNodeId: 'peer-desktop',
    originSequence: 4,
    lamportClock: 5,
    timestamp: 6,
    role: 'user',
    content: 'describe image',
    parts: [{ type: 'text', text: 'describe image' }, ...references.map(attachment => ({ type: 'attachment' as const, attachment }))],
    attachments: references,
  };
}

function projectedMessage(canonical = canonicalMessage()): ChatMessage {
  const { attachments: _attachments, parts: _parts, ...projection } = canonical;
  return {
    ...projection,
    metadata: {
      displayTruncation: {
        truncated: true,
        originalCharacterCount: projection.content.length,
        originalEstimatedBytes: projection.content.length,
        originalEstimatedRenderRows: 1,
        contentTruncated: false,
        omittedFields: ['parts', 'attachments'],
        capability: 'detail',
      },
    },
  };
}

function identity(message: ChatMessage): ConversationMessageIdentity {
  return {
    messageId: message.messageId,
    timestamp: message.timestamp,
    lamportClock: message.lamportClock,
    originNodeId: message.originNodeId,
  };
}

describe('DesktopVisibleAttachmentLoader', () => {
  beforeEach(() => {
    mutableService.agentInstance = {};
  });

  afterEach(() => {
    mutableService.agentInstance = originalAgentInstance;
    vi.restoreAllMocks();
  });

  it('recovers authoritative references and reads scoped bounded chunks', async () => {
    const canonical = canonicalMessage();
    const projection = projectedMessage(canonical);
    const canonicalBytes = new TextEncoder().encode(JSON.stringify(canonical));
    const getAgentMessageIdentity = vi.fn(async () => identity(canonical));
    const readAgentAttachmentChunk = vi.fn(async ({
      offset,
      maxBytes,
    }: {
      offset: number;
      maxBytes: number;
    }) => imageBytes.slice(offset, offset + maxBytes));
    mutableService.agentInstance = {
      getAgentMessageIdentity,
      readAgentMessageDetailRange: vi.fn(async (_conversationId: string, _messageId: string, offset: number, maxBytes: number) => ({
        found: true as const,
        offset,
        totalBytes: canonicalBytes.byteLength,
        bytes: canonicalBytes.slice(offset, offset + maxBytes),
      })),
      readAgentAttachmentChunk,
    };
    const controller = new AbortController();
    const revision = messageHydrationRevision(projection, 'resident-r1');

    const result = await createDesktopVisibleAttachmentLoader()({
      message: projection,
      identity: messageHydrationIdentity(projection),
      revision,
      references: [],
      referencesOmitted: true,
      maxCount: MEMELOOP_VISIBLE_ATTACHMENT_MAX_COUNT,
      maxBytes: MEMELOOP_VISIBLE_ATTACHMENT_MAX_BYTES,
      signal: controller.signal,
    });

    expect(result).toMatchObject({ identity: messageHydrationIdentity(projection), revision });
    expect(result?.attachments[0]?.source).toMatchObject({ kind: 'bytes', data: imageBytes });
    expect(readAgentAttachmentChunk).toHaveBeenCalledTimes(2);
    expect(readAgentAttachmentChunk).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        conversationId: canonical.conversationId,
        reference: canonical.attachments?.[0],
        offset: 0,
        maxBytes: 256 * 1024,
      }),
    );
    // Canonical detail performs before/after checks and the completed byte read
    // performs one more exact identity fence.
    expect(getAgentMessageIdentity).toHaveBeenCalledTimes(3);
  });

  it('assembles two multi-chunk images and verifies both hashes before returning', async () => {
    const firstReference = imageReference(imageBytes);
    const secondReference = imageReference(secondImageBytes, 'second.png');
    const references = [firstReference, secondReference];
    const sourceByHash = new Map([
      [firstReference.contentHash, imageBytes],
      [secondReference.contentHash, secondImageBytes],
    ]);
    const canonical = canonicalMessage(references);
    const projection = projectedMessage(canonical);
    const canonicalBytes = new TextEncoder().encode(JSON.stringify(canonical));
    const readAgentAttachmentChunk = vi.fn(async ({
      reference,
      offset,
      maxBytes,
    }: {
      reference: { contentHash: string };
      offset: number;
      maxBytes: number;
    }) => sourceByHash.get(reference.contentHash)?.slice(offset, offset + maxBytes) ?? null);
    mutableService.agentInstance = {
      getAgentMessageIdentity: vi.fn(async () => identity(canonical)),
      readAgentMessageDetailRange: vi.fn(async (_conversationId: string, _messageId: string, offset: number, maxBytes: number) => ({
        found: true as const,
        offset,
        totalBytes: canonicalBytes.byteLength,
        bytes: canonicalBytes.slice(offset, offset + maxBytes),
      })),
      readAgentAttachmentChunk,
    };

    const result = await createDesktopVisibleAttachmentLoader()({
      message: projection,
      identity: messageHydrationIdentity(projection),
      revision: messageHydrationRevision(projection),
      references: [],
      referencesOmitted: true,
      maxCount: MEMELOOP_VISIBLE_ATTACHMENT_MAX_COUNT,
      maxBytes: MEMELOOP_VISIBLE_ATTACHMENT_MAX_BYTES,
      signal: new AbortController().signal,
    });

    expect(result?.attachments).toHaveLength(2);
    expect(result?.attachments[0]?.source).toMatchObject({ kind: 'bytes', data: imageBytes });
    expect(result?.attachments[1]?.source).toMatchObject({ kind: 'bytes', data: secondImageBytes });
    expect(readAgentAttachmentChunk).toHaveBeenCalledTimes(5);
  });

  it('rejects same-sized corrupted bytes whose SHA-256 does not match the canonical reference', async () => {
    const canonical = canonicalMessage();
    const projection = projectedMessage(canonical);
    const canonicalBytes = new TextEncoder().encode(JSON.stringify(canonical));
    const corrupted = imageBytes.slice();
    corrupted[corrupted.length - 1] ^= 1;
    mutableService.agentInstance = {
      getAgentMessageIdentity: vi.fn(async () => identity(canonical)),
      readAgentMessageDetailRange: vi.fn(async (_conversationId: string, _messageId: string, offset: number, maxBytes: number) => ({
        found: true as const,
        offset,
        totalBytes: canonicalBytes.byteLength,
        bytes: canonicalBytes.slice(offset, offset + maxBytes),
      })),
      readAgentAttachmentChunk: vi.fn(async ({ offset, maxBytes }: { offset: number; maxBytes: number }) => corrupted.slice(offset, offset + maxBytes)),
    };

    await expect(
      createDesktopVisibleAttachmentLoader()({
        message: projection,
        identity: messageHydrationIdentity(projection),
        revision: messageHydrationRevision(projection),
        references: [],
        referencesOmitted: true,
        maxCount: MEMELOOP_VISIBLE_ATTACHMENT_MAX_COUNT,
        maxBytes: MEMELOOP_VISIBLE_ATTACHMENT_MAX_BYTES,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('visible attachment content hash mismatch');
  });

  it('rejects a request identity that differs from its resident projection instead of echoing it', async () => {
    const projection = projectedMessage();
    const getAgentMessageIdentity = vi.fn();
    mutableService.agentInstance = { getAgentMessageIdentity };

    await expect(
      createDesktopVisibleAttachmentLoader()({
        message: projection,
        identity: { ...messageHydrationIdentity(projection), originSequence: projection.originSequence + 1 },
        revision: messageHydrationRevision(projection),
        references: [],
        referencesOmitted: true,
        maxCount: MEMELOOP_VISIBLE_ATTACHMENT_MAX_COUNT,
        maxBytes: MEMELOOP_VISIBLE_ATTACHMENT_MAX_BYTES,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('message detail hydration identity does not match its projection');
    expect(getAgentMessageIdentity).not.toHaveBeenCalled();
  });

  it('aborts between scoped range reads and never returns a partial image', async () => {
    const canonical = canonicalMessage();
    const projection = projectedMessage(canonical);
    const canonicalBytes = new TextEncoder().encode(JSON.stringify(canonical));
    const controller = new AbortController();
    mutableService.agentInstance = {
      getAgentMessageIdentity: vi.fn(async () => identity(canonical)),
      readAgentMessageDetailRange: vi.fn(async (_conversationId: string, _messageId: string, offset: number, maxBytes: number) => ({
        found: true as const,
        offset,
        totalBytes: canonicalBytes.byteLength,
        bytes: canonicalBytes.slice(offset, offset + maxBytes),
      })),
      readAgentAttachmentChunk: vi.fn(async () => {
        controller.abort(new DOMException('hidden', 'AbortError'));
        return imageBytes.slice(0, 256 * 1024);
      }),
    };

    await expect(
      createDesktopVisibleAttachmentLoader()({
        message: projection,
        identity: messageHydrationIdentity(projection),
        revision: messageHydrationRevision(projection),
        references: [],
        referencesOmitted: true,
        maxCount: MEMELOOP_VISIBLE_ATTACHMENT_MAX_COUNT,
        maxBytes: MEMELOOP_VISIBLE_ATTACHMENT_MAX_BYTES,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
