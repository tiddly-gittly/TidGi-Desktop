import { WikiChannel } from '@/constants/channels';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  detachWorker: vi.fn(),
  stopIntervalSync: vi.fn(),
  terminateWorker: vi.fn().mockResolvedValue(undefined),
  workerKill: vi.fn(),
  ensureWikiFolderAccess: vi.fn().mockResolvedValue(undefined),
  forEachView: vi.fn(),
  getWorkspace: vi.fn(),
  getLoadedViewEnsure: vi.fn().mockResolvedValue(undefined),
  generalNotification: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getAppMetrics: vi.fn(() => []), getPath: vi.fn(() => process.cwd()) },
  dialog: { showMessageBox: vi.fn() },
  session: { fromPartition: vi.fn(() => ({})) },
  shell: {},
}));

vi.mock('electron-ipc-cat/host', () => ({
  createWorkerMethodProxy: vi.fn(),
  terminateWorker: (...args: unknown[]) => mocks.terminateWorker(...args) as Promise<void>,
}));

vi.mock('electron-ipc-cat/server', () => ({
  attachUtilityProcess: vi.fn(() => mocks.detachWorker),
}));

vi.mock('../wikiWorker/index?utilityProcess', () => ({ default: vi.fn() }));

vi.mock('../wikiOperations/sender/sendWikiOperationsToBrowser', () => ({
  getSendWikiOperationsToBrowser: () => ({ [WikiChannel.generalNotification]: mocks.generalNotification }),
}));

