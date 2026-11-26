import type { AttachmentReference } from 'memeloop';

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
