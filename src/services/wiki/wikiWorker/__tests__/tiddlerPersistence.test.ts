import type { ITiddlerFields, ITiddlyWiki } from 'tiddlywiki';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcServerRoutes } from '../ipcServerRoutes';

function fixture() {
  let revision = 0;
  let current: { fields: ITiddlerFields } | undefined;
  const syncer = {
    numTasksInProgress: 0,
    tiddlerInfo: {} as Record<string, { changeCount: number }>,
    getSyncedTiddlers: vi.fn(() => current ? [current.fields.title] : []),
  };
  const wikiInstance = {
    Tiddler: class {
      constructor(public fields: ITiddlerFields) {}
    },
    syncer,
    wiki: {
      addTiddler: vi.fn((tiddler: { fields: ITiddlerFields }) => {
        current = tiddler;
        revision += 1;
      }),
      deleteTiddler: vi.fn(() => {
        current = undefined;
        revision += 1;
      }),
      getChangeCount: () => revision,
      getTiddler: () => current,
      tiddlerExists: () => current !== undefined,
    },
  } as unknown as ITiddlyWiki;
  const routes = new IpcServerRoutes();
  routes.setWikiInstance(wikiInstance);
  const fields = { title: 'calendar-event', text: 'new entry', type: 'text/vnd.tiddlywiki', calendarEntry: 'yes' } as ITiddlerFields;
  return { fields, routes, syncer, wikiInstance };
}

describe('IPC tiddler persistence acknowledgement', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not acknowledge an in-memory change before the filesystem syncer completes it', async () => {
    const f = fixture();
    let acknowledged = false;
    const save = f.routes.putTiddler(f.fields.title, f.fields).then(response => {
      acknowledged = true;
      return response;
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(f.wikiInstance.wiki.getTiddler(f.fields.title)?.fields).toEqual(f.fields);
    expect(acknowledged).toBe(false);
    f.syncer.tiddlerInfo[f.fields.title] = { changeCount: 1 };
    await vi.advanceTimersByTimeAsync(25);
    expect((await save).statusCode).toBe(204);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not return success when persistence fails or stalls', async () => {
    const f = fixture();
    const failure = expect(f.routes.putTiddler(f.fields.title, f.fields, Date.now() + 100)).rejects.toThrow('not saved to disk');
    await vi.advanceTimersByTimeAsync(100);
    await failure;
    expect(f.syncer.tiddlerInfo[f.fields.title]).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects an expired request before modifying the wiki', async () => {
    const f = fixture();
    await expect(f.routes.putTiddler(f.fields.title, f.fields, Date.now() - 1)).rejects.toThrow('expired');
    expect(f.wikiInstance.wiki.addTiddler).not.toHaveBeenCalled();
  });

  it('rejects expired requests queued before startup without adding or deleting after startup', async () => {
    const f = fixture();
    const routes = new IpcServerRoutes();
    const save = expect(routes.putTiddler(f.fields.title, f.fields, Date.now() + 100)).rejects.toThrow('expired');
    const deletion = expect(routes.deleteTiddler(f.fields.title, Date.now() + 100)).rejects.toThrow('expired');
    await vi.advanceTimersByTimeAsync(101);
    routes.setWikiInstance(f.wikiInstance);
    await Promise.all([save, deletion]);
    expect(f.wikiInstance.wiki.addTiddler).not.toHaveBeenCalled();
    expect(f.wikiInstance.wiki.deleteTiddler).not.toHaveBeenCalled();
  });

  it('keeps deletion pending until the filesystem syncer confirms removal', async () => {
    const f = fixture();
    f.wikiInstance.wiki.addTiddler(new f.wikiInstance.Tiddler(f.fields));
    f.syncer.tiddlerInfo[f.fields.title] = { changeCount: 1 };
    let acknowledged = false;
    const deletion = f.routes.deleteTiddler(f.fields.title).then(response => {
      acknowledged = true;
      return response;
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(acknowledged).toBe(false);
    delete f.syncer.tiddlerInfo[f.fields.title];
    await vi.advanceTimersByTimeAsync(25);
    expect((await deletion).statusCode).toBe(204);
  });

  it('does not acknowledge a deletion superseded by recreation', async () => {
    const f = fixture();
    f.wikiInstance.wiki.addTiddler(new f.wikiInstance.Tiddler(f.fields));
    f.syncer.tiddlerInfo[f.fields.title] = { changeCount: 1 };
    const deletion = expect(f.routes.deleteTiddler(f.fields.title)).rejects.toThrow('changed while deleting');
    await vi.advanceTimersByTimeAsync(1);
    f.wikiInstance.wiki.addTiddler(new f.wikiInstance.Tiddler(f.fields));
    await vi.advanceTimersByTimeAsync(25);
    await deletion;
  });

  it('does not acknowledge deletion while the first save is still creating its file', async () => {
    const f = fixture();
    f.wikiInstance.wiki.addTiddler(new f.wikiInstance.Tiddler(f.fields));
    f.syncer.numTasksInProgress = 1;
    let acknowledged = false;
    const deletion = f.routes.deleteTiddler(f.fields.title).then(() => {
      acknowledged = true;
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(acknowledged).toBe(false);
    f.syncer.tiddlerInfo[f.fields.title] = { changeCount: 1 };
    await vi.advanceTimersByTimeAsync(25);
    expect(acknowledged).toBe(false);
    delete f.syncer.tiddlerInfo[f.fields.title];
    f.syncer.numTasksInProgress = 0;
    await vi.advanceTimersByTimeAsync(25);
    await deletion;
    expect(acknowledged).toBe(true);
  });

  it('does not let a newer revision satisfy an older persistence request', async () => {
    const f = fixture();
    const failure = expect(f.routes.putTiddler(f.fields.title, f.fields)).rejects.toThrow('changed while saving');
    await vi.advanceTimersByTimeAsync(1);
    f.wikiInstance.wiki.addTiddler(new f.wikiInstance.Tiddler({ ...f.fields, text: 'newer edit' }));
    f.syncer.tiddlerInfo[f.fields.title] = { changeCount: 2 };
    await vi.advanceTimersByTimeAsync(25);
    await failure;
  });

  it('does not claim persistence for a title excluded by the filesystem save filter', async () => {
    const f = fixture();
    f.syncer.getSyncedTiddlers.mockReturnValue([]);
    const response = await f.routes.putTiddler(f.fields.title, f.fields);
    expect(response.statusCode).toBe(204);
    expect(response.headers?.['X-TidGi-Persistence']).toBe('excluded');
    expect(f.syncer.tiddlerInfo[f.fields.title]).toBeUndefined();
  });
});
