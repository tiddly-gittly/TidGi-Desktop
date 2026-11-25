import { EventEmitter } from 'node:events';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MacFolderAccess, probeMacDirectory } from '../macFolderAccess';

vi.mock('electron', () => ({ app: { getPath: vi.fn() } }));
const startProbe = vi.hoisted(() => vi.fn());
vi.mock('../macFolderProbeWorker?utilityProcess', () => ({ default: startProbe }));

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createAccess(readDirectory = vi.fn().mockResolvedValue(undefined), platform: NodeJS.Platform = 'darwin') {
  return new MacFolderAccess({ platform, protectedFolders: () => ['/Users/test/Desktop', '/Users/test/Documents', '/Users/test/Downloads'], readDirectory });
}

describe('macOS folder access consent', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not probe other platforms or similarly named unprotected folders', async () => {
    const read = vi.fn().mockResolvedValue(undefined);
    await createAccess(read, 'linux').waitForAccess('/Users/test/Desktop/wiki');
    await createAccess(read).waitForAccess('/Users/test/Desktop-backup/wiki');
    expect(read).not.toHaveBeenCalled();
  });

  it('shares a pending request for the same workspace and checks other workspaces separately', async () => {
    vi.useFakeTimers();
    const consent = deferred();
    const read = vi.fn(() => consent.promise);
    const access = createAccess(read);
    let completed = false;
    const first = access.waitForAccess('/Users/test/Desktop/wiki').then(() => {
      completed = true;
    });
    const second = access.waitForAccess('/Users/test/Desktop/wiki/.');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(completed).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(read.mock.calls).toEqual([[path.resolve('/Users/test/Desktop/wiki')]]);
    consent.resolve();
    await Promise.all([first, second]);
    await access.waitForAccess('/Users/test/Desktop/wiki');
    await access.waitForAccess('/Users/test/Desktop/calendar');
    expect(completed).toBe(true);
    expect(read.mock.calls).toEqual([[path.resolve('/Users/test/Desktop/wiki')], [path.resolve('/Users/test/Desktop/calendar')]]);
  });

  it('allows a denied request to be retried after settings change', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('EACCES')).mockResolvedValue(undefined);
    const access = createAccess(read);
    await expect(access.waitForAccess('/Users/test/Documents/wiki')).rejects.toThrow('EACCES');
    await expect(access.waitForAccess('/Users/test/Documents/wiki')).resolves.toBeUndefined();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('cancels a shutdown waiter without cancelling another caller or leaking a late rejection', async () => {
    const consent = deferred();
    const access = createAccess(vi.fn(() => consent.promise));
    const controller = new AbortController();
    const cancelled = access.waitForAccess('/Users/test/Downloads/wiki', controller.signal);
    const other = access.waitForAccess('/Users/test/Downloads/wiki');
    const cancellation = expect(cancelled).rejects.toThrow('shutdown');
    controller.abort(new Error('shutdown'));
    await cancellation;
    const denial = expect(other).rejects.toThrow('denied');
    consent.reject(new Error('denied'));
    await denial;
  });

  it('does not start a consent request for an already cancelled caller', async () => {
    const read = vi.fn().mockResolvedValue(undefined);
    const controller = new AbortController();
    controller.abort(new Error('shutdown'));
    await expect(createAccess(read).waitForAccess('/Users/test/Desktop/wiki', controller.signal)).rejects.toThrow('shutdown');
    expect(read).not.toHaveBeenCalled();
  });

  it('preserves a denied folder error and terminates a pending utility process on quit', async () => {
    const denial = Object.assign(new EventEmitter(), { kill: vi.fn() });
    const pending = Object.assign(new EventEmitter(), { kill: vi.fn() });
    startProbe.mockReset().mockReturnValueOnce(denial).mockReturnValueOnce(pending);
    const shutdown = new AbortController();

    const denied = expect(probeMacDirectory('/Users/test/Desktop', shutdown.signal)).rejects.toMatchObject({ code: 'EPERM' });
    await vi.waitFor(() => {
      expect(startProbe).toHaveBeenCalledTimes(1);
    });
    denial.emit('message', { name: 'Error', message: 'Operation not permitted', code: 'EPERM' });
    denial.emit('exit', 0);
    await denied;

    const cancelled = expect(probeMacDirectory('/Users/test/Documents', shutdown.signal)).rejects.toThrow('application shutdown');
    await vi.waitFor(() => {
      expect(startProbe).toHaveBeenCalledTimes(2);
    });
    shutdown.abort();
    await cancelled;
    expect(pending.kill).toHaveBeenCalledOnce();
    pending.emit('spawn');
    expect(pending.kill).toHaveBeenCalledTimes(2);
    pending.emit('exit', 0);
  });
});
