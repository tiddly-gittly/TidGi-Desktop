import { WikiChannel } from '@/constants/channels';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import {
  AGENT_USER_MESSAGE_LIMITS,
  type AgentDeviceRpcPendingUserMessage,
  canonicalJsonBytes,
  CanonicalJsonError,
  REMOTE_AGENT_EXECUTION_LIMITS,
  type RemoteAgentExecuteRequest,
  type WikiTiddlerClickData,
  type WikiTiddlerContentProjection,
} from 'memeloop';

/**
 * Wiki content is projected once into the prompt body. Attachment metadata
 * retains only the identity and bounded-content accounting fields.
 */
export const WIKI_TIDDLER_CONTENT_LIMITS = Object.freeze(
  {
    perAttachmentBytes: 64 * 1_024,
    totalBytes: Math.min(192 * 1_024, AGENT_USER_MESSAGE_LIMITS.contentBytes),
  } as const,
);

export const WIKI_TIDDLER_CONTENT_TRUNCATION_CODE = 'ATTACHMENT_CONTENT_TRUNCATED' as const;
export const WIKI_TIDDLER_MESSAGE_BUDGET_ERROR_CODE = 'ATTACHMENT_MESSAGE_BUDGET_EXCEEDED' as const;

export class WikiTiddlerMessageBudgetError extends Error {
  public readonly code = WIKI_TIDDLER_MESSAGE_BUDGET_ERROR_CODE;

  public constructor(
    public readonly requestedBytes: number,
    public readonly limitBytes: number,
  ) {
    super(WIKI_TIDDLER_MESSAGE_BUDGET_ERROR_CODE);
    this.name = 'WikiTiddlerMessageBudgetError';
  }
}

export interface BoundedWikiTiddlerContent {
  renderedContent: string;
  originalUtf8Bytes: number;
  includedUtf8Bytes: number;
  truncated: boolean;
}

type LoadedWikiTiddlerAttachment = WikiTiddlerClickData & { renderedContent: string };

function utf8CharacterBytes(character: string): number {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint <= 0x7F ? 1 : codePoint <= 0x7FF ? 2 : codePoint <= 0xFFFF ? 3 : 4;
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) bytes += utf8CharacterBytes(character);
  return bytes;
}

function wikiTiddlerBlockBytes(workspaceName: string, tiddlerTitle: string, contentBytes: number): number {
  return utf8ByteLength('[Wiki Entry from ') +
    utf8ByteLength(workspaceName) +
    utf8ByteLength(': ') +
    utf8ByteLength(tiddlerTitle) +
    utf8ByteLength(']\n') +
    contentBytes +
    utf8ByteLength('\n[End Wiki Entry]');
}

/**
 * Return a Unicode-safe UTF-8 prefix without first encoding the whole source
 * string. The only allocated string is the bounded result slice.
 */
export function boundWikiTiddlerContent(value: string, maximumBytes: number): BoundedWikiTiddlerContent {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
    throw new RangeError('invalid wiki tiddler content byte limit');
  }
  const originalUtf8Bytes = utf8ByteLength(value);
  if (originalUtf8Bytes <= maximumBytes) {
    return {
      renderedContent: value,
      originalUtf8Bytes,
      includedUtf8Bytes: originalUtf8Bytes,
      truncated: false,
    };
  }

  let includedUtf8Bytes = 0;
  let end = 0;
  for (const character of value) {
    const characterBytes = utf8CharacterBytes(character);
    if (includedUtf8Bytes + characterBytes > maximumBytes) break;
    includedUtf8Bytes += characterBytes;
    end += character.length;
  }
  return {
    renderedContent: value.slice(0, end),
    originalUtf8Bytes,
    includedUtf8Bytes,
    truncated: true,
  };
}

function projectWikiTiddlerContent(value: string, maximumBytes: number): {
  renderedContent: string;
  contentProjection: WikiTiddlerContentProjection;
} {
  const bounded = boundWikiTiddlerContent(value, maximumBytes);
  return {
    renderedContent: bounded.renderedContent,
    contentProjection: {
      truncated: bounded.truncated,
      originalUtf8Bytes: bounded.originalUtf8Bytes,
      includedUtf8Bytes: bounded.includedUtf8Bytes,
      ...(bounded.truncated ? { code: WIKI_TIDDLER_CONTENT_TRUNCATION_CODE } : {}),
    },
  };
}

function projectWikiTiddlerAttachment(
  workspaceId: string,
  workspaceName: string,
  tiddlerTitle: string,
  value: string,
  maximumBytes: number,
): LoadedWikiTiddlerAttachment {
  const projected = projectWikiTiddlerContent(value, maximumBytes);
  return {
    workspaceId,
    workspaceName,
    tiddlerTitle,
    renderedContent: projected.renderedContent,
    contentProjection: projected.contentProjection,
  };
}

