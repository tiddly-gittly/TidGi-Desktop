import { container } from '@services/container';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspace, IWorkspaceService } from '@services/workspaces/interface';
import { AGENT_USER_MESSAGE_LIMITS, canonicalJsonBytes, type RemoteAgentExecuteRequest, type WikiTiddlerClickData } from 'memeloop';
import type { Tiddler } from 'tiddlywiki';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boundWikiTiddlerContent, createAgentDeviceRpcPendingUserMessage, WIKI_TIDDLER_CONTENT_LIMITS, WIKI_TIDDLER_CONTENT_TRUNCATION_CODE } from '../userMessage';

const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
const mutableWikiService = Object.assign(wikiService, {
  callWikiIpcServerRoute: vi.fn(),
});
const workspace = { id: 'workspace-1', name: 'Wiki' } as IWorkspace;

function requestFor(
  wikiTiddlers: readonly { workspaceName: string; tiddlerTitle: string }[],
  message = 'message',
): RemoteAgentExecuteRequest {
  return {
    target: { kind: 'local' },
    provenance: {
      conversationId: 'conversation-1',
      definitionId: 'definition-1',
      turnId: 'turn-1',
      requestId: 'request-1',
    },
    message,
    wikiTiddlers,
  };
}

function wikiEntry(pending: Awaited<ReturnType<typeof createAgentDeviceRpcPendingUserMessage>>): WikiTiddlerClickData {
  const entries = pending.metadata?.wikiTiddlers;
  if (!Array.isArray(entries) || entries.length !== 1) throw new Error('missing wiki metadata');
  return entries[0] as WikiTiddlerClickData;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function extractWikiBody(content: string, workspaceName: string, tiddlerTitle: string): string {
  const startMarker = `[Wiki Entry from ${workspaceName}: ${tiddlerTitle}]\n`;
  const endMarker = '\n[End Wiki Entry]';
  const start = content.indexOf(startMarker);
  if (start < 0) throw new Error('missing wiki entry start marker');
  const bodyStart = start + startMarker.length;
  const end = content.indexOf(endMarker, bodyStart);
  if (end < 0) throw new Error('missing wiki entry end marker');
  return content.slice(bodyStart, end);
}

function rawTiddlerWithText(text: string): Tiddler {
  return {
    cache: {},
    fields: { text, title: 'Unicode', type: 'text/vnd.tiddlywiki' },
    hasTag: () => false,
    hasField: () => false,
    isPlugin: () => false,
    isDraft: () => false,
    getFieldString: () => '',
    getFieldStrings: () => ({}),
    getFieldDay: () => '',
    getFieldList: () => [],
    getFieldStringBlock: () => '',
    isEqual: () => false,
  } satisfies Tiddler;
}

describe('createAgentDeviceRpcPendingUserMessage wiki bounds', () => {
  beforeEach(() => {
    mutableWikiService.callWikiIpcServerRoute.mockResolvedValue({
      statusCode: 200,
      data: 'ok',
    });
    vi.spyOn(workspaceService, 'getWorkspacesAsList').mockResolvedValue([workspace]);
    vi.spyOn(wikiService, 'wikiOperationInServer').mockResolvedValue(undefined);
  });

  afterEach(() => {
    mutableWikiService.callWikiIpcServerRoute.mockReset();
    vi.restoreAllMocks();
  });

  it('retains an HTML tiddler at exactly the per-attachment byte limit', async () => {
    const source = 'x'.repeat(WIKI_TIDDLER_CONTENT_LIMITS.perAttachmentBytes);
    mutableWikiService.callWikiIpcServerRoute.mockResolvedValue({
      statusCode: 200,
      data: source,
    });

    const pending = await createAgentDeviceRpcPendingUserMessage({
      request: requestFor([{ workspaceName: 'Wiki', tiddlerTitle: 'Exact' }]),
    });
    const entry = wikiEntry(pending);

    expect(entry.workspaceId).toBe(workspace.id);
    expect(entry.workspaceName).toBe('Wiki');
    expect(entry.tiddlerTitle).toBe('Exact');
    expect(entry.renderedContent).toBeUndefined();
    expect(pending.content).toContain(source);
    expect(entry.contentProjection).toEqual({
      truncated: false,
      originalUtf8Bytes: source.length,
      includedUtf8Bytes: source.length,
    });
  });

  it('truncates HTML at max plus one with a machine-readable marker', async () => {
    const prefix = `${'x'.repeat(WIKI_TIDDLER_CONTENT_LIMITS.perAttachmentBytes - 3)}界`;
    const source = `${prefix}z`;
    mutableWikiService.callWikiIpcServerRoute.mockResolvedValue({
      statusCode: 200,
      data: source,
    });

    const pending = await createAgentDeviceRpcPendingUserMessage({
      request: requestFor([{ workspaceName: 'Wiki', tiddlerTitle: 'Over' }]),
    });
    const entry = wikiEntry(pending);

    expect(entry.renderedContent).toBeUndefined();
    const rendered = extractWikiBody(pending.content ?? '', 'Wiki', 'Over');
    expect(rendered).toBe(prefix);
    expect(utf8ByteLength(rendered)).toBe(WIKI_TIDDLER_CONTENT_LIMITS.perAttachmentBytes);
    expect(rendered.endsWith('z')).toBe(false);
    expect(pending.content).not.toContain(source);
    expect(pending.content).not.toContain(WIKI_TIDDLER_CONTENT_TRUNCATION_CODE);
    expect(entry.contentProjection).toEqual({
      truncated: true,
      originalUtf8Bytes: utf8ByteLength(source),
      includedUtf8Bytes: WIKI_TIDDLER_CONTENT_LIMITS.perAttachmentBytes,
      code: WIKI_TIDDLER_CONTENT_TRUNCATION_CODE,
    });
  });

  it('cuts Unicode only at complete UTF-8 code points', () => {
    const source = '😀'.repeat(Math.floor(WIKI_TIDDLER_CONTENT_LIMITS.perAttachmentBytes / 4) + 1);
    const bounded = boundWikiTiddlerContent(source, WIKI_TIDDLER_CONTENT_LIMITS.perAttachmentBytes);

    expect(bounded.truncated).toBe(true);
    expect(bounded.originalUtf8Bytes).toBe(utf8ByteLength(source));
    expect(bounded.includedUtf8Bytes).toBeLessThanOrEqual(WIKI_TIDDLER_CONTENT_LIMITS.perAttachmentBytes);
    expect(utf8ByteLength(bounded.renderedContent)).toBe(bounded.includedUtf8Bytes);
    expect(bounded.renderedContent.endsWith('\uFFFD')).toBe(false);
  });

  it.each([
    {
      name: 'HTML',
      response: () => ({ statusCode: 200, data: '界'.repeat(Math.floor(WIKI_TIDDLER_CONTENT_LIMITS.perAttachmentBytes / 3) + 1) }),
      raw: undefined,
    },
    {
      name: 'raw fallback',
      response: () => ({ statusCode: 404, data: '' }),
      raw: rawTiddlerWithText('界'.repeat(Math.floor(WIKI_TIDDLER_CONTENT_LIMITS.perAttachmentBytes / 3) + 1)),
    },
  ])('bounds $name content before exposing renderedContent', async ({ response, raw }) => {
    mutableWikiService.callWikiIpcServerRoute.mockImplementation(response);
    vi.mocked(wikiService.wikiOperationInServer).mockResolvedValue(raw);

    const pending = await createAgentDeviceRpcPendingUserMessage({
      request: requestFor([{ workspaceName: 'Wiki', tiddlerTitle: 'Unicode' }]),
    });
    const entry = wikiEntry(pending);
    const projection = entry.contentProjection;

    expect(projection?.truncated).toBe(true);
    expect(projection?.code).toBe(WIKI_TIDDLER_CONTENT_TRUNCATION_CODE);
    expect(projection?.includedUtf8Bytes).toBeLessThanOrEqual(WIKI_TIDDLER_CONTENT_LIMITS.perAttachmentBytes);
    expect(utf8ByteLength(pending.content ?? '')).toBeGreaterThanOrEqual(projection?.includedUtf8Bytes ?? 0);
  });

  it('keeps the aggregate wiki body under the total projection budget', async () => {
    const source = 'x'.repeat(WIKI_TIDDLER_CONTENT_LIMITS.perAttachmentBytes + 1);
    mutableWikiService.callWikiIpcServerRoute.mockResolvedValue({
      statusCode: 200,
      data: source,
    });
    const tiddlers = Array.from({ length: 4 }, (_, index) => ({
      workspaceName: 'Wiki',
      tiddlerTitle: `Tiddler-${index}`,
    }));

    const pending = await createAgentDeviceRpcPendingUserMessage({ request: requestFor(tiddlers) });
    const entries = pending.metadata?.wikiTiddlers;
    if (!Array.isArray(entries)) throw new Error('missing wiki metadata');

    const typedEntries = entries as WikiTiddlerClickData[];
    expect(typedEntries).toHaveLength(tiddlers.length);
    expect(typedEntries.map(entry => entry.tiddlerTitle)).toEqual(tiddlers.map(tiddler => tiddler.tiddlerTitle));
    expect(typedEntries.every(entry => entry.contentProjection?.truncated === true)).toBe(true);
    const totalBytes = typedEntries.reduce(
      (sum, entry) => sum + (entry.contentProjection?.includedUtf8Bytes ?? 0),
      0,
    );
    expect(totalBytes).toBeLessThanOrEqual(WIKI_TIDDLER_CONTENT_LIMITS.totalBytes);
    expect(canonicalJsonBytes(pending, { maxBytes: AGENT_USER_MESSAGE_LIMITS.pagingEnvelopeBytes }).byteLength)
      .toBeLessThanOrEqual(AGENT_USER_MESSAGE_LIMITS.pagingEnvelopeBytes);
  });

  it('does not exceed the canonical content budget when the input is already full', async () => {
    const source = 'x'.repeat(WIKI_TIDDLER_CONTENT_LIMITS.perAttachmentBytes + 1);
    mutableWikiService.callWikiIpcServerRoute.mockResolvedValue({
      statusCode: 200,
      data: source,
    });
    const pending = await createAgentDeviceRpcPendingUserMessage({
      request: requestFor(
        [{ workspaceName: 'Wiki', tiddlerTitle: 'NoRoom' }],
        'm'.repeat(AGENT_USER_MESSAGE_LIMITS.contentBytes),
      ),
    });

    expect(utf8ByteLength(pending.content ?? '')).toBe(AGENT_USER_MESSAGE_LIMITS.contentBytes);
    expect(pending.metadata?.wikiTiddlers).toHaveLength(1);
    expect((pending.metadata?.wikiTiddlers as WikiTiddlerClickData[])[0].contentProjection?.includedUtf8Bytes).toBe(0);
  });

  it('supports sixteen bounded attachments and long user text without exceeding body limits', async () => {
    const source = '界'.repeat(Math.floor(WIKI_TIDDLER_CONTENT_LIMITS.perAttachmentBytes / 3) + 1);
    (mutableWikiService.callWikiIpcServerRoute as ReturnType<typeof vi.fn>).mockResolvedValue({
      statusCode: 200,
      data: source,
    });
    const tiddlers = Array.from({ length: 16 }, (_, index) => ({
      workspaceName: 'Wiki',
      tiddlerTitle: `Long-${index}`,
    }));
    const pending = await createAgentDeviceRpcPendingUserMessage({
      request: requestFor(tiddlers, 'u'.repeat(AGENT_USER_MESSAGE_LIMITS.contentBytes - 1_024)),
    });
    const entries = pending.metadata?.wikiTiddlers as WikiTiddlerClickData[] | undefined;
    if (!entries) throw new Error('missing wiki metadata');

    expect(entries).toHaveLength(16);
    expect(entries.every(entry => entry.renderedContent === undefined)).toBe(true);
    expect(entries.reduce((sum, entry) => sum + (entry.contentProjection?.includedUtf8Bytes ?? 0), 0)).toBeLessThanOrEqual(1_024);
    expect(utf8ByteLength(pending.content ?? '')).toBeLessThanOrEqual(AGENT_USER_MESSAGE_LIMITS.contentBytes);
  });

  it('fails closed with a stable code when a large identity cannot fit the canonical event', async () => {
    const largeTitle = 'T'.repeat(300_000);
    vi.spyOn(workspaceService, 'getWorkspacesAsList').mockResolvedValue([{ ...workspace, name: 'Large Wiki' }]);
    await expect(createAgentDeviceRpcPendingUserMessage({
      request: requestFor([{ workspaceName: 'Large Wiki', tiddlerTitle: largeTitle }]),
    })).rejects.toMatchObject({ code: 'ATTACHMENT_MESSAGE_BUDGET_EXCEEDED' });
  });
});
