import { imageAttachmentReferences, MEMELOOP_VISIBLE_ATTACHMENT_CHUNK_BYTES, type MemeLoopVisibleAttachment, type MemeLoopVisibleAttachmentLoader } from '@memeloop/react-ui/chat';

import { assertDesktopMessageIdentity, loadDesktopCanonicalMessage } from './DesktopMessageDetailLoader';

/**
 * Renderer-side bounded loader. Main process re-authorizes every range against
 * the exact conversation, so no bare content-hash read crosses IPC.
 */
export function createDesktopVisibleAttachmentLoader(): MemeLoopVisibleAttachmentLoader {
  return async request => {
    request.signal.throwIfAborted();
    const canonical = await loadDesktopCanonicalMessage(request.message, request.signal);
    if (!canonical) return null;

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
          conversationId: request.identity.conversationId,
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
      totalBytes += data.byteLength;
      attachments.push({ reference, source: { kind: 'bytes', data } });
    }

    const finalIdentity = await window.service.agentInstance.getAgentMessageIdentity(
      request.identity.conversationId,
      request.identity.messageId,
    );
    request.signal.throwIfAborted();
    if (!finalIdentity) throw new Error('visible attachment message was removed while loading');
    assertDesktopMessageIdentity(request.message, finalIdentity);
    return { identity: request.identity, revision: request.revision, attachments };
  };
}

function isUint8ArrayView(value: unknown): value is Uint8Array {
  return ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === '[object Uint8Array]';
}