function assertWikiTiddlerMessageBudget(
  input: {
    request: RemoteAgentExecuteRequest;
    content: string;
    metadata: Readonly<Record<string, unknown>>;
    attachments?: readonly unknown[];
  },
  wikiTiddlers: readonly WikiTiddlerClickData[],
): void {
  if (wikiTiddlers.length === 0) return;
  const message = {
    messageId: input.request.provenance.turnId,
    turnId: input.request.provenance.turnId,
    conversationId: input.request.provenance.conversationId,
    originNodeId: 'rpc-validation',
    originSequence: 1,
    timestamp: 0,
    lamportClock: 1,
    role: 'user' as const,
    content: input.content,
    contentType: 'text/plain' as const,
    ...(input.attachments === undefined ? {} : { attachments: input.attachments }),
    metadata: input.metadata,
  };
  const event = {
    eventId: input.request.provenance.turnId,
    conversationId: input.request.provenance.conversationId,
    originNodeId: 'rpc-validation',
    originSequence: 1,
    lamportClock: 1,
    timestamp: 0,
    kind: 'message' as const,
    message,
  };
  let requestedBytes: number;
  try {
    requestedBytes = canonicalJsonBytes(event, {
      maxBytes: AGENT_USER_MESSAGE_LIMITS.pagingEnvelopeBytes,
      maxStringBytes: AGENT_USER_MESSAGE_LIMITS.pagingEnvelopeBytes,
      maxStringCodeUnits: AGENT_USER_MESSAGE_LIMITS.pagingEnvelopeBytes,
    }).byteLength;
  } catch (error) {
    if (
      error instanceof CanonicalJsonError &&
      (error.code === 'max_bytes' || error.code === 'max_string_bytes' || error.code === 'max_string_code_units')
    ) {
      throw new WikiTiddlerMessageBudgetError(
        AGENT_USER_MESSAGE_LIMITS.pagingEnvelopeBytes + 1,
        AGENT_USER_MESSAGE_LIMITS.pagingEnvelopeBytes,
      );
    }
    throw error;
  }
  if (requestedBytes > AGENT_USER_MESSAGE_LIMITS.canonicalEventBytes) {
    throw new WikiTiddlerMessageBudgetError(
      requestedBytes,
      AGENT_USER_MESSAGE_LIMITS.canonicalEventBytes,
    );
  }
}

