import type { AgentCommittedAttachment, AgentDeviceRpcPendingUserMessage, AgentDeviceRpcRunTurnRequest, AttachmentReference, WikiTiddlerAttachment } from 'memeloop';

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

/** Exact durable run input accepted by the main-process runtime adapter. */
export interface DesktopAgentExecuteRunRequest extends Omit<AgentDeviceRpcRunTurnRequest, 'userMessage'> {
  attachment?: AgentCommittedAttachment;
  wikiTiddlers?: readonly WikiTiddlerAttachment[];
}

/** Renderer-safe pending payload prepared by host-native wiki resolution. */
export interface DesktopPreparedAgentUserMessage {
  message: string;
  userMessage: AgentDeviceRpcPendingUserMessage;
}

/** Scoped range read used only while forwarding an authorized attachment. */
export interface ReadDesktopAgentAttachmentChunkInput {
  conversationId: string;
  reference: AttachmentReference;
  offset: number;
  maxBytes: number;
}
