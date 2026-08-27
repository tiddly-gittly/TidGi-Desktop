import {
  imageAttachmentReferences,
  MEMELOOP_VISIBLE_ATTACHMENT_CHUNK_BYTES,
  type MemeLoopVisibleAttachment,
  type MemeLoopVisibleAttachmentLoader,
  messageHydrationIdentity,
} from '@memeloop/react-ui/chat';

import { assertDesktopMessageHydrationIdentity, assertDesktopMessageIdentity, loadDesktopCanonicalMessage } from './DesktopMessageDetailLoader';

/**
 * Renderer-side bounded loader. Main process re-authorizes every range against
 * the exact conversation, so no bare content-hash read crosses IPC.
 */
export function createDesktopVisibleAttachmentLoader(): MemeLoopVisibleAttachmentLoader {
  return async request => {
    request.signal.throwIfAborted();
    assertDesktopMessageHydrationIdentity(request.message, request.identity);
    const canonical = await loadDesktopCanonicalMessage(request.message, request.signal);
    if (!canonical) return null;
    const canonicalIdentity = messageHydrationIdentity(canonical);
    assertDesktopMessageHydrationIdentity(canonical, request.identity);

    const attachments: MemeLoopVisibleAttachment[] = [];
    let totalBytes = 0;
    for (const reference of imageAttachmentReferences(canonical)) {
      request.signal.throwIfAborted();
      if (attachments.length >= request.maxCount || totalBytes + reference.size > request.maxBytes) break;
      const data = new Uint8Array(reference.size);
      let offset = 0;
      while (offset < reference.size) {
        request.signal.throwIfAborted();
        const maximum = Math.min(MEMELOOP_VISIBLE_ATTACHMENT_CHUNK_BYTES, reference.size - offset);
        const chunk = await window.service.agentInstance.readAgentAttachmentChunk({
          conversationId: canonicalIdentity.conversationId,
          reference,
          offset,
          maxBytes: maximum,
        });
        request.signal.throwIfAborted();
        if (!isUint8ArrayView(chunk) || chunk.byteLength < 1 || chunk.byteLength > maximum) {
          throw new Error('invalid visible attachment range');
        }
        data.set(chunk, offset);
        offset += chunk.byteLength;
      }
      await assertAttachmentContentHash(data, reference.contentHash, request.signal);
      totalBytes += data.byteLength;
      attachments.push({ reference, source: { kind: 'bytes', data } });
    }

    const finalIdentity = await window.service.agentInstance.getAgentMessageIdentity(
      canonicalIdentity.conversationId,
      canonicalIdentity.messageId,
    );
    request.signal.throwIfAborted();
    if (!finalIdentity) throw new Error('visible attachment message was removed while loading');
    assertDesktopMessageIdentity(canonical, finalIdentity);
    assertDesktopMessageHydrationIdentity(request.message, canonicalIdentity);
    return { identity: canonicalIdentity, revision: request.revision, attachments };
  };
}

async function assertAttachmentContentHash(data: Uint8Array, expected: string, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (!/^sha256:[0-9a-f]{64}$/u.test(expected)) throw new Error('invalid visible attachment content hash');
  // Web Crypto is available in the sandboxed renderer and keeps hashing
  // browser-portable. The input is already bounded by the 16 MiB hydration
  // contract, so the non-streaming digest cannot grow without bound.
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('visible attachment SHA-256 is unavailable');
  // DOM BufferSource deliberately excludes SharedArrayBuffer. Copy the bounded
  // host view into an owned ArrayBuffer before crossing the Web Crypto API.
  const digestInput = new Uint8Array(data.byteLength);
  digestInput.set(data);
  const digest = new Uint8Array(await subtle.digest('SHA-256', digestInput.buffer));
  signal.throwIfAborted();
  const actual = `sha256:${Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')}`;
  if (actual !== expected) throw new Error('visible attachment content hash mismatch');
}

function isUint8ArrayView(value: unknown): value is Uint8Array {
  return ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === '[object Uint8Array]';
}