export async function createAgentDeviceRpcPendingUserMessage(input: {
  request: RemoteAgentExecuteRequest;
  beforeCommitMap?: Record<string, { wikiFolderLocation: string; commitHash: string }>;
  metadata?: Readonly<Record<string, unknown>>;
}): Promise<AgentDeviceRpcPendingUserMessage> {
  const auditId = input.request.provenance.turnId;
  const metadata: Record<string, unknown> = { ...input.metadata };
  const baseMessageBytes = utf8ByteLength(input.request.message);

  const loadedWikiTiddlers = await loadWikiTiddlerAttachments(
    auditId,
    baseMessageBytes,
    input.request.wikiTiddlers,
  );
  const wikiTiddlersMetadata: WikiTiddlerClickData[] = loadedWikiTiddlers.map(({ renderedContent: _renderedContent, ...metadataEntry }) => metadataEntry);
  if (wikiTiddlersMetadata.length > 0) {
    metadata.wikiTiddlers = wikiTiddlersMetadata;
  }

  if (input.beforeCommitMap && Object.keys(input.beforeCommitMap).length > 0) {
    metadata.beforeCommitMap = input.beforeCommitMap;
  }

  // Inject wiki tiddler content into the message text
  let messageContent = input.request.message;
  if (wikiTiddlersMetadata.length > 0 && baseMessageBytes < AGENT_USER_MESSAGE_LIMITS.contentBytes) {
    const wikiContentBytes = loadedWikiTiddlers.reduce(
      (total, tiddler, index) =>
        total +
        wikiTiddlerBlockBytes(tiddler.workspaceName, tiddler.tiddlerTitle, utf8ByteLength(tiddler.renderedContent)) +
        (index === 0 ? 0 : utf8ByteLength('\n\n')),
      0,
    );
    // Metadata remains available for the chip even when the caller's message
    // already consumes the canonical Core content budget. Do not emit a body
    // that would be rejected later by the shared admission check.
    if (baseMessageBytes + wikiContentBytes + utf8ByteLength('\n\n') <= AGENT_USER_MESSAGE_LIMITS.contentBytes) {
      const wikiContent = loadedWikiTiddlers.map(
        (tiddler) => `[Wiki Entry from ${tiddler.workspaceName}: ${tiddler.tiddlerTitle}]\n${tiddler.renderedContent}\n[End Wiki Entry]`,
      ).join('\n\n');
      messageContent = `${wikiContent}\n\n${messageContent}`;
    }
  }
  assertWikiTiddlerMessageBudget({
    request: input.request,
    content: messageContent,
    metadata,
    ...(input.request.attachment?.kind === 'committed'
      ? { attachments: [input.request.attachment.reference] }
      : {}),
  }, wikiTiddlersMetadata);

  return {
    content: messageContent,
    contentType: 'text/plain',
    ...(input.request.attachment?.kind === 'committed' ? { attachments: [input.request.attachment.reference] } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

async function loadWikiTiddlerAttachments(
  messageId: string,
  baseMessageBytes: number,
  wikiTiddlers?: readonly { workspaceName: string; tiddlerTitle: string }[],
): Promise<LoadedWikiTiddlerAttachment[]> {
  if (!wikiTiddlers || wikiTiddlers.length === 0) return [];

  const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const workspaces = await workspaceService.getWorkspacesAsList();
  const attachments: LoadedWikiTiddlerAttachment[] = [];
  const candidates = [] as Array<{
    tiddler: { workspaceName: string; tiddlerTitle: string };
    workspace: (typeof workspaces)[number];
  }>;
  for (let index = 0; index < wikiTiddlers.length && index < REMOTE_AGENT_EXECUTION_LIMITS.wikiTiddlers; index += 1) {
    const tiddler = wikiTiddlers[index];
    const workspace = workspaces.find(item => item.name === tiddler.workspaceName);
    if (!workspace) {
      logger.warn('Workspace not found for MemeLoop wiki attachment', { workspaceName: tiddler.workspaceName, messageId });
      continue;
    }
    candidates.push({ tiddler, workspace });
  }

  const structuralBytes = candidates.reduce(
    (total, { tiddler }) =>
      total +
      wikiTiddlerBlockBytes(tiddler.workspaceName, tiddler.tiddlerTitle, 0),
    utf8ByteLength('\n\n'),
  ) + Math.max(0, candidates.length - 1) * utf8ByteLength('\n\n');
  let remainingBodyBytes = Math.min(
    WIKI_TIDDLER_CONTENT_LIMITS.totalBytes,
    Math.max(0, AGENT_USER_MESSAGE_LIMITS.contentBytes - baseMessageBytes - structuralBytes),
  );

  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    const candidate = candidates[candidateIndex];
    const { tiddler, workspace } = candidate;
    try {
      const htmlResponse = await wikiService.callWikiIpcServerRoute(workspace.id, 'getTiddlerHtml', tiddler.tiddlerTitle);
      if (htmlResponse?.statusCode === 200 && typeof htmlResponse.data === 'string' && htmlResponse.data.length > 0) {
        const maximumBytes = Math.min(
          WIKI_TIDDLER_CONTENT_LIMITS.perAttachmentBytes,
          Math.floor(remainingBodyBytes / Math.max(1, candidates.length - candidateIndex)),
        );
        const attachment = projectWikiTiddlerAttachment(
          workspace.id,
          tiddler.workspaceName,
          tiddler.tiddlerTitle,
          htmlResponse.data,
          maximumBytes,
        );
        attachments.push(attachment);
        remainingBodyBytes = Math.max(0, remainingBodyBytes - attachment.contentProjection!.includedUtf8Bytes);
        continue;
      }

      const rawTiddler = await wikiService.wikiOperationInServer(
        WikiChannel.getTiddler,
        workspace.id,
        [tiddler.tiddlerTitle],
      );
      if (rawTiddler && typeof rawTiddler === 'object') {
        const directText = (rawTiddler as { text?: unknown }).text;
        const fields = (rawTiddler as { fields?: unknown }).fields;
        const fieldText = fields && typeof fields === 'object'
          ? (fields as { text?: unknown }).text
          : undefined;
        const text = typeof directText === 'string'
          ? directText
          : typeof fieldText === 'string'
          ? fieldText
          : '';
        const maximumBytes = Math.min(
          WIKI_TIDDLER_CONTENT_LIMITS.perAttachmentBytes,
          Math.floor(remainingBodyBytes / Math.max(1, candidates.length - candidateIndex)),
        );
        const attachment = projectWikiTiddlerAttachment(
          workspace.id,
          tiddler.workspaceName,
          tiddler.tiddlerTitle,
          text,
          maximumBytes,
        );
        attachments.push(attachment);
        remainingBodyBytes = Math.max(0, remainingBodyBytes - attachment.contentProjection!.includedUtf8Bytes);
      }
    } catch (error) {
      logger.error('Failed to load MemeLoop wiki attachment', { error, messageId, tiddler });
    }
  }

  return attachments;
}
