import type { TiddlyWiki } from 'tiddlywiki';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWikiWorkerLifecycleMessage, WikiWorkerLifecycleTracker } from '../../workerLifecycle';
import { installTiddlyWikiStartupObserver } from '../tiddlyWikiStartupObserver';

function createFakeWiki() {
  const pluginStore = {
    defineShadowModules: vi.fn(),
    defineTiddlerModules: vi.fn(),
    readPluginInfo: vi.fn(),
    registerPluginTiddlers: vi.fn(),
    unpackPluginTiddlers: vi.fn(),
  };
  const boot = {
    execStartup: vi.fn(),
    executeNextStartupTask(callback?: () => void) {
      const task = this.remainingStartupModules.shift();
      if (task === undefined) {
        callback?.();
        return false;
      }
      task.startup?.();
      return true;
    },
    initStartup: vi.fn(),
    isStartupTaskEligible: vi.fn(() => true),
    loadStartup: vi.fn(),
    remainingStartupModules: [] as Array<{ name?: string; startup?: () => unknown }>,
  };
  const wikiInstance = {
    boot,
    loadPlugin: vi.fn(),
    loadPluginFolder: vi.fn(),
    loadTiddlersFromFile: vi.fn(),
    loadTiddlersNode: vi.fn(),
    loadWikiTiddlers: vi.fn(),
  } as unknown as ReturnType<typeof TiddlyWiki>;
  boot.initStartup.mockImplementation(() => {
    (wikiInstance as unknown as { wiki: typeof pluginStore }).wiki = pluginStore;
  });
  return { boot, pluginStore, wiki: wikiInstance };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('installTiddlyWikiStartupObserver', () => {
  it('traces synchronous phase begin and end without changing its return value', () => {
    const { boot, wiki } = createFakeWiki();
    boot.initStartup.mockImplementation(() => {
      (wiki as unknown as { wiki: object }).wiki = {};
      return 'result';
    });
    const trace = vi.fn();
    installTiddlyWikiStartupObserver(wiki, trace);

    const result = (wiki.boot.initStartup as unknown as () => unknown)();

    expect(result).toBe('result');
    expect(trace).toHaveBeenNthCalledWith(1, 'debug', 'TiddlyWiki phase begin: boot.initStartup');
    expect(trace).toHaveBeenNthCalledWith(2, 'debug', 'TiddlyWiki phase end: boot.initStartup');
  });

  it('supports the real pre-init shape and observes plugin stores only after initStartup succeeds', () => {
    const { pluginStore, wiki } = createFakeWiki();
    const trace = vi.fn();

    expect(() => {
      installTiddlyWikiStartupObserver(wiki, trace);
    }).not.toThrow();
    expect((wiki as unknown as { wiki?: unknown }).wiki).toBeUndefined();

    (wiki.boot.initStartup as unknown as () => void)();
    pluginStore.registerPluginTiddlers();

    expect(trace).toHaveBeenCalledWith('debug', 'TiddlyWiki phase begin: plugins.register');
    expect(trace).toHaveBeenCalledWith('debug', 'TiddlyWiki phase end: plugins.register');
  });

  it('does not change initStartup completion when a wiki store is unavailable', () => {
    const { boot, wiki } = createFakeWiki();
    boot.initStartup.mockImplementation(() => 'result-without-store');
    const trace = vi.fn();
    installTiddlyWikiStartupObserver(wiki, trace);

    const result = (wiki.boot.initStartup as unknown as () => unknown)();

    expect(result).toBe('result-without-store');
    expect(trace).toHaveBeenCalledWith('warn', 'TiddlyWiki store observers skipped after initStartup: wiki store unavailable');
  });

  it('traces plugin loads with a sequence and basename but no full path', () => {
    const { wiki } = createFakeWiki();
    const originalLoadTiddlersFromFile = wiki.loadTiddlersFromFile;
    const trace = vi.fn();
    installTiddlyWikiStartupObserver(wiki, trace);
    (wiki.boot.initStartup as unknown as () => void)();

    (wiki.loadPluginFolder as unknown as (folder: string) => void)('/Users/fixture/secret/plugins/plugin-one');
    (wiki.loadPlugin as unknown as (name: string) => void)('@scope/plugin-two');

    expect(trace).toHaveBeenCalledWith('debug', 'TiddlyWiki phase begin: loadPluginFolder #1 (plugins/plugin-one)');
    expect(trace).toHaveBeenCalledWith('debug', 'TiddlyWiki phase begin: loadPlugin #1 (@scope/plugin-two)');
    expect(wiki.loadTiddlersFromFile).toBe(originalLoadTiddlersFromFile);
    expect(trace.mock.calls.flat().join(' ')).not.toContain('/Users/fixture/secret');
  });

  it('reports a pending asynchronous startup task after the diagnostic deadline', async () => {
    vi.useFakeTimers();
    const { boot, wiki } = createFakeWiki();
    boot.remainingStartupModules.push({ name: 'fixture-slow-task', startup: () => new Promise(() => undefined) });
    const trace = vi.fn();
    installTiddlyWikiStartupObserver(wiki, trace);

    (wiki.boot as unknown as { executeNextStartupTask(): boolean }).executeNextStartupTask();
    await vi.advanceTimersByTimeAsync(15_000);

    expect(trace).toHaveBeenCalledWith('debug', 'TiddlyWiki startup task begin: fixture-slow-task');
    expect(trace).toHaveBeenCalledWith('warn', 'TiddlyWiki startup task pending after 15000 ms: fixture-slow-task');
  });

  it('reports a rejected asynchronous startup task without continuing it', async () => {
    const { boot, wiki } = createFakeWiki();
    const rejectedError = new Error('fixture rejection');
    let continuationCalled = false;
    const lifecycleMessages: unknown[] = [];
    const lifecycleTracker = new WikiWorkerLifecycleTracker('fixture-wiki', 'fixture-generation');
    const terminateWorkerBounded = vi.fn(async () => undefined);
    const hostCleanup = lifecycleTracker.booted.catch(async () => {
      await terminateWorkerBounded();
    });
    boot.executeNextStartupTask = function(callback?: () => void) {
      const task = this.remainingStartupModules.shift();
      const result = task?.startup?.();
      if (typeof (result as PromiseLike<unknown> | undefined)?.then === 'function') {
        void (result as PromiseLike<unknown>).then(() => {
          continuationCalled = true;
          callback?.();
        });
      }
      return task !== undefined;
    };
    boot.remainingStartupModules.push({ name: 'fixture-rejected-task', startup: () => Promise.reject(rejectedError) });
    const trace = vi.fn();
    const onFatal = vi.fn((error: Error) => {
      const message = createWikiWorkerLifecycleMessage('boot-error', 'fixture-generation', 'fixture-wiki', error.message);
      lifecycleMessages.push(message);
      lifecycleTracker.accept(message);
    });
    installTiddlyWikiStartupObserver(wiki, trace, onFatal);

    (wiki.boot as unknown as { executeNextStartupTask(): boolean }).executeNextStartupTask();
    await Promise.resolve();
    await Promise.resolve();
    await hostCleanup;

    expect(onFatal).toHaveBeenCalledOnce();
    expect(onFatal).toHaveBeenCalledWith(rejectedError);
    expect(lifecycleMessages).toEqual([
      createWikiWorkerLifecycleMessage('boot-error', 'fixture-generation', 'fixture-wiki', 'fixture rejection'),
    ]);
    expect(terminateWorkerBounded).toHaveBeenCalledOnce();
    expect(continuationCalled).toBe(false);
    expect(trace).toHaveBeenCalledWith('warn', 'TiddlyWiki startup task rejected: fixture-rejected-task: fixture rejection');
  });

  it('preserves a synchronous startup throw without invoking the asynchronous fatal reporter', () => {
    const { boot, wiki } = createFakeWiki();
    const thrownError = new Error('fixture synchronous throw');
    boot.remainingStartupModules.push({
      name: 'fixture-sync-task',
      startup: () => {
        throw thrownError;
      },
    });
    const onFatal = vi.fn();
    installTiddlyWikiStartupObserver(wiki, vi.fn(), onFatal);

    expect(() => (wiki.boot as unknown as { executeNextStartupTask(): boolean }).executeNextStartupTask()).toThrow(thrownError);
    expect(onFatal).not.toHaveBeenCalled();
  });
});
