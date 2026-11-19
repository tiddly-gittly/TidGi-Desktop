import { AGENT_USER_MESSAGE_LIMITS } from 'memeloop';

export const WIKI_TIDDLER_CONTENT_LIMITS = Object.freeze(
  {
    perAttachmentBytes: 64 * 1_024,
    totalBytes: Math.min(192 * 1_024, AGENT_USER_MESSAGE_LIMITS.contentBytes),
  } as const,
);

export const WIKI_TIDDLER_CONTENT_TRUNCATION_CODE = 'ATTACHMENT_CONTENT_TRUNCATED' as const;
export const WIKI_TIDDLER_MESSAGE_BUDGET_ERROR_CODE = 'ATTACHMENT_MESSAGE_BUDGET_EXCEEDED' as const;

export const TIDDLYWIKI_DROP_LIMITS = Object.freeze(
  {
    attachments: 16,
    payloadBytes: 256 * 1024,
    titleBytes: 8 * 1024,
    workspaceBytes: 1024,
  } as const,
);

export const DESKTOP_ATTACHMENT_UPLOAD_LIMITS = Object.freeze(
  {
    chunkBytes: 256 * 1024,
    totalBytes: 64 * 1024 * 1024,
    filenameBytes: 1024,
    mimeTypeBytes: 256,
  } as const,
);
