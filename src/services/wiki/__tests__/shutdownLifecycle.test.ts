import { WikiChannel } from '@/constants/channels';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  detachWorker: vi.fn(),
  stopIntervalSync: vi.fn(),
  terminateWorker: vi.fn().mockResolvedValue(undefined),
  workerKill: vi.fn(),
  ensureWikiFolderAccess: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@services/container', async () => {
  const actual = await vi.importActual<typeof import('@services/container')>('@services/container');
  return Object.assign({}, actual, {
    container: Object.assign(Object.create(Object.getPrototypeOf(actual.container)), actual.container, {
      get: vi.fn((identifier: symbol) => {
        const description = identifier.toString();
        if (description.includes('Symbol(Workspace)')) {
          return {
            ensureWikiFolderAccess: mocks.ensureWikiFolderAccess,
            get: vi.fn().mockResolvedValue({
              id: 'pending',
              wikiFolderLocation: '/wikis/pending',
              workspaceType: 'folder',
            }),
          };
        }
        if (description.includes('Symbol(Sync)')) {
          return { stopIntervalSync: mocks.stopIntervalSync };
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
});
