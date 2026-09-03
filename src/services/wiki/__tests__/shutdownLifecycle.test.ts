import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  detachWorker: vi.fn(),
  stopIntervalSync: vi.fn(),
  terminateWorker: vi.fn().mockResolvedValue(undefined),
  workerKill: vi.fn(),
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
