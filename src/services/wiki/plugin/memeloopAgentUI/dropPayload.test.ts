import { describe, expect, it, vi } from 'vitest';
import { parseTiddlyWikiDrop, parseTiddlyWikiDropResult, resolveTiddlyWikiDrop, TIDDLYWIKI_DROP_LIMITS, TiddlyWikiDropValidationError } from './dropPayload';

const snapshot = (stringData: Record<string, string>) => ({ stringData });

describe('parseTiddlyWikiDrop', () => {
  it('extracts and de-duplicates single and multi-tiddler payloads', () => {
    expect(parseTiddlyWikiDrop(
      snapshot({
        'text/vnd.tiddler': JSON.stringify([{ title: 'One' }, { title: 'Two' }, { title: 'One' }]),
      }),
      'My Wiki',
    )).toEqual([
      { workspaceName: 'My Wiki', tiddlerTitle: 'One' },
      { workspaceName: 'My Wiki', tiddlerTitle: 'Two' },
    ]);
  });

  it('does not treat arbitrary plain text or malformed JSON as an attachment', () => {
    expect(parseTiddlyWikiDrop(snapshot({ 'text/plain': 'not a tiddler' }), 'Wiki')).toEqual([]);
    expect(parseTiddlyWikiDrop(snapshot({ 'text/vnd.tiddler': '{broken' }), 'Wiki')).toEqual([]);
  });

  it('distinguishes a file-only drop from an invalid mixed file+tiddler drop', () => {
    expect(resolveTiddlyWikiDrop(snapshot({ 'text/plain': 'ordinary file metadata' }), 'Wiki')).toEqual([]);
    expect(() =>
      resolveTiddlyWikiDrop(
        snapshot({ 'text/vnd.tiddler': JSON.stringify([{ title: 'Good' }, { title: 'Bad\nTitle' }]) }),
        'Wiki',
      )
    ).toThrow(TiddlyWikiDropValidationError);
    try {
      resolveTiddlyWikiDrop(snapshot({ 'text/vnd.tiddler': '{broken' }), 'Wiki');
      throw new Error('expected invalid canonical drop to fail');
    } catch (error) {
      expect(error).toMatchObject({ code: 'malformed-json' });
    }
  });

  it.each(['URL', 'text/x-moz-url', 'text/uri-list'])(
    'accepts the canonical TiddlyWiki data URI in %s',
    type => {
      const payload = JSON.stringify([{ title: '$:/System' }, { title: 'Unicode 条目' }]);
      expect(parseTiddlyWikiDrop(
        snapshot({ [type]: `data:text/vnd.tiddler,${encodeURIComponent(payload)}` }),
        'My Wiki',
      )).toEqual([
        { workspaceName: 'My Wiki', tiddlerTitle: '$:/System' },
        { workspaceName: 'My Wiki', tiddlerTitle: 'Unicode 条目' },
      ]);
    },
  );

  it('atomically rejects payload bytes, UTF-8 title bytes and attachment count violations', () => {
    const tooMany = Array.from(
      { length: TIDDLYWIKI_DROP_LIMITS.attachments + 10 },
      (_, index) => ({ title: `Tiddler ${index}` }),
    );
    expect(parseTiddlyWikiDrop(
      snapshot({ 'text/vnd.tiddler': JSON.stringify(tooMany) }),
      'Wiki',
    )).toEqual([]);
    expect(parseTiddlyWikiDropResult(
      snapshot({ 'text/vnd.tiddler': JSON.stringify(tooMany) }),
      'Wiki',
    )).toEqual({ ok: false, code: 'too-many-attachments' });
    expect(parseTiddlyWikiDrop(
      snapshot({ 'text/vnd.tiddler': JSON.stringify({ title: '界'.repeat(TIDDLYWIKI_DROP_LIMITS.titleBytes) }) }),
      'Wiki',
    )).toEqual([]);
    expect(parseTiddlyWikiDrop(
      snapshot({ 'text/vnd.tiddler': ' '.repeat(TIDDLYWIKI_DROP_LIMITS.payloadBytes + 1) }),
      'Wiki',
    )).toEqual([]);
  });

  it('rejects a mixed valid/invalid batch atomically', () => {
    expect(parseTiddlyWikiDrop(
      snapshot({ 'text/vnd.tiddler': JSON.stringify([{ title: 'Good' }, { title: 'Bad\nTitle' }]) }),
      'Wiki',
    )).toEqual([]);
    expect(parseTiddlyWikiDropResult(
      snapshot({ 'text/vnd.tiddler': JSON.stringify([{ title: 'Good' }, 42]) }),
      'Wiki',
    )).toEqual({ ok: false, code: 'invalid-attachment' });
  });

  it('rejects invalid workspaces and deceptive non-tiddler URLs', () => {
    expect(parseTiddlyWikiDrop(
      snapshot({ 'text/vnd.tiddler': JSON.stringify({ title: 'Good' }) }),
      '',
    )).toEqual([]);
    expect(parseTiddlyWikiDrop(
      snapshot({ URL: 'https://example.com/data:text/vnd.tiddler,%7B%7D' }),
      'Wiki',
    )).toEqual([]);
    expect(parseTiddlyWikiDrop(
      snapshot({ 'text/vnd.tiddler': JSON.stringify({ title: 'Good' }) }),
      'Bad\nWiki',
    )).toEqual([]);
  });

  it('rejects malformed canonical data URIs without accepting a partial payload', () => {
    expect(parseTiddlyWikiDropResult(
      snapshot({ URL: 'data:text/vnd.tiddler,%E0%A4%A' }),
      'Wiki',
    )).toEqual({ ok: false, code: 'malformed-data-uri' });
    expect(parseTiddlyWikiDrop(
      snapshot({ URL: 'data:text/vnd.tiddler,%E0%A4%A' }),
      'Wiki',
    )).toEqual([]);
  });

  it('parses the synchronous snapshot after the browser invalidates its live DataTransfer', async () => {
    const values = {
      'text/vnd.tiddler': JSON.stringify([{ title: 'Snapshotted' }, { title: 'Bad\nTitle' }]),
    };
    let invalidated = false;
    const liveTransfer = {
      getData: (type: string) => {
        if (invalidated) throw new Error('DataTransfer is no longer readable');
        return values[type as keyof typeof values] ?? '';
      },
    };
    const copiedSnapshot = snapshot({
      'text/vnd.tiddler': liveTransfer.getData('text/vnd.tiddler'),
    });
    invalidated = true;
    await Promise.resolve();

    expect(parseTiddlyWikiDropResult(copiedSnapshot, 'Wiki')).toEqual({
      ok: false,
      code: 'invalid-attachment',
    });
  });

  it('does not invoke accessors or proxy traps while reading a hostile snapshot', () => {
    const getter = vi.fn(() => JSON.stringify({ title: 'Secret' }));
    const stringData = Object.defineProperty({}, 'text/vnd.tiddler', { get: getter }) as Record<string, string>;
    expect(parseTiddlyWikiDropResult({ stringData }, 'Wiki')).toEqual({ ok: false, code: 'missing-payload' });
    expect(getter).not.toHaveBeenCalled();

    const proxy = new Proxy({}, {
      ownKeys: () => {
        throw new Error('hostile proxy');
      },
    }) as Record<string, string>;
    expect(parseTiddlyWikiDropResult({ stringData: proxy }, 'Wiki')).toEqual({ ok: false, code: 'missing-payload' });
  });
});