vi.mock('@services/container', async () => {
  const actual = await vi.importActual<typeof import('@services/container')>('@services/container');
  return Object.assign({}, actual, {
    container: Object.assign(Object.create(Object.getPrototypeOf(actual.container)), actual.container, {
      get: vi.fn((identifier: symbol) => {
        const description = identifier.toString();
        if (description.includes('Symbol(Workspace)')) {
          return {
            ensureWikiFolderAccess: mocks.ensureWikiFolderAccess,
            get: mocks.getWorkspace,
          };
        }
        if (description.includes('Symbol(Sync)')) {
          return { stopIntervalSync: mocks.stopIntervalSync };
        }
        if (description.includes('Symbol(View)')) {
          return { forEachView: mocks.forEachView, getLoadedViewEnsure: mocks.getLoadedViewEnsure };
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return actual.container.get(identifier);
      }),
    }),
  });
});

import { Wiki } from '..';
import { wikiWorkerStartedEventName } from '../constants';
import type { WikiWorker } from '../wikiWorker';

function createWikiService(): Wiki {
  return new Wiki(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe('Wiki shutdown lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.terminateWorker.mockResolvedValue(undefined);
    mocks.ensureWikiFolderAccess.mockResolvedValue(undefined);
    mocks.getWorkspace.mockResolvedValue({
      id: 'pending',
      wikiFolderLocation: '/wikis/pending',
      workspaceType: 'folder',
    });
    mocks.getLoadedViewEnsure.mockResolvedValue(undefined);
  });

  it('sends HTML wiki browser operations without waiting for a nonexistent Node worker', async () => {
    vi.useFakeTimers();
    mocks.getWorkspace.mockResolvedValue({ id: 'html', wikiFolderLocation: '/wikis/wiki.html', workspaceType: 'html' });
    const wiki = createWikiService();
    const getWorker = vi.spyOn(wiki, 'getWorker');
    const pending = wiki.wikiOperationInBrowser(WikiChannel.generalNotification, 'html', ['Restart complete']);
    await vi.advanceTimersByTimeAsync(0);
    expect(getWorker).not.toHaveBeenCalled();
    expect(mocks.getLoadedViewEnsure).toHaveBeenCalledWith('html', 'main');
    expect(mocks.generalNotification).toHaveBeenCalledWith('Restart complete');
    await pending;
  });

  it('still waits for a folder worker and its loaded view before browser operations', async () => {
    const wiki = createWikiService();
    const getWorker = vi.spyOn(wiki, 'getWorker').mockReturnValue({} as WikiWorker);
    let markLoaded!: () => void;
    mocks.getLoadedViewEnsure.mockReturnValue(
      new Promise<void>((resolve) => {
        markLoaded = resolve;
      }),
    );
    const pending = wiki.wikiOperationInBrowser(WikiChannel.generalNotification, 'pending', ['Restart complete']);
    await vi.waitFor(() => {
      expect(mocks.getLoadedViewEnsure).toHaveBeenCalledWith('pending', 'main');
    });
    expect(getWorker).toHaveBeenCalledWith('pending');
    expect(mocks.generalNotification).not.toHaveBeenCalled();
    markLoaded();
    await pending;
    expect(mocks.generalNotification).toHaveBeenCalledWith('Restart complete');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('bounds missing-worker waits and removes the stale startup listener', async () => {
    vi.useFakeTimers();
    const wiki = createWikiService();
    const events = (wiki as unknown as { wikiWorkerStartedEventTarget: EventTarget }).wikiWorkerStartedEventTarget;
    const remove = vi.spyOn(events, 'removeEventListener');
    const pending = wiki.wikiOperationInServer(WikiChannel.runFilter, 'failed', ['[all[tiddlers]]']);
    const failure = expect(pending).rejects.toThrow('Wiki worker unavailable for workspace failed');
    await vi.advanceTimersByTimeAsync(10_000);
    await failure;
    expect(remove).toHaveBeenCalledWith(wikiWorkerStartedEventName('failed'), expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows a worker that starts during the wait and clears the deadline', async () => {
    vi.useFakeTimers();
    const wiki = createWikiService();
    const getWorker = vi.spyOn(wiki, 'getWorker').mockReturnValue(undefined);
    const pending = wiki.wikiOperationInServer(WikiChannel.runFilter, 'starting', ['[all[tiddlers]]']);
    await vi.advanceTimersByTimeAsync(0);
    const wikiOperation = vi.fn().mockResolvedValue(['Loaded']);
    getWorker.mockReturnValue({ wikiOperation } as unknown as WikiWorker);
    const events = (wiki as unknown as { wikiWorkerStartedEventTarget: EventTarget }).wikiWorkerStartedEventTarget;
    events.dispatchEvent(new Event(wikiWorkerStartedEventName('starting')));
    await expect(pending).resolves.toEqual(['Loaded']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports missing-worker failures to change observers without an unhandled rejection', async () => {
    vi.useFakeTimers();
    const wiki = createWikiService();
    const error = vi.fn();
    wiki.getWikiChangeObserver$('failed').subscribe({ error });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'Wiki worker unavailable for workspace failed' }));
  });

  it('does not charge permission-wait time to the worker availability deadline', async () => {
    vi.useFakeTimers();
    let grant!: () => void;
    mocks.ensureWikiFolderAccess.mockReturnValue(
      new Promise<void>((resolve) => {
        grant = resolve;
      }),
    );
    const wiki = createWikiService();
    const getWorker = vi.spyOn(wiki, 'getWorker').mockReturnValue(undefined);
    const pending = wiki.wikiOperationInServer(WikiChannel.runFilter, 'pending', ['[all[tiddlers]]']);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(vi.getTimerCount()).toBe(0);
    getWorker.mockReturnValue({ wikiOperation: vi.fn().mockResolvedValue(['Loaded']) } as unknown as WikiWorker);
    grant();
    await expect(pending).resolves.toEqual(['Loaded']);
  });

  it('cancels a pending boot before terminating and skips beforeExit for an unbooted worker', async () => {
    const wiki = createWikiService();
    const nativeWorker = Object.assign(new EventEmitter(), {
      kill: mocks.workerKill,
      pid: 42,
      removeAllListeners: EventEmitter.prototype.removeAllListeners,
    });
    const rejectStartWiki = vi.fn();
    const beforeExit = vi.fn(() => new Promise<void>(() => undefined));
    // Exercise the shutdown state machine without forking a real UtilityProcess.
    (wiki as unknown as { wikiWorkers: Record<string, unknown> }).wikiWorkers = {
      pending: {
        booted: false,
        detachWorker: mocks.detachWorker,
        nativeWorker,
        proxy: { beforeExit },
        rejectStartWiki,
      },
    };

    await wiki.stopAllWiki();

    expect(rejectStartWiki).toHaveBeenCalledOnce();
    expect((rejectStartWiki.mock.calls[0][0] as Error).message).toContain('shutting down');
    expect(beforeExit).not.toHaveBeenCalled();
    expect(mocks.terminateWorker).toHaveBeenCalledWith(nativeWorker);
    expect(mocks.detachWorker).toHaveBeenCalledOnce();
    expect((wiki as unknown as { wikiWorkers: Record<string, unknown> }).wikiWorkers).toEqual({});
    await expect(wiki.startWiki('later', 'tester')).rejects.toThrow('shutting down');
  });

  it('rejects an in-flight document request before stopping its worker without cancelling a replacement worker', async () => {
    const wiki = createWikiService();
    const nativeWorker = Object.assign(new EventEmitter(), { kill: mocks.workerKill, pid: 42 });
    const getIndex = vi.fn(() => new Promise<never>(() => undefined));
    const workers: Record<string, unknown> = {
      pending: {
        booted: false,
        detachWorker: mocks.detachWorker,
        nativeWorker,
        proxy: { getIndex },
      },
    };
    (wiki as unknown as { wikiWorkers: Record<string, unknown> }).wikiWorkers = workers;
    const pending = wiki.callWikiIpcServerRoute('pending', 'getIndex', '');
    const failure = expect(pending).rejects.toThrow('stopped during workspace restart');
    await vi.waitFor(() => {
      expect(getIndex).toHaveBeenCalledOnce();
    });
    await wiki.stopWiki('pending');
    await failure;

    const response = { statusCode: 200, headers: { 'Content-Type': 'text/html' }, data: '<html>replacement</html>' };
    workers.pending = {
      booted: true,
      nativeWorker: Object.assign(new EventEmitter(), { pid: 43 }),
      proxy: { getIndex: vi.fn(async () => response) },
    };
    await expect(wiki.callWikiIpcServerRoute('pending', 'getIndex', '')).resolves.toEqual(response);
  });

  it('bounds a live worker that never answers and discards a late answer', async () => {
    vi.useFakeTimers();
    const wiki = createWikiService();
    const delayed = Promise.withResolvers<{ statusCode: number }>();
    vi.spyOn(wiki, 'getWorker').mockReturnValue({ getIndex: () => delayed.promise } as unknown as WikiWorker);
    const request = wiki.callWikiIpcServerRoute('pending', 'getIndex', '');
    const failure = expect(request).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(30_000);
    await failure;
    delayed.resolve({ statusCode: 200 });
    await vi.advanceTimersByTimeAsync(1);
    await expect(request).rejects.toThrow('timed out');
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['main', 'secondary', 'server', 'unavailable'] as const)('refuses sync/restart while %s has unconfirmed saves', async dirtyLocation => {
    vi.useFakeTimers();
    const wiki = createWikiService();
    const main = vi.fn().mockResolvedValue(dirtyLocation !== 'main');
    const secondary = vi.fn().mockResolvedValue(dirtyLocation !== 'secondary');
    mocks.forEachView.mockImplementation((visit: (view: unknown, id: string) => void) => {
      for (const executeJavaScript of [main, secondary]) {
        visit({ webContents: { isDestroyed: () => false, executeJavaScript } }, 'pending');
      }
    });
    vi.spyOn(wiki, 'callWikiIpcServerRoute').mockImplementation(async () => {
      if (dirtyLocation === 'unavailable') return await new Promise<never>(() => {});
      return { data: dirtyLocation === 'server' ? 'pending' : 'saved' };
    });
    const failure = expect(wiki.waitForPendingSaves('pending')).rejects.toThrow(/unsaved|timed out/);
    await vi.advanceTimersByTimeAsync(30_000);
    await failure;
    expect(main).toHaveBeenCalled();
    expect(secondary).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('drains all live views and then verifies the filesystem syncer', async () => {
    vi.useFakeTimers();
    const wiki = createWikiService();
    const probe = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    mocks.forEachView.mockImplementation((visit: (view: unknown, id: string) => void) => {
      visit({ webContents: { isDestroyed: () => false, executeJavaScript: probe } }, 'pending');
    });
    const server = vi.spyOn(wiki, 'callWikiIpcServerRoute').mockResolvedValue({ data: 'saved' });
    const drain = wiki.waitForPendingSaves('pending');
    await vi.advanceTimersByTimeAsync(100);
    await drain;
    expect(probe).toHaveBeenCalledTimes(2);
    expect(server).toHaveBeenCalledWith('pending', 'getSaveStatus');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows startup sync only when neither worker nor live renderer exists', async () => {
    const wiki = createWikiService();
    mocks.forEachView.mockImplementation(() => {});
    const probe = vi.spyOn(wiki, 'callWikiIpcServerRoute');
    await expect(wiki.waitForPendingSaves('pending')).resolves.toBeUndefined();
    expect(probe).not.toHaveBeenCalled();
  });
});
