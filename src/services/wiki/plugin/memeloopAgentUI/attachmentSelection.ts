import type { WebSelectedAttachmentBatch } from '@memeloop/react-ui/chat';

export interface AttachmentSelection extends WebSelectedAttachmentBatch {
  revision: number;
}

export const EMPTY_ATTACHMENTS: AttachmentSelection = Object.freeze({
  wikiTiddlers: Object.freeze([]),
  revision: 0,
});

export function nextAttachmentSelection(
  current: AttachmentSelection,
  batch: WebSelectedAttachmentBatch,
): AttachmentSelection {
  return {
    ...(batch.file === undefined ? {} : { file: batch.file }),
    wikiTiddlers: Object.freeze([...batch.wikiTiddlers]),
    revision: current.revision + 1,
  };
}

/** Clear only the exact attachment snapshot captured by a successful send. */
export function clearAttachmentSelectionAtRevision(
  current: AttachmentSelection,
  sentRevision: number,
): AttachmentSelection {
  return current.revision === sentRevision
    ? { wikiTiddlers: Object.freeze([]), revision: current.revision + 1 }
    : current;
}
