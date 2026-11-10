import type { AttachmentReference } from 'memeloop';

/** Renderer/main attachment staging contract. Keep this module browser-safe. */
export const DESKTOP_ATTACHMENT_UPLOAD_LIMITS = Object.freeze(
  {
    chunkBytes: 256 * 1024,
    // Must never exceed Core ATTACHMENT_UPLOAD_LIMITS.totalBytes.
    totalBytes: 64 * 1024 * 1024,
    filenameBytes: 1024,
    mimeTypeBytes: 256,
  } as const,
);

export interface BeginDesktopAttachmentUploadInput {
  conversationId: string;
  filename: string;
  mimeType: string;
  totalBytes: number;
  sha256?: string;
}

export interface WriteDesktopAttachmentChunkInput {
  uploadId: string;
  conversationId: string;
  offset: number;
  data: Uint8Array;
}

export interface DesktopAttachmentUploadScope {
  uploadId: string;
  conversationId: string;
}

/** Scoped range read used only while forwarding an authorized attachment. */
export interface ReadDesktopAgentAttachmentChunkInput {
  conversationId: string;
  reference: AttachmentReference;
  offset: number;
  maxBytes: number;
}
