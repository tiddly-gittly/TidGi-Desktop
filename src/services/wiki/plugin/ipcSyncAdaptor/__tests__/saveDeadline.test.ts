import type { Tiddler, Wiki } from 'tiddlywiki';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WIKI_SAVE_TIMEOUT_MS } from '../../../constants';
import type { TidGiIPCSyncAdaptor } from '../ipc-syncadaptor';

describe('renderer IPC save deadline', () => {
  let adaptor: TidGiIPCSyncAdaptor;
  const request = vi.fn();
  const fields = { title: 'fixture-note', text: 'keep this edit', type: 'text/vnd.tiddlywiki' };

  beforeEach(async () => {
    vi.useFakeTimers();
    request.mockReset();
    vi.stubGlobal('$tw', {
      browser: false,
      tidgi: { service: { wiki: { callWikiIpcServerRoute: request }, workspace: {}, auth: {}, analytics: { track: vi.fn() } } },
      utils: {
        Logger: class {
          log = vi.fn();
        },
        parseStringArray: () => [],
        decodeURIComponentSafe: decodeURIComponent,
      },
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { TidGiIPCSyncAdaptor: Adaptor } = await import('../ipc-syncadaptor');
    // Avoid subscription/UI setup: only the actual production save path matters.
    const originalMeta = window.meta;
    const originalObservables = window.observables;
    Object.defineProperty(window, 'meta', { value: () => ({ workspace: { id: 'fixture' } }) });
    Object.defineProperty(window, 'observables', { value: undefined });
    try {
      adaptor = new Adaptor({ wiki: { getTiddlerText: () => '', getTiddler: () => ({ fields }) } as unknown as Wiki });
    } finally {
      Object.defineProperty(window, 'meta', { value: originalMeta });
      Object.defineProperty(window, 'observables', { value: originalObservables });
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('releases a stalled task exactly once, ignores late success, and allows a retry', async () => {
    const delayed = Promise.withResolvers<{ statusCode: number; headers: { Etag: string } }>();
    request.mockReturnValueOnce(delayed.promise);
    const callback = vi.fn();
    const save = adaptor.saveTiddler({ fields } as Tiddler, callback);
    await vi.advanceTimersByTimeAsync(WIKI_SAVE_TIMEOUT_MS);
    await save;
    expect(callback).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: expect.stringContaining('timed out') }));
    delayed.resolve({ statusCode: 204, headers: { Etag: '"default/fixture-note/1:"' } });
    await vi.advanceTimersByTimeAsync(1);
    expect(callback).toHaveBeenCalledTimes(1);
    request.mockResolvedValueOnce({ statusCode: 204, headers: { Etag: '"default/fixture-note/2:"' } });
    const retry = vi.fn();
    await adaptor.saveTiddler({ fields: { ...fields, text: 'next edit' } } as Tiddler, retry);
    expect(retry).toHaveBeenCalledExactlyOnceWith(null, { bag: 'default' }, '2');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('forwards the renderer deadline so a queued request cannot mutate after timeout', async () => {
    request.mockResolvedValue({ statusCode: 204, headers: { Etag: '"default/fixture-note/1:"' } });
    const deadline = Date.now() + WIKI_SAVE_TIMEOUT_MS;
    await adaptor.saveTiddler({ fields } as Tiddler, vi.fn());
    expect(request).toHaveBeenCalledWith('fixture', 'putTiddler', fields.title, fields, deadline);
  });
});
