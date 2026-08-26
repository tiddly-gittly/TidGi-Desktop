import type { DroppedAttachmentSnapshot } from '@memeloop/react-ui/chat';

export interface TiddlyWikiDropAttachment {
  workspaceName: string;
  tiddlerTitle: string;
}

export type TiddlyWikiDropErrorCode =
  | 'invalid-workspace'
  | 'missing-payload'
  | 'malformed-data-uri'
  | 'payload-too-large'
  | 'malformed-json'
  | 'too-many-attachments'
  | 'invalid-attachment';

export type TiddlyWikiDropParseResult =
  | { ok: true; attachments: TiddlyWikiDropAttachment[] }
  | { ok: false; code: TiddlyWikiDropErrorCode };

export class TiddlyWikiDropValidationError extends Error {
  public readonly name = 'TiddlyWikiDropValidationError';

  public constructor(public readonly code: Exclude<TiddlyWikiDropErrorCode, 'missing-payload'>) {
    super(code);
  }
}

export const TIDDLYWIKI_DROP_LIMITS = Object.freeze(
  {
    attachments: 16,
    payloadBytes: 256 * 1024,
    titleBytes: 8 * 1024,
    workspaceBytes: 1024,
  } as const,
);

const encoder = new TextEncoder();
const unsafeTitleCharacters = /[\p{Cc}\p{Cs}\u2028\u2029]/u;

/**
 * Parse TiddlyWiki's canonical drag payload, including the data-URI mirrors
 * emitted for Firefox/legacy Chromium. Plain text is deliberately never
 * guessed as a tiddler attachment.
 */
export function parseTiddlyWikiDrop(
  snapshot: Pick<DroppedAttachmentSnapshot, 'stringData'>,
  workspaceName: string,
): TiddlyWikiDropAttachment[] {
  const result = parseTiddlyWikiDropResult(snapshot, workspaceName);
  return result.ok ? result.attachments : [];
}

/**
 * Resolve a host drop for AgentChatView. An absent TiddlyWiki payload is a
 * legitimate file-only drop; a present but invalid payload rejects the whole
 * mixed file+tiddler batch before the shared UI commits either part.
 */
export function resolveTiddlyWikiDrop(
  snapshot: Pick<DroppedAttachmentSnapshot, 'stringData'>,
  workspaceName: string,
): TiddlyWikiDropAttachment[] {
  const result = parseTiddlyWikiDropResult(snapshot, workspaceName);
  if (result.ok) return result.attachments;
  switch (result.code) {
    case 'missing-payload':
      return [];
    case 'invalid-workspace':
    case 'payload-too-large':
    case 'too-many-attachments':
    case 'invalid-attachment':
    case 'malformed-data-uri':
    case 'malformed-json':
      throw new TiddlyWikiDropValidationError(result.code);
  }
}

/** Atomically validate one canonical drop; invalid mixed batches never partially attach. */
export function parseTiddlyWikiDropResult(
  snapshot: Pick<DroppedAttachmentSnapshot, 'stringData'>,
  workspaceName: string,
): TiddlyWikiDropParseResult {
  if (
    !isBoundedText(workspaceName, TIDDLYWIKI_DROP_LIMITS.workspaceBytes) ||
    unsafeTitleCharacters.test(workspaceName)
  ) {
    return { ok: false, code: 'invalid-workspace' };
  }
  const payload = readCanonicalPayload(snapshot.stringData);
  if (!payload.ok) return payload;
  // UTF-8 is never shorter than the JS string's code-unit length. Reject that
  // lower bound before allocating the exact encoded copy.
  if (
    payload.value.length > TIDDLYWIKI_DROP_LIMITS.payloadBytes ||
    encoder.encode(payload.value).byteLength > TIDDLYWIKI_DROP_LIMITS.payloadBytes
  ) {
    return { ok: false, code: 'payload-too-large' };
  }
  try {
    const value = JSON.parse(payload.value) as unknown;
    const rows = Array.isArray(value) ? value : [value];
    if (rows.length > TIDDLYWIKI_DROP_LIMITS.attachments) {
      return { ok: false, code: 'too-many-attachments' };
    }
    const titles: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        return { ok: false, code: 'invalid-attachment' };
      }
      const title = (row as { title?: unknown }).title;
      if (
        typeof title !== 'string' ||
        !isBoundedText(title, TIDDLYWIKI_DROP_LIMITS.titleBytes) ||
        unsafeTitleCharacters.test(title)
      ) return { ok: false, code: 'invalid-attachment' };
      if (seen.has(title)) continue;
      seen.add(title);
      titles.push(title);
    }
    if (titles.length === 0) return { ok: false, code: 'invalid-attachment' };
    return {
      ok: true,
      attachments: titles.map(tiddlerTitle => ({ workspaceName, tiddlerTitle })),
    };
  } catch {
    return { ok: false, code: 'malformed-json' };
  }
}

type CanonicalPayloadResult =
  | { ok: true; value: string }
  | { ok: false; code: 'missing-payload' | 'malformed-data-uri' };

function readCanonicalPayload(stringData: Readonly<Record<string, string>>): CanonicalPayloadResult {
  let descriptors: Record<string, PropertyDescriptor>;
  try {
    descriptors = Object.getOwnPropertyDescriptors(stringData);
  } catch {
    return { ok: false, code: 'missing-payload' };
  }
  const readData = (type: string): string | undefined => {
    const descriptor = descriptors[type];
    return descriptor && 'value' in descriptor && typeof descriptor.value === 'string'
      ? descriptor.value
      : undefined;
  };
  const direct = readData('text/vnd.tiddler');
  if (direct) return { ok: true, value: direct };
  for (const type of ['URL', 'text/x-moz-url', 'text/uri-list']) {
    const dataUri = readData(type);
    if (!dataUri || dataUri.length > TIDDLYWIKI_DROP_LIMITS.payloadBytes * 4) continue;
    const match = /^data:text\/vnd\.tiddler,(.*)$/isu.exec(dataUri);
    if (!match) continue;
    try {
      return { ok: true, value: decodeURIComponent(match[1]) };
    } catch {
      return { ok: false, code: 'malformed-data-uri' };
    }
  }
  return { ok: false, code: 'missing-payload' };
}

function isBoundedText(value: string, maximumBytes: number): boolean {
  return value.length > 0 && value.length <= maximumBytes && encoder.encode(value).byteLength <= maximumBytes;
}
